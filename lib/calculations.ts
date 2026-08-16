import type {
  AnnualGoal,
  GoalProgress,
  MonthlyMetrics,
  PlatformBreakdown,
  PlatformSource,
  YearContext,
} from './types'
import { BUSINESS_TIMEZONE, monthName, toNumber } from './utils'

/**
 * Motor de cálculo do Hub.
 *
 * Regra de ouro: toda data de corte (mês/ano) usa o fuso America/Sao_Paulo.
 * O Brasil não observa horário de verão desde 2019, então o offset é fixo
 * em -03:00 — o que permite montar os limites do período como string ISO
 * sem depender do fuso do servidor (que na Vercel é UTC).
 */
const BUSINESS_UTC_OFFSET = '-03:00'

/** Partes da data de hoje no fuso do negócio. */
export function getBusinessDateParts(now: Date = new Date()): {
  year: number
  month: number
  day: number
} {
  // 'en-CA' formata como YYYY-MM-DD, o que torna o split trivial.
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const [year, month, day] = formatted.split('-').map(Number)
  return { year, month, day }
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

/**
 * Contexto temporal do ano corrente — insumo da projeção linear.
 * `daysElapsed` conta o dia de hoje (dia 1 do ano => 1).
 */
export function getYearContext(now: Date = new Date()): YearContext {
  const { year, month, day } = getBusinessDateParts(now)

  const startOfYear = Date.UTC(year, 0, 1)
  const today = Date.UTC(year, month - 1, day)
  const daysElapsed = Math.floor((today - startOfYear) / 86_400_000) + 1

  return {
    year,
    daysElapsed: Math.max(daysElapsed, 1),
    daysInYear: daysInYear(year),
    monthsRemaining: 12 - month,
  }
}

/** Limites ISO de um mês no fuso do negócio: [início, início do mês seguinte). */
export function getMonthRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1

  return {
    start: `${year}-${pad(month)}-01T00:00:00${BUSINESS_UTC_OFFSET}`,
    end: `${nextYear}-${pad(nextMonth)}-01T00:00:00${BUSINESS_UTC_OFFSET}`,
  }
}

/** Limites ISO de um ano no fuso do negócio. */
export function getYearRange(year: number): { start: string; end: string } {
  return {
    start: `${year}-01-01T00:00:00${BUSINESS_UTC_OFFSET}`,
    end: `${year + 1}-01-01T00:00:00${BUSINESS_UTC_OFFSET}`,
  }
}

/** Datas (YYYY-MM-DD) de início/fim do mês — usado nas queries de ad_spend. */
export function getMonthDateRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  }
}

/**
 * PROJEÇÃO LINEAR — "no ritmo atual, fecharemos o ano em R$ X".
 *
 *   (faturamento acumulado / dias decorridos) * dias do ano
 *
 * Usa 366 em anos bissextos em vez de 365 fixo: em ano comum o resultado
 * é idêntico, em bissexto fica correto.
 */
export function projectAnnualRevenue(
  accumulatedRevenue: number,
  context: YearContext = getYearContext(),
): number {
  if (context.daysElapsed <= 0) return 0
  const dailyPace = accumulatedRevenue / context.daysElapsed
  return dailyPace * context.daysInYear
}

/** Percentual de atingimento, limitado a 0 para baixo (não a 100 para cima). */
export function progressPercent(value: number, target: number): number {
  if (!target || target <= 0) return 0
  return Math.max((value / target) * 100, 0)
}

/**
 * Consolida uma meta anual: progresso, projeção e ritmo necessário.
 * `ebitdaPct` vem do fechamento manual (tabela monthly_financials).
 */
export function buildGoalProgress(
  goal: AnnualGoal,
  accumulatedRevenue: number,
  options: {
    context?: YearContext
    ebitdaPct?: number | null
    ebitdaValue?: number | null
  } = {},
): GoalProgress {
  const context = options.context ?? getYearContext()
  const target = toNumber(goal.target_revenue)

  const projectedRevenue = projectAnnualRevenue(accumulatedRevenue, context)
  const remaining = Math.max(target - accumulatedRevenue, 0)

  const daysRemaining = Math.max(context.daysInYear - context.daysElapsed, 1)
  const requiredDailyPace = remaining / daysRemaining
  // 30,44 = média de dias por mês no ano (365/12). Evita distorção de meses curtos.
  const requiredMonthlyPace = requiredDailyPace * 30.44

  return {
    goal,
    accumulatedRevenue,
    progressPct: progressPercent(accumulatedRevenue, target),
    projectedRevenue,
    projectionPct: progressPercent(projectedRevenue, target),
    remaining,
    requiredMonthlyPace,
    ebitdaPct: options.ebitdaPct ?? null,
    ebitdaValue: options.ebitdaValue ?? null,
    onTrack: projectedRevenue >= target,
  }
}

/** Lucro bruto do mês = faturamento líquido − investimento em tráfego. */
export function calcGrossProfit(netRevenue: number, adSpend: number): number {
  return netRevenue - adSpend
}

/**
 * ROAS sobre o faturamento LÍQUIDO — mede retorno do que de fato entra no
 * caixa, não do valor cheio da venda. Sem investimento, ROAS é indefinido (0).
 */
export function calcRoas(netRevenue: number, adSpend: number): number {
  if (!adSpend || adSpend <= 0) return 0
  return netRevenue / adSpend
}

/** Ticket médio das vendas aprovadas. */
export function calcAverageTicket(grossRevenue: number, approvedCount: number): number {
  if (!approvedCount || approvedCount <= 0) return 0
  return grossRevenue / approvedCount
}

/** Margem do lucro bruto sobre o faturamento líquido, em %. */
export function calcProfitMargin(netRevenue: number, grossProfit: number): number {
  if (!netRevenue || netRevenue <= 0) return 0
  return (grossProfit / netRevenue) * 100
}

/**
 * Monta o objeto de métricas do mês a partir dos agregados já consultados.
 * Centraliza aqui para a Home, a API e o admin usarem exatamente a mesma conta.
 */
export function buildMonthlyMetrics(input: {
  year: number
  month: number
  grossRevenue: number
  netRevenue: number
  platformFees: number
  refundedAmount: number
  refundCount: number
  approvedCount: number
  adSpend: number
  byPlatform: PlatformBreakdown[]
}): MonthlyMetrics {
  const grossProfit = calcGrossProfit(input.netRevenue, input.adSpend)

  return {
    monthLabel: `${monthName(input.month)} de ${input.year}`,
    year: input.year,
    month: input.month,
    grossRevenue: input.grossRevenue,
    netRevenue: input.netRevenue,
    platformFees: input.platformFees,
    refundedAmount: input.refundedAmount,
    refundCount: input.refundCount,
    approvedCount: input.approvedCount,
    adSpend: input.adSpend,
    grossProfit,
    roas: calcRoas(input.netRevenue, input.adSpend),
    averageTicket: calcAverageTicket(input.grossRevenue, input.approvedCount),
    byPlatform: input.byPlatform,
    updatedAt: new Date().toISOString(),
  }
}

/** Métricas zeradas — usado antes da primeira venda ou sem Supabase configurado. */
export function emptyMonthlyMetrics(year: number, month: number): MonthlyMetrics {
  return buildMonthlyMetrics({
    year,
    month,
    grossRevenue: 0,
    netRevenue: 0,
    platformFees: 0,
    refundedAmount: 0,
    refundCount: 0,
    approvedCount: 0,
    adSpend: 0,
    byPlatform: [],
  })
}

export const PLATFORM_LABELS: Record<PlatformSource, string> = {
  hotmart: 'Hotmart',
  onprofit: 'OnProfit',
  tmb: 'TMB',
  manual: 'Manual',
}

/**
 * Faturamento líquido de uma transação.
 * Prioriza a taxa real do webhook; só cai no percentual padrão da
 * plataforma quando o payload não informa a taxa.
 */
export function resolveNetAmount(
  grossAmount: number,
  reportedFee: number | null | undefined,
  fallbackFeePercent = 0,
  fallbackFeeFixed = 0,
): { platformFee: number; netAmount: number } {
  const gross = Math.max(toNumber(grossAmount), 0)

  const platformFee =
    reportedFee !== null && reportedFee !== undefined && Number.isFinite(Number(reportedFee))
      ? Math.max(toNumber(reportedFee), 0)
      : gross * (fallbackFeePercent / 100) + fallbackFeeFixed

  const cappedFee = Math.min(platformFee, gross)
  return {
    platformFee: round2(cappedFee),
    netAmount: round2(gross - cappedFee),
  }
}

/** Arredonda para 2 casas evitando o erro clássico de ponto flutuante. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
