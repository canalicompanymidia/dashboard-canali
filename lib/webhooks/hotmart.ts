import type { TransactionStatus } from '@/lib/types'
import { toNumber } from '@/lib/utils'
import type { NormalizedTransaction } from './types'

/**
 * Adaptador do Hotmart Webhook 2.0.
 * Referência: https://developers.hotmart.com/docs/pt-BR/webhook/about-webhook/
 */

/** Eventos do Hotmart -> status interno. */
const EVENT_STATUS: Record<string, TransactionStatus> = {
  PURCHASE_APPROVED: 'approved',
  PURCHASE_COMPLETE: 'approved',
  PURCHASE_PROTEST: 'chargeback',
  PURCHASE_CHARGEBACK: 'chargeback',
  PURCHASE_REFUNDED: 'refunded',
  PURCHASE_CANCELED: 'canceled',
  PURCHASE_EXPIRED: 'expired',
  PURCHASE_BILLET_PRINTED: 'pending',
  PURCHASE_OUT_OF_SHOPPING_CART: 'pending',
  PURCHASE_DELAYED: 'pending',
  SUBSCRIPTION_CANCELLATION: 'canceled',
  SWITCH_PLAN: 'approved',
}

/** Status textual do Hotmart, usado quando o evento não é conclusivo. */
const PURCHASE_STATUS: Record<string, TransactionStatus> = {
  APPROVED: 'approved',
  COMPLETE: 'approved',
  COMPLETED: 'approved',
  REFUNDED: 'refunded',
  CHARGEBACK: 'chargeback',
  CANCELLED: 'canceled',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
  BILLET_PRINTED: 'pending',
  WAITING_PAYMENT: 'pending',
  STARTED: 'pending',
  PRINTED_BILLET: 'pending',
  DELAYED: 'pending',
  PROTESTED: 'chargeback',
}

type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? (value as AnyRecord) : {}
}

/** Hotmart manda datas em epoch de milissegundos. */
function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const ms = Number(value)
    // Se vier em segundos (10 dígitos), converte para ms.
    const date = new Date(ms < 1e11 ? ms * 1000 : ms)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Comissão do produtor = faturamento líquido real da venda.
 * Quando presente, é mais confiável do que aplicar o percentual padrão.
 */
function extractProducerCommission(commissions: unknown): number | null {
  if (!Array.isArray(commissions)) return null

  for (const entry of commissions) {
    const item = asRecord(entry)
    const source = String(item.source ?? '').toUpperCase()
    if (source === 'PRODUCER' || source === 'VENDOR' || source === 'SELLER') {
      const value = asRecord(item.value ?? {})
      const amount = toNumber(
        typeof item.value === 'object' ? value.value ?? value.amount : item.value,
      )
      if (amount > 0) return amount
    }
  }
  return null
}

export function normalizeHotmart(payload: AnyRecord): NormalizedTransaction | null {
  const data = asRecord(payload.data)
  const purchase = asRecord(data.purchase)
  const product = asRecord(data.product)
  const buyer = asRecord(data.buyer)
  const payment = asRecord(purchase.payment)
  const price = asRecord(purchase.price)
  const fullPrice = asRecord(purchase.full_price)
  const offer = asRecord(purchase.offer)

  const externalId = String(purchase.transaction ?? payload.id ?? '').trim()
  if (!externalId) return null

  const eventType = String(payload.event ?? '').toUpperCase()
  const purchaseStatus = String(purchase.status ?? '').toUpperCase()

  const status: TransactionStatus =
    EVENT_STATUS[eventType] ?? PURCHASE_STATUS[purchaseStatus] ?? 'pending'

  // O valor pago é `price`; `full_price` é o valor cheio antes de desconto.
  const grossAmount = toNumber(price.value ?? fullPrice.value ?? purchase.value ?? 0)

  const producerCommission = extractProducerCommission(purchase.commissions ?? data.commissions)
  const platformFee =
    producerCommission !== null && grossAmount > 0
      ? Math.max(grossAmount - producerCommission, 0)
      : null

  const occurredAt =
    toIso(purchase.approved_date) ??
    toIso(purchase.order_date) ??
    toIso(purchase.date_next_charge) ??
    toIso(payload.creation_date) ??
    new Date().toISOString()

  const affiliates = Array.isArray(data.affiliates) ? data.affiliates : []
  const affiliate = affiliates.length > 0 ? String(asRecord(affiliates[0]).name ?? '') || null : null

  return {
    platform: 'hotmart',
    externalId,
    eventType: eventType || 'UNKNOWN',
    status,
    grossAmount,
    platformFee,
    currency: String(price.currency_value ?? fullPrice.currency_value ?? 'BRL'),
    productName: product.name ? String(product.name) : null,
    productId: product.id !== undefined ? String(product.id) : null,
    offerCode: offer.code ? String(offer.code) : null,
    paymentMethod: payment.type ? String(payment.type) : payment.method ? String(payment.method) : null,
    installments:
      payment.installments_number !== undefined ? Number(payment.installments_number) : null,
    buyerName: buyer.name ? String(buyer.name) : null,
    buyerEmail: buyer.email ? String(buyer.email) : null,
    affiliate,
    occurredAt,
    refundedAt:
      status === 'refunded' || status === 'chargeback'
        ? toIso(purchase.date_refund) ?? new Date().toISOString()
        : null,
    raw: payload,
  }
}
