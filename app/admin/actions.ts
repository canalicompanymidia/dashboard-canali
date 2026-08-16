'use server'

import { revalidatePath } from 'next/cache'

import {
  annualGoalSchema,
  documentCategorySchema,
  documentSchema,
  firstIssueMessage,
  formDataToObject,
  marketingActionSchema,
  masterPasswordSchema,
  monthlyFinancialSchema,
  vaultCredentialSchema,
} from '@/lib/admin/schemas'
import type { ActionState } from '@/lib/admin/types'
import { encryptSecret, isVaultEncryptionConfigured } from '@/lib/crypto'
import { syncMetaAdsSpend } from '@/lib/integrations/meta-ads'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import { hasVaultSession, setMasterPassword } from '@/lib/vault'

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

  const { id, is_active, sort_order, ...values } = parsed.data

  const payload = {
    ...values,
    sort_order: sort_order ?? 0,
    is_active: is_active === 'on' || is_active === 'true',
  }

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

  const payload = {
    ...values,
    slug: slug ?? slugify(values.title),
    sort_order: sort_order ?? 0,
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
  // Gravar credencial exige a mesma barreira de ler: sessão do cofre válida.
  if (!(await hasVaultSession())) {
    return fail('Sessão do cofre expirada. Valide a Senha Mestre novamente.')
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
  if (!(await hasVaultSession())) {
    return fail('Sessão do cofre expirada. Valide a Senha Mestre novamente.')
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
