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
 */

const DEFAULT_API_VERSION = 'v21.0'

export interface MetaAdsSyncResult {
  ok: boolean
  message: string
  rowsUpserted: number
  totalSpend: number
  range?: { since: string; until: string }
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
  return Boolean(process.env.META_ADS_ACCESS_TOKEN && process.env.META_ADS_ACCOUNT_ID)
}

/** Normaliza o ID da conta: aceita com ou sem o prefixo `act_`. */
function normalizeAccountId(accountId: string): string {
  return accountId.startsWith('act_') ? accountId : `act_${accountId}`
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

/**
 * Sincroniza o gasto de um período. Sem datas, usa o mês corrente.
 * A granularidade é diária (`time_increment=1`) por campanha, o que permite
 * recortar qualquer período depois sem nova chamada à API.
 */
export async function syncMetaAdsSpend(options: {
  since?: string
  until?: string
} = {}): Promise<MetaAdsSyncResult> {
  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  const accountId = process.env.META_ADS_ACCOUNT_ID
  const apiVersion = process.env.META_API_VERSION || DEFAULT_API_VERSION

  if (!accessToken || !accountId) {
    return {
      ok: false,
      message:
        'Meta Ads não configurado. Defina META_ADS_ACCESS_TOKEN e META_ADS_ACCOUNT_ID.',
      rowsUpserted: 0,
      totalSpend: 0,
    }
  }

  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    return {
      ok: false,
      message: 'Supabase não configurado — não há onde gravar o gasto.',
      rowsUpserted: 0,
      totalSpend: 0,
    }
  }

  const now = new Date()
  const fallback = getMonthDateRange(now.getUTCFullYear(), now.getUTCMonth() + 1)
  const since = options.since ?? fallback.start
  const until = options.until ?? fallback.end

  const account = normalizeAccountId(accountId)
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${account}/insights`)

  url.searchParams.set('fields', 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values')
  url.searchParams.set('level', 'campaign')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('limit', '500')
  url.searchParams.set('access_token', accessToken)

  try {
    const rows: MetaInsightRow[] = []
    let nextUrl: string | null = url.toString()
    let pages = 0

    // Pagina até acabar; o teto de 20 páginas evita loop infinito caso a
    // API devolva um cursor repetido.
    while (nextUrl && pages < 20) {
      const response: Response = await fetch(nextUrl, { cache: 'no-store' })
      const payload = (await response.json()) as {
        data?: MetaInsightRow[]
        paging?: { next?: string }
        error?: { message?: string; code?: number }
      }

      if (!response.ok || payload.error) {
        const detail = payload.error?.message ?? `HTTP ${response.status}`
        return {
          ok: false,
          message: `Meta Ads recusou a requisição: ${detail}`,
          rowsUpserted: 0,
          totalSpend: 0,
          range: { since, until },
        }
      }

      rows.push(...(payload.data ?? []))
      nextUrl = payload.paging?.next ?? null
      pages += 1
    }

    if (rows.length === 0) {
      return {
        ok: true,
        message: 'Nenhum gasto retornado pelo Meta Ads no período.',
        rowsUpserted: 0,
        totalSpend: 0,
        range: { since, until },
      }
    }

    const records = rows
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

    const { error } = await supabase
      .from('ad_spend')
      .upsert(records, { onConflict: 'platform,account_id,campaign_id,spend_date' })

    if (error) {
      return {
        ok: false,
        message: `Erro ao gravar gasto: ${error.message}`,
        rowsUpserted: 0,
        totalSpend: 0,
        range: { since, until },
      }
    }

    const totalSpend = records.reduce((sum, row) => sum + row.spend, 0)

    return {
      ok: true,
      message: `${records.length} registro(s) de gasto sincronizado(s).`,
      rowsUpserted: records.length,
      totalSpend,
      range: { since, until },
    }
  } catch (error) {
    return {
      ok: false,
      message: `Falha de rede ao consultar o Meta Ads: ${(error as Error).message}`,
      rowsUpserted: 0,
      totalSpend: 0,
      range: { since, until },
    }
  }
}
