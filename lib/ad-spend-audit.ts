import 'server-only'

import { getBusinessDateParts } from '@/lib/calculations'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { toNumber } from '@/lib/utils'

/**
 * Conferência do investimento em tráfego do mês, origem por origem.
 *
 * Existe por um motivo concreto: `v_monthly_ad_spend` agrupa por plataforma e
 * o painel soma as linhas. Isso é o certo quando cada origem representa um
 * gasto diferente — mas se o mesmo mês foi lançado à mão E depois puxado da
 * API do Meta, o total dobra silenciosamente. Aqui a leitura usa a service
 * role, então enxerga tudo, e o admin consegue ver o que a Home está somando.
 */

export interface AdSpendOrigem {
  platform: string
  total: number
}

export interface AdSpendAudit {
  year: number
  month: number
  origens: AdSpendOrigem[]
  total: number
  /** Meta Ads e lançamento manual no mesmo mês — total provavelmente dobrado. */
  possivelDuplicidade: boolean
  erro?: string
}

export async function auditAdSpend(year?: number, month?: number): Promise<AdSpendAudit> {
  const hoje = getBusinessDateParts()
  const ano = year ?? hoje.year
  const mes = month ?? hoje.month

  const vazio: AdSpendAudit = {
    year: ano,
    month: mes,
    origens: [],
    total: 0,
    possivelDuplicidade: false,
  }

  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    return { ...vazio, erro: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' }
  }

  const { data, error } = await supabase
    .from('v_monthly_ad_spend')
    .select('platform, total_spend')
    .eq('year', ano)
    .eq('month', mes)

  if (error) return { ...vazio, erro: error.message }

  const origens = (data ?? [])
    .map((row) => ({
      platform: String(row.platform),
      total: toNumber(row.total_spend),
    }))
    .filter((origem) => origem.total !== 0)
    .sort((a, b) => b.total - a.total)

  const nomes = new Set(origens.map((origem) => origem.platform))

  return {
    year: ano,
    month: mes,
    origens,
    total: origens.reduce((soma, origem) => soma + origem.total, 0),
    possivelDuplicidade: nomes.has('meta_ads') && nomes.has('manual'),
  }
}
