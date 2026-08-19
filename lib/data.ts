import 'server-only'

import {
  buildGoalProgress,
  buildMonthlyMetrics,
  emptyMonthlyMetrics,
  getBusinessDateParts,
  getYearContext,
} from './calculations'
import { getSupabaseAdminClient, getSupabaseServerClient } from './supabase/server'
import type {
  AnnualGoal,
  CategoryWithDocuments,
  DocumentCategory,
  DocumentItem,
  GoalProgress,
  ManualPlatformRevenue,
  MarketingAction,
  MonthlyFinancial,
  MonthlyMetrics,
  PlatformBreakdown,
  PlatformSource,
} from './types'
import { toNumber } from './utils'

/**
 * Camada de leitura do painel.
 *
 * Todas as funções degradam com elegância: sem Supabase configurado (ou com
 * a tabela ainda não criada) devolvem vazio/zerado, e a Home renderiza o
 * estado de setup em vez de estourar erro.
 */

// ---------------------------------------------------------------------------
//  BLOCO 1 — Metas anuais, EBITDA e projeção
// ---------------------------------------------------------------------------

export async function getAnnualGoals(year: number): Promise<AnnualGoal[]> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('annual_goals')
    .select('*')
    .eq('year', year)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({
    ...row,
    target_revenue: toNumber(row.target_revenue),
    target_ebitda_pct: toNumber(row.target_ebitda_pct),
  })) as AnnualGoal[]
}

export async function getMonthlyFinancials(year: number): Promise<MonthlyFinancial[]> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('monthly_financials')
    .select('*')
    .eq('year', year)
    .order('month', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({
    ...row,
    ebitda_pct: row.ebitda_pct === null ? null : toNumber(row.ebitda_pct),
    ebitda_value: row.ebitda_value === null ? null : toNumber(row.ebitda_value),
    revenue_manual: row.revenue_manual === null ? null : toNumber(row.revenue_manual),
    costs: row.costs === null ? null : toNumber(row.costs),
  })) as MonthlyFinancial[]
}

/** Faturamento bruto/líquido consolidado do ano, vindo dos webhooks. */
export async function getAnnualRevenueFromSales(
  year: number,
): Promise<{ gross: number; net: number; count: number }> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return { gross: 0, net: 0, count: 0 }

  const { data, error } = await supabase
    .from('v_annual_summary')
    .select('gross_revenue, net_revenue, approved_count')
    .eq('year', year)
    .maybeSingle()

  if (error || !data) return { gross: 0, net: 0, count: 0 }

  return {
    gross: toNumber(data.gross_revenue),
    net: toNumber(data.net_revenue),
    count: toNumber(data.approved_count),
  }
}

/** Faturamento bruto por mês do ano (webhooks). Chave: número do mês. */
async function getMonthlyGrossRevenueMap(year: number): Promise<Map<number, number>> {
  const supabase = await getSupabaseServerClient()
  const map = new Map<number, number>()
  if (!supabase) return map

  const { data, error } = await supabase
    .from('v_monthly_revenue')
    .select('month, gross_revenue')
    .eq('year', year)

  if (error || !data) return map

  for (const row of data) {
    const month = Number(row.month)
    map.set(month, (map.get(month) ?? 0) + toNumber(row.gross_revenue))
  }
  return map
}

/** Mesma leitura em objeto simples — serializável para Client Components. */
export async function getMonthlyGrossRevenueRecord(year: number): Promise<Record<number, number>> {
  const map = await getMonthlyGrossRevenueMap(year)
  return Object.fromEntries(map)
}

/**
 * Faturamento acumulado do ano usado na barra de progresso e na projeção.
 *
 * Regra: o fechamento contábil manda. Se o time lançou `revenue_manual` para
 * um mês, esse valor substitui o número em tempo real daquele mês — assim o
 * painel nunca contradiz o fechamento oficial. Meses sem lançamento seguem
 * com o dado dos webhooks.
 */
export async function getAccumulatedAnnualRevenue(
  year: number,
  financials?: MonthlyFinancial[],
): Promise<number> {
  const [salesByMonth, monthly] = await Promise.all([
    getMonthlyGrossRevenueMap(year),
    financials ? Promise.resolve(financials) : getMonthlyFinancials(year),
  ])

  const manualByMonth = new Map<number, number>()
  for (const row of monthly) {
    if (row.revenue_manual !== null && row.revenue_manual !== undefined) {
      manualByMonth.set(row.month, toNumber(row.revenue_manual))
    }
  }

  let total = 0
  for (let month = 1; month <= 12; month += 1) {
    total += manualByMonth.get(month) ?? salesByMonth.get(month) ?? 0
  }
  return total
}

/**
 * % de EBITDA acumulado no ano.
 *
 * Prefere o cálculo real — soma dos valores de EBITDA sobre a soma do
 * faturamento dos mesmos meses. Se o time só preencheu o percentual, cai
 * para a média simples dos meses informados.
 */
export function calcAccumulatedEbitda(
  financials: MonthlyFinancial[],
): { pct: number | null; value: number | null } {
  const withValue = financials.filter(
    (f) => f.ebitda_value !== null && f.revenue_manual !== null && toNumber(f.revenue_manual) > 0,
  )

  if (withValue.length > 0) {
    const totalEbitda = withValue.reduce((sum, f) => sum + toNumber(f.ebitda_value), 0)
    const totalRevenue = withValue.reduce((sum, f) => sum + toNumber(f.revenue_manual), 0)
    return {
      pct: totalRevenue > 0 ? (totalEbitda / totalRevenue) * 100 : null,
      value: totalEbitda,
    }
  }

  const withPct = financials.filter((f) => f.ebitda_pct !== null)
  if (withPct.length > 0) {
    const avg = withPct.reduce((sum, f) => sum + toNumber(f.ebitda_pct), 0) / withPct.length
    const totalValue = financials.reduce((sum, f) => sum + toNumber(f.ebitda_value), 0)
    return { pct: avg, value: totalValue > 0 ? totalValue : null }
  }

  return { pct: null, value: null }
}

/** Monta o Bloco 1 inteiro: metas + progresso + projeção + EBITDA. */
export async function getGoalsWithProgress(year?: number): Promise<{
  goals: GoalProgress[]
  accumulatedRevenue: number
  context: ReturnType<typeof getYearContext>
}> {
  const context = getYearContext()
  const targetYear = year ?? context.year

  const [goals, financials] = await Promise.all([
    getAnnualGoals(targetYear),
    getMonthlyFinancials(targetYear),
  ])

  const accumulatedRevenue = await getAccumulatedAnnualRevenue(targetYear, financials)
  const ebitda = calcAccumulatedEbitda(financials)

  return {
    goals: goals.map((goal) =>
      buildGoalProgress(goal, accumulatedRevenue, {
        context,
        ebitdaPct: ebitda.pct,
        ebitdaValue: ebitda.value,
      }),
    ),
    accumulatedRevenue,
    context,
  }
}

// ---------------------------------------------------------------------------
//  BLOCO 2 — Métricas do mês em tempo real
// ---------------------------------------------------------------------------

export async function getMonthlyMetrics(year?: number, month?: number): Promise<MonthlyMetrics> {
  const today = getBusinessDateParts()
  const targetYear = year ?? today.year
  const targetMonth = month ?? today.month

  const supabase = await getSupabaseServerClient()
  if (!supabase) return emptyMonthlyMetrics(targetYear, targetMonth)

  const [revenueResult, spendResult] = await Promise.all([
    supabase
      .from('v_monthly_revenue')
      .select(
        'platform, gross_revenue, net_revenue, platform_fees, refunded_amount, refund_count, approved_count',
      )
      .eq('year', targetYear)
      .eq('month', targetMonth),
    // Lê a VIEW, não a tabela: ad_spend tem RLS sem policy de leitura, então
    // o cliente anônimo enxerga zero linhas nela. A view é liberada para anon
    // justamente por expor só o agregado, sem detalhe de campanha.
    supabase
      .from('v_monthly_ad_spend')
      .select('total_spend')
      .eq('year', targetYear)
      .eq('month', targetMonth),
  ])

  const rows = revenueResult.data ?? []

  const byPlatform: PlatformBreakdown[] = rows.map((row) => ({
    platform: row.platform as PlatformSource,
    grossRevenue: toNumber(row.gross_revenue),
    netRevenue: toNumber(row.net_revenue),
    approvedCount: toNumber(row.approved_count),
  }))

  const totals = rows.reduce(
    (acc, row) => ({
      grossRevenue: acc.grossRevenue + toNumber(row.gross_revenue),
      netRevenue: acc.netRevenue + toNumber(row.net_revenue),
      platformFees: acc.platformFees + toNumber(row.platform_fees),
      refundedAmount: acc.refundedAmount + toNumber(row.refunded_amount),
      refundCount: acc.refundCount + toNumber(row.refund_count),
      approvedCount: acc.approvedCount + toNumber(row.approved_count),
    }),
    {
      grossRevenue: 0,
      netRevenue: 0,
      platformFees: 0,
      refundedAmount: 0,
      refundCount: 0,
      approvedCount: 0,
    },
  )

  // A view agrupa por plataforma: somar as linhas junta Meta Ads com
  // eventuais lançamentos manuais.
  const adSpend = (spendResult.data ?? []).reduce(
    (sum, row) => sum + toNumber(row.total_spend),
    0,
  )

  return buildMonthlyMetrics({
    year: targetYear,
    month: targetMonth,
    ...totals,
    adSpend,
    byPlatform: byPlatform.sort((a, b) => b.grossRevenue - a.grossRevenue),
  })
}

/**
 * Lançamentos manuais do ano, para a tela do admin.
 *
 * A Home não usa esta função: lá o número já chega somado pelas views. Aqui
 * é o contrário — o admin precisa ver a parcela manual isolada para saber o
 * que ele mesmo digitou.
 */
export async function getManualPlatformRevenue(year: number): Promise<ManualPlatformRevenue[]> {
  // Service role de propósito: a tabela tem RLS sem policy de leitura, como
  // sales_transactions. O cliente anônimo veria zero linhas — sem erro, só
  // vazio — e a tela do admin apareceria em branco com os dados no lugar.
  const supabase = getSupabaseAdminClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('manual_platform_revenue')
    .select('*')
    .eq('year', year)
    .order('month', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({
    ...row,
    gross_revenue: toNumber(row.gross_revenue),
    platform_fees: toNumber(row.platform_fees),
    net_revenue: row.net_revenue === null ? null : toNumber(row.net_revenue),
    sales_count: toNumber(row.sales_count),
  })) as ManualPlatformRevenue[]
}

/**
 * Faturamento por mês E plataforma — usado para mostrar, no admin, o que já
 * veio de webhook antes de a pessoa lançar o mesmo mês à mão.
 */
export async function getMonthlyRevenueByPlatform(
  year: number,
): Promise<Record<string, Record<number, number>>> {
  const supabase = await getSupabaseServerClient()
  const mapa: Record<string, Record<number, number>> = {}
  if (!supabase) return mapa

  const { data, error } = await supabase
    .from('v_monthly_revenue')
    .select('month, platform, gross_revenue')
    .eq('year', year)

  if (error || !data) return mapa

  for (const row of data) {
    const platform = String(row.platform)
    mapa[platform] ??= {}
    const month = Number(row.month)
    mapa[platform][month] = (mapa[platform][month] ?? 0) + toNumber(row.gross_revenue)
  }
  return mapa
}

// ---------------------------------------------------------------------------
//  BLOCO 3 — Ações de marketing
// ---------------------------------------------------------------------------

export async function getMarketingActions(
  options: { includeInactive?: boolean } = {},
): Promise<MarketingAction[]> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []

  let query = supabase.from('marketing_actions').select('*').order('sort_order', { ascending: true })

  if (!options.includeInactive) {
    query = query.in('status', ['active', 'paused'])
  }

  const { data, error } = await query
  if (error || !data) return []

  return data.map(normalizeAction)
}

/** Garante que links/briefings/metrics cheguem como estrutura utilizável. */
function normalizeAction(row: Record<string, unknown>): MarketingAction {
  const parseList = (value: unknown) => {
    if (Array.isArray(value)) return value as MarketingAction['links']
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  }

  return {
    ...(row as unknown as MarketingAction),
    links: parseList(row.links),
    briefings: parseList(row.briefings),
    metrics: (row.metrics && typeof row.metrics === 'object'
      ? row.metrics
      : {}) as MarketingAction['metrics'],
  }
}

// ---------------------------------------------------------------------------
//  BLOCO 4 — Documentos
// ---------------------------------------------------------------------------

export async function getDocumentCategories(): Promise<CategoryWithDocuments[]> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return []

  const [categoriesResult, documentsResult] = await Promise.all([
    supabase.from('document_categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('documents').select('*').order('sort_order', { ascending: true }),
  ])

  const categories = (categoriesResult.data ?? []) as DocumentCategory[]
  const documents = (documentsResult.data ?? []) as DocumentItem[]

  return categories.map((category) => ({
    ...category,
    documents: documents.filter((doc) => doc.category_id === category.id),
  }))
}
