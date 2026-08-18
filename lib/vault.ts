import 'server-only'

import { cookies, headers } from 'next/headers'

import {
  decryptSecret,
  hashMasterPassword,
  hashPin,
  isVaultEncryptionConfigured,
  issueVaultSession,
  verifyMasterPassword,
  verifyPin,
  verifyVaultSession,
  type VaultScope,
} from '@/lib/crypto'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import type { CofrePerfil, CofrePerfilPublico, VaultAcesso, VaultCredential } from '@/lib/types'

/**
 * Regras do Cofre de Senhas.
 *
 * Dois caminhos de entrada:
 *   • Senha Mestre  -> acesso Master, enxerga tudo
 *   • Nome + PIN    -> acesso de perfil, enxerga só as subcategorias liberadas
 *
 * Nos dois casos o servidor valida, emite um cookie httpOnly de 15 minutos
 * e só então decifra as credenciais. Nem a senha nem o PIN voltam ao cliente.
 *
 * As permissões NÃO vão dentro do token: são lidas do banco a cada consulta,
 * então revogar um acesso no admin tem efeito imediato.
 */

export const VAULT_COOKIE = 'canali_vault_session'
const MASTER_PASSWORD_SETTING = 'vault_master_password'

/** Credencial sem subcategoria é sensível por padrão: só o Master vê. */
const SEM_SUBCATEGORIA_E_SO_DO_MASTER = true

// ---------------------------------------------------------------------------
//  Senha Mestre
// ---------------------------------------------------------------------------

async function getStoredMasterHash(): Promise<string | null> {
  const fromEnv = process.env.VAULT_MASTER_PASSWORD_HASH
  if (fromEnv) return fromEnv

  const supabase = getSupabaseAdminClient()
  if (!supabase) return null

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', MASTER_PASSWORD_SETTING)
    .maybeSingle()

  const value = data?.value as { hash?: string } | string | null | undefined
  if (!value) return null
  return typeof value === 'string' ? value : (value.hash ?? null)
}

export async function isVaultConfigured(): Promise<boolean> {
  if (!isVaultEncryptionConfigured()) return false
  return Boolean(await getStoredMasterHash())
}

export async function setMasterPassword(password: string): Promise<{ ok: boolean; message: string }> {
  if (password.length < 8) {
    return { ok: false, message: 'A Senha Mestre precisa ter ao menos 8 caracteres.' }
  }

  const supabase = getSupabaseAdminClient()
  if (!supabase) return { ok: false, message: 'Supabase não configurado.' }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: MASTER_PASSWORD_SETTING, value: { hash: hashMasterPassword(password) } })

  if (error) return { ok: false, message: `Erro ao salvar: ${error.message}` }

  if (process.env.VAULT_MASTER_PASSWORD_HASH) {
    return {
      ok: true,
      message:
        'Senha salva no banco, mas VAULT_MASTER_PASSWORD_HASH está definida e tem precedência. ' +
        'Remova a variável de ambiente para a nova senha valer.',
    }
  }

  return { ok: true, message: 'Senha Mestre atualizada.' }
}

// ---------------------------------------------------------------------------
//  Auditoria
// ---------------------------------------------------------------------------

async function logAccess(
  success: boolean,
  escopo: 'master' | 'perfil',
  perfilId?: string | null,
): Promise<void> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return

  try {
    const headerList = await headers()
    await supabase.from('vault_access_log').insert({
      success,
      escopo,
      perfil_id: perfilId ?? null,
      ip_address:
        headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        headerList.get('x-real-ip') ??
        null,
      user_agent: headerList.get('user-agent')?.slice(0, 300) ?? null,
    })
  } catch {
    // Auditoria é best-effort: nunca deve impedir o acesso legítimo.
  }
}

// ---------------------------------------------------------------------------
//  Abertura do cofre
// ---------------------------------------------------------------------------

export interface UnlockResult {
  ok: boolean
  message: string
}

async function emitirSessao(scope: VaultScope): Promise<void> {
  const session = issueVaultSession(scope)
  const cookieStore = await cookies()

  cookieStore.set(VAULT_COOKIE, session.token, {
    httpOnly: true, // JS da página não lê o cookie — reduz superfície de XSS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor((session.expiresAt - Date.now()) / 1000),
  })
}

/** Acesso Master pela Senha Mestre: enxerga todas as credenciais. */
export async function unlockVault(password: string): Promise<UnlockResult> {
  if (!isVaultEncryptionConfigured()) {
    return {
      ok: false,
      message: 'Cofre não configurado: falta VAULT_ENCRYPTION_KEY. Rode `npm run vault:keygen`.',
    }
  }

  const storedHash = await getStoredMasterHash()
  if (!storedHash) {
    return {
      ok: false,
      message:
        'Nenhuma Senha Mestre cadastrada. Defina VAULT_MASTER_PASSWORD_HASH ' +
        '(gere com `npm run vault:hash`) ou cadastre pelo painel admin.',
    }
  }

  const valid = verifyMasterPassword(password, storedHash)
  await logAccess(valid, 'master')

  if (!valid) return { ok: false, message: 'Senha Mestre incorreta.' }

  await emitirSessao({ kind: 'master' })
  return { ok: true, message: 'Cofre liberado por 15 minutos.' }
}

/**
 * Acesso individual por PIN.
 *
 * São 4 dígitos, ou seja 10.000 combinações: o scrypt encarece cada
 * tentativa, mas quem barra a força bruta de verdade é o bloqueio após 5
 * erros, contabilizado atomicamente no banco.
 */
export async function unlockVaultWithPin(perfilId: string, pin: string): Promise<UnlockResult> {
  if (!isVaultEncryptionConfigured()) {
    return { ok: false, message: 'Cofre não configurado: falta VAULT_ENCRYPTION_KEY.' }
  }

  const supabase = getSupabaseAdminClient()
  if (!supabase) return { ok: false, message: 'Supabase não configurado.' }

  const { data: perfil } = await supabase
    .from('cofre_perfis')
    .select('id, nome_colaborador, pin_hash, ativo, bloqueado_ate')
    .eq('id', perfilId)
    .maybeSingle()

  // Mensagem propositalmente genérica: não confirma se o perfil existe.
  if (!perfil || !perfil.ativo) {
    await logAccess(false, 'perfil', perfilId)
    return { ok: false, message: 'Perfil ou PIN inválido.' }
  }

  if (perfil.bloqueado_ate && new Date(perfil.bloqueado_ate) > new Date()) {
    const minutos = Math.max(
      1,
      Math.ceil((new Date(perfil.bloqueado_ate).getTime() - Date.now()) / 60000),
    )
    await logAccess(false, 'perfil', perfilId)
    return {
      ok: false,
      message: `Muitas tentativas erradas. Tente de novo em ${minutos} minuto(s) ou peça ao admin para liberar.`,
    }
  }

  const valid = verifyPin(pin, perfil.pin_hash)

  await supabase.rpc('cofre_registrar_tentativa', { p_perfil: perfilId, p_sucesso: valid })
  await logAccess(valid, 'perfil', perfilId)

  if (!valid) return { ok: false, message: 'Perfil ou PIN inválido.' }

  await emitirSessao({ kind: 'profile', profileId: perfilId })
  return { ok: true, message: `Cofre liberado para ${perfil.nome_colaborador} por 15 minutos.` }
}

export async function lockVault(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(VAULT_COOKIE)
}

// ---------------------------------------------------------------------------
//  Sessão corrente
// ---------------------------------------------------------------------------

/**
 * Quem está com o cofre aberto agora — e o que pode ver.
 * As permissões vêm do banco, não do token: mudar no admin vale na hora.
 */
export async function getVaultAcesso(): Promise<VaultAcesso | null> {
  if (!isVaultEncryptionConfigured()) return null

  const cookieStore = await cookies()
  const scope = verifyVaultSession(cookieStore.get(VAULT_COOKIE)?.value)
  if (!scope) return null

  if (scope.kind === 'master') return { tipo: 'master' }

  const supabase = getSupabaseAdminClient()
  if (!supabase) return null

  const { data: perfil } = await supabase
    .from('cofre_perfis')
    .select('id, nome_colaborador, subcategorias_permitidas, ativo')
    .eq('id', scope.profileId)
    .maybeSingle()

  // Perfil desativado ou apagado durante a sessão perde o acesso na hora.
  if (!perfil || !perfil.ativo) return null

  return {
    tipo: 'perfil',
    perfilId: perfil.id,
    nome: perfil.nome_colaborador,
    subcategorias: (perfil.subcategorias_permitidas ?? []) as string[],
  }
}

/** Compatibilidade: true quando existe qualquer sessão válida. */
export async function hasVaultSession(): Promise<boolean> {
  return (await getVaultAcesso()) !== null
}

/** true apenas para o acesso Master — é o que o admin exige para escrever. */
export async function hasMasterSession(): Promise<boolean> {
  const acesso = await getVaultAcesso()
  return acesso?.tipo === 'master'
}

// ---------------------------------------------------------------------------
//  Leitura das credenciais
// ---------------------------------------------------------------------------

export interface VaultConteudo {
  acesso: VaultAcesso
  credenciais: VaultCredential[]
  /** Subcategorias presentes no que este acesso enxerga — alimenta os filtros. */
  subcategorias: string[]
  /** Quantas credenciais ficaram de fora por falta de permissão. */
  ocultas: number
}

/**
 * Lê e decifra as credenciais visíveis para a sessão atual.
 *
 * A filtragem acontece AQUI, no servidor: o cliente nunca recebe uma
 * credencial que não pode ver, nem para depois escondê-la na interface.
 */
export async function getVaultConteudo(): Promise<VaultConteudo | null> {
  const acesso = await getVaultAcesso()
  if (!acesso) return null

  const supabase = getSupabaseAdminClient()
  if (!supabase) return { acesso, credenciais: [], subcategorias: [], ocultas: 0 }

  const { data, error } = await supabase
    .from('vault_credentials')
    .select('*')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error || !data) return { acesso, credenciais: [], subcategorias: [], ocultas: 0 }

  const permitidas =
    acesso.tipo === 'perfil' ? new Set(acesso.subcategorias) : null

  const visiveis = data.filter((row) => {
    if (permitidas === null) return true // Master vê tudo

    const sub = row.subcategoria as string | null
    if (!sub) return !SEM_SUBCATEGORIA_E_SO_DO_MASTER
    return permitidas.has(sub)
  })

  const credenciais: VaultCredential[] = visiveis.map((row) => ({
    id: row.id,
    service_name: row.service_name,
    category: row.category,
    subcategoria: (row.subcategoria as string | null) ?? null,
    username: row.username,
    // Payload corrompido ou chave trocada devolve o aviso em vez de derrubar a página.
    password: row.password_encrypted
      ? (decryptSecret(row.password_encrypted) ?? '⚠️ falha ao decifrar')
      : null,
    url: row.url,
    notes: row.notes,
    extra: (row.extra ?? {}) as Record<string, string>,
    sort_order: row.sort_order,
    updated_at: row.updated_at,
  }))

  const subcategorias = [
    ...new Set(credenciais.map((c) => c.subcategoria).filter((s): s is string => Boolean(s))),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return {
    acesso,
    credenciais,
    subcategorias,
    ocultas: data.length - visiveis.length,
  }
}

/** Metadados SEM as senhas — usado na listagem do admin. */
export async function getVaultCredentialsMetadata(): Promise<
  Omit<VaultCredential, 'password'>[]
> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('vault_credentials')
    .select('id, service_name, category, subcategoria, username, url, notes, extra, sort_order, updated_at')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  return (data ?? []).map((row) => ({
    id: row.id,
    service_name: row.service_name,
    category: row.category,
    subcategoria: (row.subcategoria as string | null) ?? null,
    username: row.username,
    url: row.url,
    notes: row.notes,
    extra: (row.extra ?? {}) as Record<string, string>,
    sort_order: row.sort_order,
    updated_at: row.updated_at,
  }))
}

/** Subcategorias já usadas — alimenta os checkboxes e o autocomplete do admin. */
export async function listSubcategorias(): Promise<string[]> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('vault_credentials')
    .select('subcategoria')
    .not('subcategoria', 'is', null)

  const nomes = new Set<string>()
  for (const row of data ?? []) {
    const sub = (row.subcategoria as string | null)?.trim()
    if (sub) nomes.add(sub)
  }

  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

// ---------------------------------------------------------------------------
//  Perfis de acesso
// ---------------------------------------------------------------------------

/**
 * Lista para o modal da Home: só id e nome.
 * O hash do PIN e as permissões nunca saem do servidor.
 */
export async function listVaultProfilesPublic(): Promise<CofrePerfilPublico[]> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('cofre_perfis')
    .select('id, nome_colaborador')
    .eq('ativo', true)
    .order('nome_colaborador', { ascending: true })

  return (data ?? []) as CofrePerfilPublico[]
}

/** Lista completa para o admin — ainda sem o hash do PIN. */
export async function listVaultProfiles(): Promise<CofrePerfil[]> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('cofre_perfis')
    .select(
      'id, nome_colaborador, subcategorias_permitidas, ativo, tentativas_falhas, bloqueado_ate, ultimo_acesso_em, created_at, updated_at',
    )
    .order('nome_colaborador', { ascending: true })

  return (data ?? []).map((row) => ({
    ...row,
    subcategorias_permitidas: (row.subcategorias_permitidas ?? []) as string[],
  })) as CofrePerfil[]
}

export interface SalvarPerfilInput {
  id?: string | null
  nome: string
  /** Vazio ao editar = mantém o PIN atual. */
  pin?: string
  subcategorias: string[]
  ativo: boolean
}

export async function salvarPerfil(input: SalvarPerfilInput): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return { ok: false, message: 'Supabase não configurado.' }

  const pin = (input.pin ?? '').trim()

  if (!input.id && !pin) {
    return { ok: false, message: 'Defina um PIN de 4 dígitos para o novo perfil.' }
  }
  if (pin && !/^\d{4}$/.test(pin)) {
    return { ok: false, message: 'O PIN precisa ter exatamente 4 dígitos.' }
  }

  const payload: Record<string, unknown> = {
    nome_colaborador: input.nome,
    subcategorias_permitidas: input.subcategorias,
    ativo: input.ativo,
  }

  // Trocar o PIN zera o bloqueio: é o caminho do admin para destravar alguém.
  if (pin) {
    payload.pin_hash = hashPin(pin)
    payload.tentativas_falhas = 0
    payload.bloqueado_ate = null
  }

  const { error } = input.id
    ? await supabase.from('cofre_perfis').update(payload).eq('id', input.id)
    : await supabase.from('cofre_perfis').insert(payload)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, message: 'Já existe um perfil com esse nome.' }
    }
    return { ok: false, message: `Erro ao salvar perfil: ${error.message}` }
  }

  return {
    ok: true,
    message: input.id ? 'Perfil atualizado.' : `Perfil de ${input.nome} criado.`,
  }
}

export async function excluirPerfil(id: string): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return { ok: false, message: 'Supabase não configurado.' }

  const { error } = await supabase.from('cofre_perfis').delete().eq('id', id)
  if (error) return { ok: false, message: `Erro ao excluir: ${error.message}` }

  return { ok: true, message: 'Perfil excluído.' }
}

/** Libera um perfil bloqueado por excesso de tentativas. */
export async function desbloquearPerfil(id: string): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return { ok: false, message: 'Supabase não configurado.' }

  const { error } = await supabase
    .from('cofre_perfis')
    .update({ tentativas_falhas: 0, bloqueado_ate: null })
    .eq('id', id)

  if (error) return { ok: false, message: `Erro ao desbloquear: ${error.message}` }
  return { ok: true, message: 'Perfil desbloqueado.' }
}
