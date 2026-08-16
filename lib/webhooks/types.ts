import type { PlatformSource, TransactionStatus } from '@/lib/types'

/**
 * Forma normalizada de uma venda, comum às três plataformas.
 * Cada adaptador (hotmart.ts, generic.ts) traduz o payload nativo para cá,
 * e só este formato chega ao banco.
 */
export interface NormalizedTransaction {
  platform: PlatformSource
  externalId: string
  eventType: string
  status: TransactionStatus
  grossAmount: number
  /** Taxa informada pela plataforma. null => aplica o fallback de platform_fees. */
  platformFee: number | null
  currency: string
  productName: string | null
  productId: string | null
  offerCode: string | null
  paymentMethod: string | null
  installments: number | null
  buyerName: string | null
  buyerEmail: string | null
  affiliate: string | null
  /** Data da VENDA (não do recebimento do webhook), em ISO 8601. */
  occurredAt: string
  refundedAt: string | null
  raw: Record<string, unknown>
}

/**
 * Precedência de status — protege contra webhooks fora de ordem.
 *
 * Plataformas não garantem ordem de entrega: um PURCHASE_APPROVED atrasado
 * pode chegar DEPOIS do reembolso. Só aplicamos o novo status quando ele tem
 * precedência maior ou igual, então um reembolso nunca é desfeito por um
 * evento antigo.
 */
export const STATUS_RANK: Record<TransactionStatus, number> = {
  expired: 0,
  canceled: 1,
  pending: 2,
  approved: 3,
  refunded: 4,
  chargeback: 5,
}

export function shouldApplyStatus(
  current: TransactionStatus | null | undefined,
  next: TransactionStatus,
): boolean {
  if (!current) return true
  return STATUS_RANK[next] >= STATUS_RANK[current]
}

/** Status que retiram a venda do faturamento. */
export function isRefundStatus(status: TransactionStatus): boolean {
  return status === 'refunded' || status === 'chargeback'
}

export interface WebhookResult {
  ok: boolean
  message: string
  transactionId?: string
  ignored?: boolean
}
