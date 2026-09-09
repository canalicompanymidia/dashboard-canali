'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

import {
  annualGoalSchema,
  cofrePerfilSchema,
  colaboradorSchema,
  documentCategorySchema,
  documentSchema,
  firstIssueMessage,
  formDataToObject,
  manualPlatformRevenueSchema,
  marketingActionSchema,
  masterPasswordSchema,
  monthlyFinancialSchema,
  vaultCredentialSchema,
} from '@/lib/admin/schemas'
import type { ActionState } from '@/lib/admin/types'
import { buscarColaborador, getColaborador } from '@/lib/auth'
import { encryptSecret, isVaultEncryptionConfigured } from '@/lib/crypto'
import { PLATFORM_LABELS } from '@/lib/calculations'
import { syncMetaAdsSpend } from '@/lib/integrations/meta-ads'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { formatCurrency, slugify } from '@/lib/utils'
import {
  desbloquearPerfil,
  excluirPerfil,
  hasMasterSession,
  salvarPerfil,
  setMasterPassword,
} from '@/lib/vault'

/**
 * Server Actions do painel administrativo.
 *
 * Toda escrita passa por aqui: valida com zod, usa a service_role (que só
 * existe no servidor) e revalida as rotas afetadas para a Home refletir a
 * mudança na hora.
 */

const NO_DB: ActionState = {
  ok: false,
  message: 'Supabase não configurado. Defina SUPABASE_SERVICE_ROLE_KEY para gravar dados.',
}

/** Revalida a Home e a rota do admin correspondente. */
function revalidate(adminPath?: string) {
  revalidatePath('/')
  if (adminPath) revalidatePath(adminPath)
}

function fail(message: string): ActionState {
  return { ok: false, message }
}

function done(message: string): ActionState {
  return { ok: true, message }
}

/** Base da URL desta instalação — os links de e-mail precisam voltar para cá. */
async function origemDaRequisicao(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const protocolo = h.get('x-forwarded-proto') ?? 'https'
  return `${protocolo}://${host}`
}

// ---------------------------------------------------------------------------
//  ACESSO — quem pode entrar no Hub
// ---------------------------------------------------------------------------

/**
 * Cadastra ou atualiza um colaborador autorizado.
 *
 * As Server Actions são endpoints HTTP de verdade: o layout do /admin
 * barra a NAVEGAÇÃO, mas não a chamada direta desta função. Por isso a
 * permissão é conferida aqui dentro também — e ainda mais nesta, que é a
 * que decide quem entra no Hub.
 */
export async function saveColaborador(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const autor = await getColaborador()
  if (autor?.papel !== 'admin') return fail('Apenas administradores podem alterar acessos.')

  const parsed = colaboradorSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return fail(firstIssueMessage(parsed.error))

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { id, email, nome, papel, ativo } = parsed.data

  // Rebaixar ou desativar a si mesmo tranca o último admin para fora do
  // painel, sem caminho de volta pela interface.
  const ehVoceMesmo = email === autor.email
  if (ehVoceMesmo && (papel !== 'admin' || !ativo)) {
    return fail('Você não pode remover o próprio acesso de administrador.')
  }

  const payload = { email, nome, papel, ativo }

  const { error } = id
    ? await supabase.from('colaboradores_autorizados').update(payload).eq('id', id)
    : await supabase.from('colaboradores_autorizados').insert(payload)

  if (error) {
    if (error.code === '23505') return fail('Este e-mail já está cadastrado.')
    return fail(`Erro ao salvar acesso: ${error.message}`)
  }

  revalidate('/admin/colaboradores')
  return done(
    id ? `Acesso de ${email} atualizado.` : `${email} agora pode entrar no Hub.`,
  )
}

/**
 * Traduz a falha de envio de e-mail em algo que o admin consiga agir.
 *
 * O Supabase devolve "Error sending invite email" para praticamente
 * qualquer problema de SMTP — mensagem que não diz o que fazer. Estas
 * são as causas reais, na ordem em que costumam acontecer.
 */
function explicarFalhaDeEnvio(
  erro: { message: string; status?: number },
  email: string,
): string {
  const msg = erro.message.toLowerCase()

  if (erro.status === 429 || /rate.?limit|too many/.test(msg)) {
    return (
      'Limite de envio atingido. Espere alguns minutos, ou aumente o teto em ' +
      'Authentication → Rate Limits no painel do Supabase.'
    )
  }

  if (/not authorized|not allowed|unauthorized/.test(msg)) {
    return (
      `O Supabase recusou enviar para ${email}. Sem um SMTP próprio configurado, ele só ` +
      'entrega e-mail para membros da sua organização no Supabase. Configure em ' +
      'Authentication → SMTP Settings.'
    )
  }

  if (/sending|smtp|mail|relay/.test(msg)) {
    return (
      'O servidor de e-mail recusou a mensagem. Confira, nesta ordem: ' +
      '(1) SMTP configurado e ativo em Authentication → SMTP Settings; ' +
      '(2) domínio verificado no provedor de e-mail; ' +
      '(3) o remetente (From) pertence a esse domínio verificado. ' +
      `O motivo exato aparece em Logs → Auth, no Supabase. [${erro.message}]`
    )
  }

  return `Falha no envio: ${erro.message}. O erro completo aparece em Logs → Auth, no Supabase.`
}

/**
 * Dispara o e-mail para a pessoa criar (ou recriar) a senha dela.
 *
 * Um botão só para os dois casos: quem nunca entrou recebe um convite,
 * quem já tem conta recebe um link de redefinição. O Supabase recusa
 * convidar um e-mail já cadastrado, então a segunda tentativa cobre esse
 * retorno em vez de devolver um erro que o admin não saberia interpretar.
 */
export async function enviarAcesso(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const autor = await getColaborador()
  if (autor?.papel !== 'admin') return fail('Apenas administradores podem enviar acessos.')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return fail('E-mail não informado.')

  const alvo = await buscarColaborador(email)
  if (!alvo) return fail('Este e-mail não está na lista de autorizados, ou está desativado.')

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const destino = `${await origemDaRequisicao()}/auth/callback?destino=%2Fdefinir-senha`

  const { error: erroConvite } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: destino,
  })

  if (!erroConvite) {
    return done(`Convite enviado para ${email}. A pessoa cria a senha pelo link.`)
  }

  // Já tem conta: o caminho certo é redefinir, não convidar.
  const jaExiste =
    erroConvite.status === 422 || /already|registered|exists/i.test(erroConvite.message)

  if (!jaExiste) {
    return fail(explicarFalhaDeEnvio(erroConvite, email))
  }

  const { error: erroReset } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: destino,
  })

  if (erroReset) return fail(explicarFalhaDeEnvio(erroReset, email))

  return done(`${email} já tinha conta — enviamos um link para criar uma nova senha.`)
}

/** Remove alguém da lista. O acesso cai na consulta seguinte. */
export async function deleteColaborador(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const autor = await getColaborador()
  if (autor?.papel !== 'admin') return fail('Apenas administradores podem alterar acessos.')

  const id = String(formData.get('id') ?? '')
  if (!id) return fail('Registro não informado.')

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { data: alvo } = await supabase
    .from('colaboradores_autorizados')
    .select('email')
    .eq('id', id)
    .maybeSingle()

  if (alvo && String(alvo.email).toLowerCase() === autor.email) {
    return fail('Você não pode remover o próprio acesso.')
  }

  // Sobrar zero admin deixaria a tela de acessos inalcançável para todos.
  const { count } = await supabase
    .from('colaboradores_autorizados')
    .select('id', { count: 'exact', head: true })
    .eq('papel', 'admin')
    .eq('ativo', true)

  if ((count ?? 0) <= 1) {
    return fail('Este é o último administrador ativo. Promova outra pessoa antes de remover.')
  }

  const { error } = await supabase.from('colaboradores_autorizados').delete().eq('id', id)
  if (error) return fail(`Erro ao remover acesso: ${error.message}`)

  revalidate('/admin/colaboradores')
  return done('Acesso removido.')
}

// ---------------------------------------------------------------------------
//  BLOCO 1 — Metas anuais
// ---------------------------------------------------------------------------

export async function saveAnnualGoal(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = annualGoalSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return fail(firstIssueMessage(parsed.error))

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { id, sort_order, ...values } = parsed.data

  const payload = { ...values, sort_order: sort_order ?? 0 }

  const { error } = id
    ? await supabase.from('annual_goals').update(payload).eq('id', id)
    : await supabase.from('annual_goals').insert(payload)

  if (error) return fail(`Erro ao salvar meta: ${error.message}`)

  revalidate('/admin/metas')
  return done(id ? 'Meta atualizada.' : 'Meta criada.')
}

export async function deleteAnnualGoal(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return fail('Meta não identificada.')

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { error } = await supabase.from('annual_goals').delete().eq('id', id)
  if (error) return fail(`Erro ao excluir: ${error.message}`)

  revalidate('/admin/metas')
  return done('Meta excluída.')
}

export async function saveMonthlyFinancial(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = monthlyFinancialSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return fail(firstIssueMessage(parsed.error))

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  // (year, month) é chave única — upsert evita duplicar o fechamento do mês.
  const { error } = await supabase
    .from('monthly_financials')
    .upsert(parsed.data, { onConflict: 'year,month' })

  if (error) return fail(`Erro ao salvar fechamento: ${error.message}`)

  revalidate('/admin/metas')
  return done(`Fechamento de ${String(parsed.data.month).padStart(2, '0')}/${parsed.data.year} salvo.`)
}

// ---------------------------------------------------------------------------
//  BLOCO 2 — Faturamento lançado à mão
// ---------------------------------------------------------------------------

/**
 * Grava (ou apaga) o faturamento manual de uma plataforma em um mês.
 *
 * Linha inteiramente vazia significa "remover este lançamento". Sem isso o
 * time não teria como desfazer um valor errado nem como sair do manual
 * quando a integração da plataforma voltar a funcionar — e um lançamento
 * esquecido seria somado ao webhook, inflando o faturamento em silêncio.
 */
export async function saveManualPlatformRevenue(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = manualPlatformRevenueSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return fail(firstIssueMessage(parsed.error))

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { year, month, platform, gross_revenue, platform_fees, net_revenue, sales_count, notes } =
    parsed.data

  const periodo = `${String(month).padStart(2, '0')}/${year}`
  const nome = PLATFORM_LABELS[platform]

  const vazio =
    !gross_revenue && !platform_fees && !net_revenue && !sales_count && !notes

  if (vazio) {
    const { error } = await supabase
      .from('manual_platform_revenue')
      .delete()
      .match({ year, month, platform })

    if (error) return fail(`Erro ao remover lançamento: ${error.message}`)

    revalidate('/admin/vendas')
    revalidatePath('/admin/metas')
    return done(`Lançamento de ${nome} em ${periodo} removido.`)
  }

  const bruto = gross_revenue ?? 0
  const taxas = platform_fees ?? 0

  // Taxa maior que o bruto zeraria o líquido derivado e provavelmente é
  // troca de campo. Barrar aqui é melhor do que exibir um número negativo.
  if (net_revenue === null && taxas > bruto) {
    return fail('As taxas não podem ser maiores que o faturamento bruto.')
  }

  if (net_revenue !== null && net_revenue > bruto) {
    return fail('O faturamento líquido não pode ser maior que o bruto.')
  }

  const { error } = await supabase.from('manual_platform_revenue').upsert(
    {
      year,
      month,
      platform,
      gross_revenue: bruto,
      platform_fees: taxas,
      net_revenue,
      sales_count: sales_count ?? 0,
      notes,
    },
    { onConflict: 'year,month,platform' },
  )

  if (error) return fail(`Erro ao salvar lançamento: ${error.message}`)

  revalidate('/admin/vendas')
  revalidatePath('/admin/metas')
  return done(`${nome} em ${periodo}: ${formatCurrency(bruto)} lançado.`)
}

// ---------------------------------------------------------------------------
//  BLOCO 3 — Ações de marketing
// ---------------------------------------------------------------------------

export async function saveMarketingAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = marketingActionSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return fail(firstIssueMessage(parsed.error))

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { id, slug, sort_order, ...values } = parsed.data

  // O slug não tem campo na tela: ao criar, é derivado do título; ao editar,
  // o formulário reenvia o slug atual num campo oculto para mantê-lo estável.
  const payload = {
    ...values,
    slug: slug ?? slugify(values.title),
    sort_order: sort_order ?? 0,
  }

  if (!payload.slug) {
    return fail('Não foi possível gerar um identificador a partir do título. Use letras ou números.')
  }

  const { error } = id
    ? await supabase.from('marketing_actions').update(payload).eq('id', id)
    : await supabase.from('marketing_actions').insert(payload)

  if (error) {
    if (error.code === '23505') {
      return fail('Já existe uma ação com este identificador (slug). Escolha outro título.')
    }
    return fail(`Erro ao salvar ação: ${error.message}`)
  }

  revalidate('/admin/acoes')
  return done(id ? 'Ação atualizada.' : 'Ação criada.')
}

export async function setActionStatus(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')

  if (!id || !['active', 'paused', 'draft', 'archived'].includes(status)) {
    return fail('Requisição inválida.')
  }

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { error } = await supabase.from('marketing_actions').update({ status }).eq('id', id)
  if (error) return fail(`Erro ao atualizar status: ${error.message}`)

  revalidate('/admin/acoes')
  return done(status === 'active' ? 'Ação reativada.' : 'Ação pausada.')
}

export async function deleteMarketingAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return fail('Ação não identificada.')

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { error } = await supabase.from('marketing_actions').delete().eq('id', id)
  if (error) return fail(`Erro ao excluir: ${error.message}`)

  revalidate('/admin/acoes')
  return done('Ação excluída.')
}

// ---------------------------------------------------------------------------
//  BLOCO 4 — Documentos
// ---------------------------------------------------------------------------

export async function saveDocumentCategory(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = documentCategorySchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return fail(firstIssueMessage(parsed.error))

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { id, slug, sort_order, ...values } = parsed.data
  const payload = { ...values, slug: slug ?? slugify(values.name), sort_order: sort_order ?? 0 }

  const { error } = id
    ? await supabase.from('document_categories').update(payload).eq('id', id)
    : await supabase.from('document_categories').insert(payload)

  if (error) return fail(`Erro ao salvar categoria: ${error.message}`)

  revalidate('/admin/documentos')
  return done(id ? 'Categoria atualizada.' : 'Categoria criada.')
}

export async function deleteDocumentCategory(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return fail('Categoria não identificada.')

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  // ON DELETE CASCADE remove os documentos da categoria junto.
  const { error } = await supabase.from('document_categories').delete().eq('id', id)
  if (error) return fail(`Erro ao excluir: ${error.message}`)

  revalidate('/admin/documentos')
  return done('Categoria e seus documentos foram excluídos.')
}

export async function saveDocument(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = documentSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return fail(firstIssueMessage(parsed.error))

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { id, sort_order, ...values } = parsed.data
  const payload = { ...values, sort_order: sort_order ?? 0 }

  const { error } = id
    ? await supabase.from('documents').update(payload).eq('id', id)
    : await supabase.from('documents').insert(payload)

  if (error) return fail(`Erro ao salvar documento: ${error.message}`)

  revalidate('/admin/documentos')
  return done(id ? 'Documento atualizado.' : 'Documento adicionado.')
}

export async function deleteDocument(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return fail('Documento não identificado.')

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) return fail(`Erro ao excluir: ${error.message}`)

  revalidate('/admin/documentos')
  return done('Documento excluído.')
}

// ---------------------------------------------------------------------------
//  BLOCO 4 — Cofre de senhas
// ---------------------------------------------------------------------------

export async function saveVaultCredential(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  // Escrever no cofre exige acesso Master: um colaborador com PIN pode ler
  // o que foi liberado para ele, mas nunca alterar credencial.
  if (!(await hasMasterSession())) {
    return fail('Ação exclusiva do acesso Master. Valide a Senha Mestre novamente.')
  }

  if (!isVaultEncryptionConfigured()) {
    return fail('VAULT_ENCRYPTION_KEY não configurada. Rode `npm run vault:keygen`.')
  }

  const parsed = vaultCredentialSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return fail(firstIssueMessage(parsed.error))

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { id, password, sort_order, ...values } = parsed.data

  const payload: Record<string, unknown> = { ...values, sort_order: sort_order ?? 0 }

  // Senha em branco ao editar significa "manter a atual" — nunca apagar.
  if (password) {
    payload.password_encrypted = encryptSecret(password)
  } else if (!id) {
    payload.password_encrypted = null
  }

  const { error } = id
    ? await supabase.from('vault_credentials').update(payload).eq('id', id)
    : await supabase.from('vault_credentials').insert(payload)

  if (error) return fail(`Erro ao salvar credencial: ${error.message}`)

  revalidate('/admin/cofre')
  return done(id ? 'Credencial atualizada.' : 'Credencial adicionada.')
}

export async function deleteVaultCredential(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  if (!(await hasMasterSession())) {
    return fail('Ação exclusiva do acesso Master. Valide a Senha Mestre novamente.')
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return fail('Credencial não identificada.')

  const supabase = getSupabaseAdminClient()
  if (!supabase) return NO_DB

  const { error } = await supabase.from('vault_credentials').delete().eq('id', id)
  if (error) return fail(`Erro ao excluir: ${error.message}`)

  revalidate('/admin/cofre')
  return done('Credencial excluída.')
}

export async function updateMasterPassword(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = masterPasswordSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return fail(firstIssueMessage(parsed.error))

  const result = await setMasterPassword(parsed.data.password)
  return result.ok ? done(result.message) : fail(result.message)
}

// ---------------------------------------------------------------------------
//  Integrações
// ---------------------------------------------------------------------------

export async function runMetaAdsSync(): Promise<ActionState> {
  const result = await syncMetaAdsSpend()
  if (!result.ok) return fail(result.message)

  revalidate('/admin')
  return done(`${result.message} Total no período: R$ ${result.totalSpend.toFixed(2)}.`)
}

// ---------------------------------------------------------------------------
//  Perfis de acesso ao cofre
// ---------------------------------------------------------------------------

export async function saveCofrePerfil(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  if (!(await hasMasterSession())) {
    return fail('Ação exclusiva do acesso Master. Valide a Senha Mestre novamente.')
  }

  const parsed = cofrePerfilSchema.safeParse(formDataToObject(formData))
  if (!parsed.success) return fail(firstIssueMessage(parsed.error))

  const { id, nome, pin, subcategorias, ativo } = parsed.data

  const result = await salvarPerfil({ id, nome, pin, subcategorias, ativo })
  if (!result.ok) return fail(result.message)

  revalidate('/admin/cofre')
  return done(result.message)
}

export async function deleteCofrePerfil(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  if (!(await hasMasterSession())) {
    return fail('Ação exclusiva do acesso Master. Valide a Senha Mestre novamente.')
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return fail('Perfil não identificado.')

  const result = await excluirPerfil(id)
  if (!result.ok) return fail(result.message)

  revalidate('/admin/cofre')
  return done(result.message)
}

export async function unlockCofrePerfil(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  if (!(await hasMasterSession())) {
    return fail('Ação exclusiva do acesso Master. Valide a Senha Mestre novamente.')
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return fail('Perfil não identificado.')

  const result = await desbloquearPerfil(id)
  if (!result.ok) return fail(result.message)

  revalidate('/admin/cofre')
  return done(result.message)
}
