import 'server-only'

import { cookies, headers } from 'next/headers'

import {
  decryptSecret,
  hashMasterPassword,
  isVaultEncryptionConfigured,
  issueVaultSession,
  verifyMasterPassword,
  verifyVaultSession,
} from '@/lib/crypto'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import type { VaultCredential } from '@/lib/types'

/**
 * Regras do Cofre de Senhas.
 *
 * Fluxo: Senha Mestre -> validada no servidor -> cookie httpOnly de 15 min
 * -> só então as credenciais são decifradas e enviadas. A senha mestre nunca
 * volta ao cliente, e as senhas só saem do servidor com sessão válida.
 */

export const VAULT_COOKIE = 'canali_vault_session'
const MASTER_PASSWORD_SETTING = 'vault_master_password'

/**
 * Hash da Senha Mestre.
 * Precedência: variável de ambiente (bootstrap/override) > app_settings
 * (permite ao time trocar a senha pelo admin sem redeploy).
 */
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

/** Grava/atualiza a Senha Mestre (usado pelo admin). */
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

/** Registra a tentativa de acesso — trilha de auditoria do cofre. */
async function logAccess(success: boolean): Promise<void> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return

  try {
    const headerList = await headers()
    await supabase.from('vault_access_log').insert({
      success,
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

export interface UnlockResult {
  ok: boolean
  message: string
}

/** Valida a Senha Mestre e, em caso de acerto, emite a sessão do cofre. */
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
  await logAccess(valid)

  if (!valid) return { ok: false, message: 'Senha Mestre incorreta.' }

  const session = issueVaultSession()
  const cookieStore = await cookies()

  cookieStore.set(VAULT_COOKIE, session.token, {
    httpOnly: true, // JS da página não lê o cookie — reduz superfície de XSS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor((session.expiresAt - Date.now()) / 1000),
  })

  return { ok: true, message: 'Cofre liberado por 15 minutos.' }
}

export async function lockVault(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(VAULT_COOKIE)
}

/** true quando a sessão do cofre está válida (assinatura + prazo). */
export async function hasVaultSession(): Promise<boolean> {
  if (!isVaultEncryptionConfigured()) return false
  const cookieStore = await cookies()
  return verifyVaultSession(cookieStore.get(VAULT_COOKIE)?.value)
}

/**
 * Lê e decifra as credenciais. Só devolve dados com sessão válida —
 * a checagem é feita aqui, não na rota, para não haver caminho sem ela.
 */
export async function getVaultCredentials(): Promise<VaultCredential[] | null> {
  if (!(await hasVaultSession())) return null

  const supabase = getSupabaseAdminClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('vault_credentials')
    .select('*')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({
    id: row.id,
    service_name: row.service_name,
    category: row.category,
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
}

/** Metadados das credenciais SEM as senhas — usado na listagem do admin. */
export async function getVaultCredentialsMetadata(): Promise<
  Omit<VaultCredential, 'password'>[]
> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('vault_credentials')
    .select('id, service_name, category, username, url, notes, extra, sort_order, updated_at')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  return (data ?? []).map((row) => ({
    id: row.id,
    service_name: row.service_name,
    category: row.category,
    username: row.username,
    url: row.url,
    notes: row.notes,
    extra: (row.extra ?? {}) as Record<string, string>,
    sort_order: row.sort_order,
    updated_at: row.updated_at,
  }))
}
