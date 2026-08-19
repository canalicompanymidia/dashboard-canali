import { HandCoins, Info } from 'lucide-react'

import { ManualRevenueTable } from '@/components/admin/manual-revenue-table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PLATFORM_LABELS, getBusinessDateParts } from '@/lib/calculations'
import { getManualPlatformRevenue, getMonthlyRevenueByPlatform } from '@/lib/data'
import type { PlatformSource } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * Plataformas que ganham uma tabela de lançamento.
 *
 * A Hotmart fica de fora: a integração dela funciona, e oferecer um campo
 * manual ao lado do webhook é um convite a contar a mesma venda duas vezes.
 * "Outras origens" cobre faturamento fora das três plataformas.
 */
const PLATAFORMAS: { platform: PlatformSource; titulo: string; descricao: string }[] = [
  {
    platform: 'onprofit',
    titulo: 'OnProfit',
    descricao: 'Sem integração automática. Lance aqui o acumulado de cada mês.',
  },
  {
    platform: 'tmb',
    titulo: 'TMB',
    descricao: 'Sem integração automática. Lance aqui o acumulado de cada mês.',
  },
  {
    platform: 'manual',
    titulo: 'Outras origens',
    descricao: 'Vendas fora da Hotmart, OnProfit e TMB — contrato direto, PIX, permuta.',
  },
]

export default async function AdminSalesPage() {
  const { year } = getBusinessDateParts()

  const [lancamentos, porPlataforma] = await Promise.all([
    getManualPlatformRevenue(year),
    getMonthlyRevenueByPlatform(year),
  ])

  const totalManual = lancamentos.reduce((soma, item) => soma + Number(item.gross_revenue), 0)

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HandCoins className="size-4" />
                Faturamento manual de {year}
              </CardTitle>
              <CardDescription>
                Para plataformas sem integração. O valor entra somado ao da Hotmart nas Métricas
                do Mês e nas Metas Anuais da Home.
              </CardDescription>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Lançado no ano
              </p>
              <p className="text-xl font-semibold tabular">{formatCurrency(totalManual)}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <p>
                <strong className="text-foreground">Bruto</strong> é o faturamento aprovado do mês,
                já sem os reembolsos. Deixe <strong className="text-foreground">Líquido</strong> em
                branco para o sistema calcular <em>bruto − taxas</em>; preencha só quando a
                plataforma informar um líquido diferente disso.
              </p>
              <p>
                O valor é <strong className="text-foreground">acumulado do mês</strong>, não
                incremental: salvar de novo substitui o número anterior.{' '}
                <strong className="text-foreground">Para apagar um lançamento</strong>, limpe todos
                os campos da linha e salve.
              </p>
              <p>
                <strong className="text-foreground">Nº de vendas</strong> não é obrigatório, mas
                sem ele o ticket médio da Home fica alto demais — o faturamento sobe e a
                contagem de vendas não acompanha.
              </p>
              <p>
                O fechamento oficial em{' '}
                <strong className="text-foreground">Metas &amp; EBITDA</strong> continua tendo a
                palavra final: se um mês tiver &quot;faturamento oficial&quot; preenchido, ele
                substitui a soma automática daquele mês no cálculo da meta.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {PLATAFORMAS.map((item) => {
        const doPlatform = lancamentos.filter((l) => l.platform === item.platform)
        const bruto = doPlatform.reduce((soma, l) => soma + Number(l.gross_revenue), 0)

        return (
          <Card key={item.platform}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{item.titulo}</CardTitle>
                  <CardDescription>{item.descricao}</CardDescription>
                </div>
                <Badge variant={bruto > 0 ? 'positive' : 'muted'}>
                  {bruto > 0 ? formatCurrency(bruto) : 'sem lançamento'}
                </Badge>
              </div>
            </CardHeader>

            <CardContent>
              <ManualRevenueTable
                year={year}
                platform={item.platform}
                entries={doPlatform}
                totalByMonth={porPlataforma[item.platform] ?? {}}
              />
            </CardContent>
          </Card>
        )
      })}

      <p className="px-1 text-xs text-muted-foreground">
        Plataformas com integração ativa não aparecem aqui — a Hotmart chega por webhook e é
        exibida na Home como {PLATFORM_LABELS.hotmart}.
      </p>
    </div>
  )
}
