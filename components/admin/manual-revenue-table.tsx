'use client'

import { Check } from 'lucide-react'

import { ActionForm } from '@/components/admin/action-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveManualPlatformRevenue } from '@/app/admin/actions'
import type { ManualPlatformRevenue, PlatformSource } from '@/lib/types'
import { MONTH_NAMES, cn, formatCurrency } from '@/lib/utils'

interface ManualRevenueTableProps {
  year: number
  platform: PlatformSource
  /** Lançamentos já gravados desta plataforma, por mês. */
  entries: ManualPlatformRevenue[]
  /**
   * Faturamento total que a Home já mostra para esta plataforma, por mês —
   * inclui o próprio lançamento manual. Serve para o time perceber quando um
   * mês também tem venda vinda de webhook.
   */
  totalByMonth: Record<number, number>
}

/**
 * Lançamento do faturamento mensal de uma plataforma.
 *
 * Mesma estrutura da tabela de fechamento: cada mês é um <form> próprio, em
 * grid e não em <table>, porque um <form> não pode ser filho de <tr> — o
 * browser descarta a tag e o envio quebra.
 */
const GRID = 'grid grid-cols-[6.5rem_8.5rem_7.5rem_8.5rem_6rem_8.5rem_6.5rem] gap-2 items-center'

export function ManualRevenueTable({
  year,
  platform,
  entries,
  totalByMonth,
}: ManualRevenueTableProps) {
  const byMonth = new Map(entries.map((item) => [item.month, item]))

  const totalBruto = entries.reduce((sum, item) => sum + Number(item.gross_revenue), 0)
  const totalTaxas = entries.reduce((sum, item) => sum + Number(item.platform_fees), 0)
  const totalLiquido = entries.reduce(
    (sum, item) => sum + Number(item.net_revenue ?? item.gross_revenue - item.platform_fees),
    0,
  )
  const totalVendas = entries.reduce((sum, item) => sum + Number(item.sales_count), 0)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[56rem]">
        <div
          className={cn(
            GRID,
            'border-b border-border px-1 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase',
          )}
        >
          <span>Mês</span>
          <span>Bruto (R$)</span>
          <span>Taxas (R$)</span>
          <span>Líquido (R$)</span>
          <span>Nº vendas</span>
          <span>Total na Home</span>
          <span />
        </div>

        {MONTH_NAMES.map((name, index) => {
          const month = index + 1
          const record = byMonth.get(month)
          const totalHome = totalByMonth[month] ?? 0
          const lancado = record !== undefined

          // Sobra webhook neste mês quando a Home mostra mais do que foi
          // lançado à mão — sinal de que a plataforma também enviou venda.
          const viaWebhook = totalHome - Number(record?.gross_revenue ?? 0)

          return (
            <ActionForm
              key={month}
              action={saveManualPlatformRevenue}
              className={cn(GRID, 'border-b border-border px-1 py-1.5 last:border-0')}
            >
              {(pending, state) => (
                <>
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="platform" value={platform} />

                  <span className="flex items-center gap-1.5 text-sm">
                    <span
                      className={cn('size-1.5 rounded-full', lancado ? 'bg-positive' : 'bg-border')}
                      aria-hidden
                    />
                    <span className="font-medium">{name}</span>
                  </span>

                  <Input
                    name="gross_revenue"
                    defaultValue={record?.gross_revenue ?? ''}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="h-8 text-xs"
                    aria-label={`Faturamento bruto de ${name}`}
                  />

                  <Input
                    name="platform_fees"
                    defaultValue={record?.platform_fees ?? ''}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="h-8 text-xs"
                    aria-label={`Taxas da plataforma em ${name}`}
                  />

                  <Input
                    name="net_revenue"
                    defaultValue={record?.net_revenue ?? ''}
                    placeholder="bruto − taxas"
                    inputMode="decimal"
                    className="h-8 text-xs"
                    aria-label={`Faturamento líquido de ${name}`}
                  />

                  <Input
                    name="sales_count"
                    defaultValue={record?.sales_count || ''}
                    placeholder="0"
                    inputMode="numeric"
                    className="h-8 text-xs"
                    aria-label={`Quantidade de vendas em ${name}`}
                  />

                  <span className="text-xs tabular">
                    {totalHome > 0 ? (
                      <>
                        <span className="font-medium">{formatCurrency(totalHome)}</span>
                        {viaWebhook > 0.005 && lancado ? (
                          <span
                            className="block text-[10px] text-warning-foreground dark:text-warning"
                            title="Esta plataforma também enviou venda por webhook neste mês. Confira se o valor lançado à mão não repete o que já entrou sozinho."
                          >
                            +{formatCurrency(viaWebhook)} de webhook
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>

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
          <span className="tabular">{formatCurrency(totalBruto)}</span>
          <span className="tabular">{formatCurrency(totalTaxas)}</span>
          <span className="tabular">{formatCurrency(totalLiquido)}</span>
          <span className="tabular">{totalVendas > 0 ? totalVendas : '—'}</span>
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}
