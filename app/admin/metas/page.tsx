import { Plus, Target, TrendingUp } from 'lucide-react'

import { GoalForm } from '@/components/admin/goal-form'
import { MonthlyFinancialsTable } from '@/components/admin/monthly-financials-table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getBusinessDateParts } from '@/lib/calculations'
import {
  calcAccumulatedEbitda,
  getAnnualGoals,
  getMonthlyFinancials,
  getMonthlyGrossRevenueRecord,
} from '@/lib/data'
import { formatCurrency, formatPercent } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function AdminGoalsPage() {
  const { year } = getBusinessDateParts()

  const [goals, financials, salesByMonth] = await Promise.all([
    getAnnualGoals(year),
    getMonthlyFinancials(year),
    getMonthlyGrossRevenueRecord(year),
  ])

  const ebitda = calcAccumulatedEbitda(financials)

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="size-4" />
                Metas anuais de {year}
              </CardTitle>
              <CardDescription>
                Cada meta vira um painel no Bloco 1 da Home, com barra de progresso e projeção.
              </CardDescription>
            </div>
            <Badge variant="muted">{goals.length} meta(s)</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {goals.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhuma meta cadastrada para {year}. Crie a primeira no formulário abaixo.
            </p>
          ) : (
            goals.map((goal) => (
              <div key={goal.id} className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="outline">{goal.label}</Badge>
                  <span className="text-sm font-medium tabular">
                    {formatCurrency(goal.target_revenue)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular">
                    EBITDA {formatPercent(goal.target_ebitda_pct)}
                  </span>
                  {!goal.is_active ? <Badge variant="muted">Oculta</Badge> : null}
                </div>
                <GoalForm goal={goal} defaultYear={year} />
              </div>
            ))
          )}

          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Plus className="size-4" />
              Nova meta
            </h3>
            <GoalForm defaultYear={year} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-4" />
                Fechamento mensal & EBITDA de {year}
              </CardTitle>
              <CardDescription>
                Lance o EBITDA de cada mês. O acumulado do ano aparece nos dois painéis da Home.
              </CardDescription>
            </div>

            <div className="text-right">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                EBITDA acumulado
              </p>
              <p className="text-xl font-semibold tabular">
                {ebitda.pct === null ? '—' : formatPercent(ebitda.pct)}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">Faturamento oficial</strong> substitui o número
              dos webhooks no cálculo da meta — preencha só quando o mês fechar na contabilidade.
              Meses em branco seguem usando o valor em tempo real.
            </p>
            <p className="mt-1">
              Com <strong className="text-foreground">EBITDA (R$)</strong> e{' '}
              <strong className="text-foreground">faturamento oficial</strong> preenchidos, o
              acumulado é calculado de verdade (soma ÷ soma). Só com o percentual, vira média
              simples dos meses informados.
            </p>
          </div>

          <MonthlyFinancialsTable
            year={year}
            financials={financials}
            salesByMonth={salesByMonth}
          />
        </CardContent>
      </Card>
    </div>
  )
}
