import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge de classes Tailwind sem conflito de utilitários. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Fuso de referência do negócio. Todo corte de mês/ano usa este offset. */
export const BUSINESS_TIMEZONE = 'America/Sao_Paulo'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const currencyNoCentsFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** R$ 1.234.567,89 */
export function formatCurrency(value: number | null | undefined): string {
  return currencyFormatter.format(Number(value ?? 0))
}

/** R$ 1.234.568 — para números grandes onde os centavos poluem. */
export function formatCurrencyShort(value: number | null | undefined): string {
  return currencyNoCentsFormatter.format(Number(value ?? 0))
}

/**
 * Forma compacta para títulos e eixos: R$ 12,2 mi.
 * Mantém a leitura escaneável em cards de alta densidade.
 */
export function formatCurrencyCompact(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''

  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2).replace('.', ',')} mi`
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1).replace('.', ',')} mil`
  return currencyNoCentsFormatter.format(n)
}

/** 22,5% */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0)
  return `${n.toFixed(digits).replace('.', ',')}%`
}

/** 1.234 */
export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR').format(Number(value ?? 0))
}

/** 2,84x — usado no ROAS. */
export function formatMultiplier(value: number | null | undefined, digits = 2): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(digits).replace('.', ',')}x`
}

/** 16/08/2026 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: BUSINESS_TIMEZONE,
  }).format(date)
}

/** 16/08/2026 às 14:32 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIMEZONE,
  }).format(date)
}

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

export const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
] as const

/** Nome do mês a partir do número 1-12. */
export function monthName(month: number): string {
  return MONTH_NAMES[Math.min(Math.max(month, 1), 12) - 1]
}

/** Converte string/number vindo do Postgres (numeric chega como string) em number. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Slug seguro para URLs e chaves naturais. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos após o NFD
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
