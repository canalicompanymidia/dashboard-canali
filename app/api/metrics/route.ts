import { NextResponse } from 'next/server'

import { getColaborador } from '@/lib/auth'
import { getBusinessDateParts } from '@/lib/calculations'
import { getMonthlyMetrics } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/metrics?year=2026&month=8
 *
 * Métricas do mês já calculadas. O Bloco 2 chama este endpoint quando o
 * Realtime avisa que uma venda entrou — assim o recálculo acontece no
 * servidor, e o cliente nunca precisa ler a tabela de transações.
 */
export async function GET(request: Request) {
  // Esta rota devolve o faturamento do mês em JSON. Sem esta checagem ela
  // era a porta dos fundos do Bloco 2: bastava a URL, sem passar por
  // nenhuma tela.
  if (!(await getColaborador())) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const today = getBusinessDateParts()

  const year = Number(params.get('year')) || today.year
  const month = Number(params.get('month')) || today.month

  if (month < 1 || month > 12) {
    return NextResponse.json({ ok: false, error: 'Mês inválido.' }, { status: 400 })
  }

  const metrics = await getMonthlyMetrics(year, month)

  return NextResponse.json(
    { ok: true, metrics },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
