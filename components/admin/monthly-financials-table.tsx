'use client'

import { Check } from 'lucide-react'

import { ActionForm } from '@/components/admin/action-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveMonthlyFinancial } from '@/app/admin/actions'
import type { MonthlyFinancial } from '@/lib/types'
import { MONTH_NAMES, cn, formatCurrency, formatPercent } from '@/lib/utils'

interface MonthlyFinancialsTableProps {
  year: number
  financials: MonthlyFinancial[]
  /** Faturamento vindo dos webhooks, por mês — referência para o preenchimento. */
  salesByMonth: Record<number, number>
}

/**
 * Fechamento financeiro mês a mês.
 *
 * Cada linha é um <form> independente: salvar março não interfere em abril.
 * Por isso o layout é grid e não <table> — um <form> não pode ser filho de
 * <tr>, e o browser descartaria a tag, quebrando o envio.
 */
const GRID = 'grid grid-cols-[7rem_9rem_9rem_8rem_8rem_6rem_7rem] gap-2 items-center'

export function MonthlyFinancialsTable({
  year,
  financials,
  salesByMonth,
}: MonthlyFinancialsTableProps) {
  const byMonth = new Map(financials.map((item) => [item.month, item]))

  const totalSales = Object.values(salesByMonth).reduce((sum, value) => sum + value, 0)
  const totalManual = financials.reduce((sum, item) => sum + Number(item.revenue_manual ?? 0), 0)
  const totalCosts = financials.reduce((sum, item) => sum + Number(item.costs ?? 0), 0)
  const totalEbitda = financials.reduce((sum, item) => sum + Number(item.ebitda_value ?? 0), 0)

  const filledPct = financials.filter((item) => item.ebitda_pct !== null)
  const avgPct =
    filledPct.length > 0
      ? filledPct.reduce((sum, item) => sum + Number(item.ebitda_pct), 0) / filledPct.length
      : null

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[58rem]">
        <div
          className={cn(
            GRID,
            'border-b border-border px-1 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase',
          )}
        >
          <span>Mês</span>
          <span>Webhooks</span>
          <span>Faturamento oficial</span>
          <span>Custos</span>
          <span>EBITDA (R$)</span>
          <span>EBITDA (%)</span>
          <span />
        </div>

        {MONTH_NAMES.map((name, index) => {
          const month = index + 1
          const record = byMonth.get(month)
          const salesValue = salesByMonth[month] ?? 0
          const isFilled = record?.ebitda_pct !== null && record?.ebitda_pct !== undefined

          return (
            <ActionForm
              key={month}
              action={saveMonthlyFinancial}
              className={cn(GRID, 'border-b border-border px-1 py-1.5 last:border-0')}
            >
              {(pending, state) => (
                <>
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="month" value={month} />

                  <span className="flex items-center gap-1.5 text-sm">
                    <span
                      className={cn('size-1.5 rounded-full', isFilled ? 'bg-positive' : 'bg-border')}
                      aria-hidden
                    />
                    <span className="font-medium">{name}</span>
                  </span>

                  <span className="text-xs text-muted-foreground tabular">
                    {salesValue > 0 ? formatCurrency(salesValue) : '—'}
                  </span>

                  <Input
                    name="revenue_manual"
                    defaultValue={record?.revenue_manual ?? ''}
                    placeholder={salesValue > 0 ? salesValue.toFixed(2) : '0,00'}
                    inputMode="decimal"
                    className="h-8 text-xs"
                    aria-label={`Faturamento oficial de ${name}`}
                  />

                  <Input
                    name="costs"
                    defaultValue={record?.costs ?? ''}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="h-8 text-xs"
                    aria-label={`Custos de ${name}`}
                  />

                  <Input
                    name="ebitda_value"
                    defaultValue={record?.ebitda_value ?? ''}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="h-8 text-xs"
                    aria-label={`EBITDA em reais de ${name}`}
                  />

                  <Input
                    name="ebitda_pct"
                    defaultValue={record?.ebitda_pct ?? ''}
                    placeholder="22,5"
                    inputMode="decimal"
                    className="h-8 text-xs"
                    aria-label={`EBITDA percentual de ${name}`}
                  />

                  <span className="flex items-center gap-1.5">
                    <Button type="submit" size="sm" variant="outline" disabled={pending}>
                      {pending ? '...' : 'Salvar'}
                    </Button>
                    {state?.ok ? (
                      <Check className="size-3.5 shrink-0 text-positive" aria-label="Salvo" />
                    ) : null}
                    {state && !state.ok ? (
                      <span
                        className="cursor-help text-[11px] text-destructive"
                        title={state.message}
                      >
                        erro
                      </span>
                    ) : null}
                  </span>
                </>
              )}
            </ActionForm>
          )
        })}

        <div className={cn(GRID, 'border-t-2 border-border px-1 pt-2 text-xs font-semibold')}>
          <span>Acumulado</span>
          <span className="tabular">{formatCurrency(totalSales)}</span>
          <span className="tabular">{formatCurrency(totalManual)}</span>
          <span className="tabular">{formatCurrency(totalCosts)}</span>
          <span className="tabular">{formatCurrency(totalEbitda)}</span>
          <span className="tabular">{avgPct === null ? '—' : formatPercent(avgPct)}</span>
          <span />
        </div>
      </div>
    </div>
  )
}
