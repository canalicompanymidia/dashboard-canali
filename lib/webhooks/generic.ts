import type { PlatformSource, TransactionStatus } from '@/lib/types'
import { toNumber } from '@/lib/utils'
import type { NormalizedTransaction } from './types'

/**
 * Adaptador configurável para OnProfit e TMB.
 *
 * ATENÇÃO DE MANUTENÇÃO
 * ---------------------
 * Diferente do Hotmart, que tem contrato público e estável, os payloads da
 * OnProfit e da TMB variam por conta e por versão de integração. Em vez de
 * fixar um formato provável, este adaptador tenta uma LISTA de caminhos
 * possíveis para cada campo e usa o primeiro que existir.
 *
 * Todo webhook recebido é gravado cru em `webhook_events`. Depois do primeiro
 * evento real, confira o payload salvo e ajuste apenas os arrays abaixo —
 * nenhuma outra parte do sistema precisa mudar.
 */

type AnyRecord = Record<string, unknown>

export interface FieldMap {
  externalId: string[]
  eventType: string[]
  status: string[]
  grossAmount: string[]
  platformFee: string[]
  netAmount: string[]
  currency: string[]
  productName: string[]
  productId: string[]
  offerCode: string[]
  paymentMethod: string[]
  installments: string[]
  buyerName: string[]
  buyerEmail: string[]
  affiliate: string[]
  occurredAt: string[]
  refundedAt: string[]
}

/** Lê um caminho com pontos (ex.: "purchase.price.value") de forma segura. */
function readPath(source: AnyRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined
    return (acc as AnyRecord)[key]
  }, source)
}

/** Primeiro caminho que retornar valor preenchido. */
function pick(source: AnyRecord, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function pickString(source: AnyRecord, paths: string[]): string | null {
  const value = pick(source, paths)
  return value === undefined ? null : String(value)
}

function pickNumber(source: AnyRecord, paths: string[]): number | null {
  const value = pick(source, paths)
  if (value === undefined) return null

  // Aceita "R$ 1.234,56" além de número puro.
  if (typeof value === 'string') {
    const cleaned = value
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.')
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }

  const num = toNumber(value)
  return Number.isFinite(num) ? num : null
}

function pickIso(source: AnyRecord, paths: string[]): string | null {
  const value = pick(source, paths)
  if (value === undefined) return null

  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) {
    const ms = Number(value)
    const date = new Date(ms < 1e11 ? ms * 1000 : ms)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/** Dicionário abrangente de status — cobre PT e EN. */
const STATUS_DICTIONARY: Record<string, TransactionStatus> = {
  APPROVED: 'approved',
  APROVADO: 'approved',
  APROVADA: 'approved',
  PAID: 'approved',
  PAGO: 'approved',
  PAGA: 'approved',
  COMPLETED: 'approved',
  COMPLETE: 'approved',
  CONCLUIDO: 'approved',
  CONCLUIDA: 'approved',
  AUTHORIZED: 'approved',
  AUTORIZADO: 'approved',
  SALE_APPROVED: 'approved',
  ORDER_PAID: 'approved',
  PURCHASE_APPROVED: 'approved',

  PENDING: 'pending',
  PENDENTE: 'pending',
  WAITING: 'pending',
  WAITING_PAYMENT: 'pending',
  AGUARDANDO: 'pending',
  AGUARDANDO_PAGAMENTO: 'pending',
  PROCESSING: 'pending',
  PROCESSANDO: 'pending',
  BILLET_PRINTED: 'pending',

  REFUNDED: 'refunded',
  REEMBOLSADO: 'refunded',
  REEMBOLSADA: 'refunded',
  REFUND: 'refunded',
  ESTORNADO: 'refunded',
  SALE_REFUNDED: 'refunded',
  ORDER_REFUNDED: 'refunded',

  CHARGEBACK: 'chargeback',
  PROTESTED: 'chargeback',
  CONTESTADO: 'chargeback',
  SALE_CHARGEBACK: 'chargeback',

  CANCELED: 'canceled',
  CANCELLED: 'canceled',
  CANCELADO: 'canceled',
  CANCELADA: 'canceled',
  SALE_CANCELED: 'canceled',

  EXPIRED: 'expired',
  EXPIRADO: 'expired',
  EXPIRADA: 'expired',
  VENCIDO: 'expired',
}

function resolveStatus(rawStatus: string | null, rawEvent: string | null): TransactionStatus {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[\s-]+/g, '_')

  for (const candidate of [rawStatus, rawEvent]) {
    if (!candidate) continue
    const key = normalize(candidate)
    if (STATUS_DICTIONARY[key]) return STATUS_DICTIONARY[key]

    // Busca por substring: cobre "order.refunded", "sale_status_approved" etc.
    for (const [dictKey, value] of Object.entries(STATUS_DICTIONARY)) {
      if (key.includes(dictKey)) return value
    }
  }

  return 'pending'
}

/** Caminhos padrão — cobrem os formatos mais comuns de checkout brasileiro. */
export const DEFAULT_FIELD_MAP: FieldMap = {
  externalId: [
    'transaction_id', 'transactionId', 'transaction', 'order_id', 'orderId',
    'id', 'code', 'codigo', 'data.transaction_id', 'data.order_id', 'data.id',
    'sale.id', 'sale.code', 'purchase.transaction', 'order.id',
  ],
  eventType: ['event', 'event_type', 'eventType', 'type', 'action', 'evento', 'data.event'],
  status: [
    'status', 'sale_status', 'order_status', 'payment_status', 'situacao',
    'data.status', 'sale.status', 'order.status', 'purchase.status',
  ],
  grossAmount: [
    'amount', 'value', 'total', 'price', 'valor', 'valor_total', 'gross_value',
    'total_value', 'data.amount', 'data.total', 'data.value', 'sale.amount',
    'order.total', 'purchase.price.value', 'transaction.amount',
  ],
  platformFee: [
    'fee', 'fees', 'tax', 'taxa', 'platform_fee', 'commission_fee', 'taxa_plataforma',
    'data.fee', 'data.taxa', 'sale.fee', 'order.fee',
  ],
  netAmount: [
    'net_amount', 'net_value', 'net', 'valor_liquido', 'liquido', 'producer_value',
    'commission', 'comissao', 'data.net_amount', 'data.valor_liquido', 'sale.net_amount',
  ],
  currency: ['currency', 'currency_code', 'moeda', 'data.currency', 'sale.currency'],
  productName: [
    'product_name', 'productName', 'product.name', 'produto', 'produto.nome',
    'data.product.name', 'data.product_name', 'items.0.name', 'sale.product.name',
  ],
  productId: [
    'product_id', 'productId', 'product.id', 'data.product.id', 'data.product_id',
    'sale.product.id',
  ],
  offerCode: ['offer', 'offer_code', 'offer.code', 'plan', 'plano', 'data.offer.code'],
  paymentMethod: [
    'payment_method', 'paymentMethod', 'payment_type', 'forma_pagamento', 'metodo_pagamento',
    'data.payment_method', 'payment.method', 'payment.type',
  ],
  installments: ['installments', 'parcelas', 'installments_number', 'data.installments'],
  buyerName: [
    'buyer_name', 'customer_name', 'client_name', 'cliente', 'nome',
    'buyer.name', 'customer.name', 'client.name', 'data.buyer.name', 'data.customer.name',
  ],
  buyerEmail: [
    'buyer_email', 'customer_email', 'email', 'buyer.email', 'customer.email',
    'client.email', 'data.buyer.email', 'data.customer.email',
  ],
  affiliate: ['affiliate', 'afiliado', 'affiliate_name', 'data.affiliate.name', 'seller'],
  occurredAt: [
    'approved_date', 'paid_at', 'created_at', 'date', 'data_venda', 'order_date',
    'transaction_date', 'timestamp', 'data.created_at', 'data.approved_date',
    'sale.created_at', 'purchase.approved_date',
  ],
  refundedAt: ['refunded_at', 'refund_date', 'data_reembolso', 'data.refunded_at'],
}

/** Ajustes específicos por plataforma sobre o mapa padrão. */
export const PLATFORM_FIELD_MAPS: Partial<Record<PlatformSource, Partial<FieldMap>>> = {
  onprofit: {
    externalId: ['transaction_id', 'order_id', 'sale_id', 'id', 'code', ...DEFAULT_FIELD_MAP.externalId],
  },
  tmb: {
    externalId: ['transaction_id', 'order_id', 'venda_id', 'id', 'codigo', ...DEFAULT_FIELD_MAP.externalId],
  },
}

function buildFieldMap(platform: PlatformSource): FieldMap {
  const overrides = PLATFORM_FIELD_MAPS[platform] ?? {}
  return { ...DEFAULT_FIELD_MAP, ...overrides } as FieldMap
}

/**
 * Converte um payload arbitrário em transação normalizada.
 * Retorna null quando não há identificador — sem ele não há como garantir
 * idempotência, então é melhor registrar o evento cru e não gravar a venda.
 */
export function normalizeGeneric(
  platform: PlatformSource,
  payload: AnyRecord,
): NormalizedTransaction | null {
  const map = buildFieldMap(platform)

  const externalId = pickString(payload, map.externalId)
  if (!externalId) return null

  const rawStatus = pickString(payload, map.status)
  const eventType = pickString(payload, map.eventType)
  const status = resolveStatus(rawStatus, eventType)

  const grossAmount = pickNumber(payload, map.grossAmount) ?? 0
  const explicitFee = pickNumber(payload, map.platformFee)
  const explicitNet = pickNumber(payload, map.netAmount)

  // Se a plataforma só informa o líquido, a taxa é a diferença.
  const platformFee =
    explicitFee ??
    (explicitNet !== null && grossAmount > 0 ? Math.max(grossAmount - explicitNet, 0) : null)

  const isRefund = status === 'refunded' || status === 'chargeback'

  return {
    platform,
    externalId,
    eventType: eventType ?? rawStatus ?? 'UNKNOWN',
    status,
    grossAmount,
    platformFee,
    currency: pickString(payload, map.currency) ?? 'BRL',
    productName: pickString(payload, map.productName),
    productId: pickString(payload, map.productId),
    offerCode: pickString(payload, map.offerCode),
    paymentMethod: pickString(payload, map.paymentMethod),
    installments: pickNumber(payload, map.installments),
    buyerName: pickString(payload, map.buyerName),
    buyerEmail: pickString(payload, map.buyerEmail),
    affiliate: pickString(payload, map.affiliate),
    occurredAt: pickIso(payload, map.occurredAt) ?? new Date().toISOString(),
    refundedAt: isRefund ? pickIso(payload, map.refundedAt) ?? new Date().toISOString() : null,
    raw: payload,
  }
}
