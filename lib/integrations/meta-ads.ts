import 'server-only'

import { getMonthDateRange } from '@/lib/calculations'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { toNumber } from '@/lib/utils'

/**
 * Integração com o Meta Ads (Marketing API).
 *
 * O Meta NÃO envia gasto por webhook — os webhooks da plataforma cobrem
 * mudanças de entidade, não métricas. Então o investimento é puxado da
 * Graph API por um job agendado (ver vercel.json) e materializado em
 * `ad_spend`, o que também mantém o histórico caso o token expire.
 *
 * Suporta várias contas de anúncio: META_ADS_ACCOUNT_ID aceita uma lista
 * separada por vírgula. Cada conta é gravada com o próprio `account_id`, e
 * o Bloco 2 soma tudo — a consulta do painel filtra por data, não por conta.
 */

const DEFAULT_API_VERSION = 'v21.0'

/** O Postgres tem limite de parâmetros por comando; grava em lotes. */
const TAMANHO_LOTE = 500

export interface MetaAdsAccountResult {
  accountId: string
  ok: boolean
  rows: number
  spend: number
  error?: string
}

export interface MetaAdsSyncResult {
  ok: boolean
  message: string
  rowsUpserted: number
  totalSpend: number
  range?: { since: string; until: string }
  /** Detalhe por conta — é o que mostra qual delas o token não alcança. */
  accounts: MetaAdsAccountResult[]
}

interface MetaInsightRow {
  date_start?: string
  date_stop?: string
  spend?: string
  impressions?: string
  clicks?: string
  campaign_id?: string
  campaign_name?: string
  actions?: { action_type: string; value: string }[]
  action_values?: { action_type: string; value: string }[]
}

export function isMetaAdsConfigured(): boolean {
  return Boolean(process.env.META_ADS_ACCESS_TOKEN && parseAccountIds().length > 0)
}

/**
 * Lê META_ADS_ACCOUNT_ID como lista.
 *
 * Aceita vírgula, ponto e vírgula ou quebra de linha como separador, e
 * normaliza o prefixo `act_`. Um valor único continua funcionando igual —
 * quem já tinha uma conta configurada não precisa mexer em nada.
 */
export function parseAccountIds(raw = process.env.META_ADS_ACCOUNT_ID): string[] {
  if (!raw) return []

  const ids = raw
    .split(/[,;\n]/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((id) => (id.startsWith('act_') ? id : `act_${id}`))

  // Repetir a mesma conta duplicaria as chamadas e não mudaria o total.
  return [...new Set(ids)]
}

/** Soma as conversões relevantes (compras) retornadas pelo Meta. */
function extractConversions(row: MetaInsightRow): number {
  if (!Array.isArray(row.actions)) return 0

  const purchaseTypes = new Set([
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
  ])

  return row.actions
    .filter((action) => purchaseTypes.has(action.action_type))
    .reduce((sum, action) => sum + toNumber(action.value), 0)
}

/** Receita atribuída pelo pixel — usada como referência, não no ROAS oficial. */
function extractAttributedRevenue(row: MetaInsightRow): number {
  if (!Array.isArray(row.action_values)) return 0

  const purchaseTypes = new Set([
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
  ])

  return row.action_values
    .filter((action) => purchaseTypes.has(action.action_type))
    .reduce((sum, action) => sum + toNumber(action.value), 0)
}

/** Busca os insights de UMA conta, paginando até o fim. */
async function fetchAccountInsights(
  account: string,
  options: { since: string; until: string; accessToken: string; apiVersion: string },
): Promise<{ ok: boolean; rows: MetaInsightRow[]; error?: string }> {
  const url = new URL(`https://graph.facebook.com/${options.apiVersion}/${account}/insights`)

  url.searchParams.set(
    'fields',
    'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values',
  )
  url.searchParams.set('level', 'campaign')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set('time_range', JSON.stringify({ since: options.since, until: options.until }))
  url.searchParams.set('limit', '500')
  url.searchParams.set('access_token', options.accessToken)

  const rows: MetaInsightRow[] = []
  let nextUrl: string | null = url.toString()
  let pages = 0

  try {
    // O teto de 20 páginas evita loop infinito caso a API devolva um cursor repetido.
    while (nextUrl && pages < 20) {
      const response: Response = await fetch(nextUrl, { cache: 'no-store' })
      const payload = (await response.json()) as {
        data?: MetaInsightRow[]
        paging?: { next?: string }
        error?: { message?: string; code?: number }
      }

      if (!response.ok || payload.error) {
        return {
          ok: false,
          rows: [],
          error: payload.error?.message ?? `HTTP ${response.status}`,
        }
      }

      rows.push(...(payload.data ?? []))
      nextUrl = payload.paging?.next ?? null
      pages += 1
    }

    return { ok: true, rows }
  } catch (error) {
    return { ok: false, rows: [], error: `falha de rede: ${(error as Error).message}` }
  }
}

/**
 * Sincroniza o gasto de um período, em todas as contas configuradas.
 * Sem datas, usa o mês corrente.
 *
 * Uma conta que falha NÃO aborta as outras: o token pode ter permissão numa
 * e não noutra, e perder o gasto de todas por causa de uma seria pior do que
 * gravar o que dá e apontar qual falhou.
 */
export async function syncMetaAdsSpend(options: {
  since?: string
  until?: string
} = {}): Promise<MetaAdsSyncResult> {
  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  const apiVersion = process.env.META_API_VERSION || DEFAULT_API_VERSION
  const accounts = parseAccountIds()

  if (!accessToken || accounts.length === 0) {
    return {
      ok: false,
      message: 'Meta Ads não configurado. Defina META_ADS_ACCESS_TOKEN e META_ADS_ACCOUNT_ID.',
      rowsUpserted: 0,
      totalSpend: 0,
      accounts: [],
    }
  }

  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    return {
      ok: false,
      message: 'Supabase não configurado — não há onde gravar o gasto.',
      rowsUpserted: 0,
      totalSpend: 0,
      accounts: [],
    }
  }

  const now = new Date()
  const fallback = getMonthDateRange(now.getUTCFullYear(), now.getUTCMonth() + 1)
  const since = options.since ?? fallback.start
  const until = options.until ?? fallback.end
  const range = { since, until }

  const resultados: MetaAdsAccountResult[] = []
  const registros: Record<string, unknown>[] = []

  for (const account of accounts) {
    const { ok, rows, error } = await fetchAccountInsights(account, {
      since,
      until,
      accessToken,
      apiVersion,
    })

    if (!ok) {
      resultados.push({ accountId: account, ok: false, rows: 0, spend: 0, error })
      continue
    }

    const daConta = rows
      .filter((row) => row.date_start)
      .map((row) => ({
        platform: 'meta_ads' as const,
        account_id: account,
        campaign_id: row.campaign_id ?? 'all',
        campaign_name: row.campaign_name ?? null,
        spend_date: row.date_start as string,
        spend: toNumber(row.spend),
        impressions: Math.round(toNumber(row.impressions)),
        clicks: Math.round(toNumber(row.clicks)),
        conversions: extractConversions(row),
        revenue_attributed: extractAttributedRevenue(row),
        raw_payload: row as unknown as Record<string, unknown>,
      }))

    registros.push(...daConta)
    resultados.push({
      accountId: account,
      ok: true,
      rows: daConta.length,
      spend: daConta.reduce((soma, r) => soma + r.spend, 0),
    })
  }

  const falhas = resultados.filter((r) => !r.ok)

  // Nenhuma conta respondeu: não é sucesso parcial, é erro.
  if (falhas.length === accounts.length) {
    return {
      ok: false,
      message:
        accounts.length === 1
          ? `Meta Ads recusou a requisição: ${falhas[0].error}`
          : `Nenhuma das ${accounts.length} contas respondeu. Primeira falha: ${falhas[0].error}`,
      rowsUpserted: 0,
      totalSpend: 0,
      range,
      accounts: resultados,
    }
  }

  if (registros.length > 0) {
    for (let i = 0; i < registros.length; i += TAMANHO_LOTE) {
      const lote = registros.slice(i, i + TAMANHO_LOTE)
      const { error } = await supabase
        .from('ad_spend')
        .upsert(lote, { onConflict: 'platform,account_id,campaign_id,spend_date' })

      if (error) {
        return {
          ok: false,
          message: `Erro ao gravar gasto: ${error.message}`,
          rowsUpserted: i,
          totalSpend: 0,
          range,
          accounts: resultados,
        }
      }
    }
  }

  const totalSpend = registros.reduce((soma, r) => soma + Number(r.spend ?? 0), 0)
  const contasOk = resultados.filter((r) => r.ok).length

  const partes: string[] = []
  if (registros.length === 0) {
    partes.push('Nenhum gasto retornado pelo Meta Ads no período.')
  } else {
    partes.push(
      `${registros.length} registro(s) sincronizado(s)` +
        (accounts.length > 1 ? ` de ${contasOk} de ${accounts.length} contas.` : '.'),
    )
  }
  if (falhas.length > 0) {
    partes.push(
      `Falharam: ${falhas.map((f) => `${f.accountId} (${f.error})`).join('; ')}.`,
    )
  }

  return {
    ok: true,
    message: partes.join(' '),
    rowsUpserted: registros.length,
    totalSpend,
    range,
    accounts: resultados,
  }
}
