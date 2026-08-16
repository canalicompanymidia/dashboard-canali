import 'server-only'

import { resolveNetAmount } from '@/lib/calculations'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import type { PlatformSource } from '@/lib/types'
import type { NormalizedTransaction, WebhookResult } from './types'

/**
 * Persistência dos webhooks.
 *
 * Dois passos independentes de propósito:
 *  1. `logWebhookEvent` grava o payload cru SEMPRE, mesmo se a assinatura
 *     falhar ou a normalização não achar ID. É o que permite auditar e
 *     reprocessar depois.
 *  2. `ingestTransaction` grava a venda normalizada, via função SQL que
 *     resolve ordem de eventos de forma atômica.
 */

// Taxas padrão são estáveis; um cache curto evita uma query por webhook.
let feeCache: { data: Map<PlatformSource, { percent: number; fixed: number }>; at: number } | null =
  null
const FEE_CACHE_TTL = 5 * 60 * 1000

async function getPlatformFees(): Promise<Map<PlatformSource, { percent: number; fixed: number }>> {
  if (feeCache && Date.now() - feeCache.at < FEE_CACHE_TTL) return feeCache.data

  const supabase = getSupabaseAdminClient()
  const map = new Map<PlatformSource, { percent: number; fixed: number }>()

  if (supabase) {
    const { data } = await supabase.from('platform_fees').select('platform, fee_percent, fee_fixed')
    for (const row of data ?? []) {
      map.set(row.platform as PlatformSource, {
        percent: Number(row.fee_percent) || 0,
        fixed: Number(row.fee_fixed) || 0,
      })
    }
  }

  feeCache = { data: map, at: Date.now() }
  return map
}

export interface LogWebhookInput {
  platform: string
  eventType?: string | null
  externalId?: string | null
  signatureValid: boolean
  payload: unknown
  processed?: boolean
  errorMessage?: string | null
}

/** Registra o evento cru. Nunca lança: log quebrado não pode derrubar o webhook. */
export async function logWebhookEvent(input: LogWebhookInput): Promise<void> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return

  try {
    await supabase.from('webhook_events').insert({
      platform: input.platform,
      event_type: input.eventType ?? null,
      external_id: input.externalId ?? null,
      signature_valid: input.signatureValid,
      processed: input.processed ?? false,
      error_message: input.errorMessage ?? null,
      payload: input.payload as Record<string, unknown>,
    })
  } catch (error) {
    console.error('[webhook] falha ao registrar evento:', error)
  }
}

/**
 * Grava a venda normalizada.
 *
 * A taxa da plataforma vem do payload quando informada; só cai no
 * percentual padrão de `platform_fees` quando o webhook não traz o valor —
 * assim o faturamento líquido reflete o que a plataforma realmente cobrou.
 */
export async function ingestTransaction(
  transaction: NormalizedTransaction,
): Promise<WebhookResult> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    return { ok: false, message: 'Supabase não configurado — venda não gravada.' }
  }

  const fees = await getPlatformFees()
  const fallback = fees.get(transaction.platform) ?? { percent: 0, fixed: 0 }

  const { platformFee, netAmount } = resolveNetAmount(
    transaction.grossAmount,
    transaction.platformFee,
    fallback.percent,
    fallback.fixed,
  )

  const { data, error } = await supabase
    .rpc('ingest_sales_transaction', {
      p_platform: transaction.platform,
      p_external_id: transaction.externalId,
      p_status: transaction.status,
      p_gross: transaction.grossAmount,
      p_fee: platformFee,
      p_net: netAmount,
      p_currency: transaction.currency,
      p_product_name: transaction.productName,
      p_product_id: transaction.productId,
      p_offer_code: transaction.offerCode,
      p_payment_method: transaction.paymentMethod,
      p_installments: transaction.installments,
      p_buyer_name: transaction.buyerName,
      p_buyer_email: transaction.buyerEmail,
      p_affiliate: transaction.affiliate,
      p_occurred_at: transaction.occurredAt,
      p_refunded_at: transaction.refundedAt,
      p_raw: transaction.raw,
    })
    .maybeSingle<{ transaction_id: string; applied: boolean }>()

  if (error) {
    console.error('[webhook] falha ao gravar transação:', error.message)
    return { ok: false, message: `Erro ao gravar transação: ${error.message}` }
  }

  if (data && data.applied === false) {
    return {
      ok: true,
      ignored: true,
      transactionId: data.transaction_id,
      message: 'Evento fora de ordem — status atual tem precedência. Nada alterado.',
    }
  }

  return {
    ok: true,
    transactionId: data?.transaction_id,
    message: `Transação ${transaction.externalId} registrada como "${transaction.status}".`,
  }
}

/** Lê o corpo cru (necessário para validar assinatura HMAC) e faz o parse. */
export async function readJsonBody(
  request: Request,
): Promise<{ raw: string; json: Record<string, unknown> | null }> {
  const raw = await request.text()
  try {
    const parsed = JSON.parse(raw)
    return { raw, json: parsed && typeof parsed === 'object' ? parsed : null }
  } catch {
    return { raw, json: null }
  }
}
