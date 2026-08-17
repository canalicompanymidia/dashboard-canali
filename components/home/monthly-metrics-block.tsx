'use client'

import * as React from 'react'
import {
  Activity,
  ArrowDownRight,
  BadgePercent,
  Banknote,
  Coins,
  Info,
  Megaphone,
  RefreshCw,
  ShoppingCart,
  Wallet,
} from 'lucide-react'

import { Section } from '@/components/home/section'
import { Stat } from '@/components/home/stat'
import { Button } from '@/components/ui/button'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { PLATFORM_LABELS } from '@/lib/calculations'
import type { MonthlyMetrics } from '@/lib/types'
import {
  cn,
  formatCurrency,
  formatMultiplier,
  formatNumber,
  formatPercent,
} from '@/lib/utils'

interface MonthlyMetricsBlockProps {
  initialMetrics: MonthlyMetrics
}

const POLL_INTERVAL_MS = 90_000

/**
 * BLOCO 2 — Métricas do mês em tempo real.
 *
 * Estratégia de atualização em três camadas, da mais rápida à mais confiável:
 *  1. Realtime do Supabase avisa quando um webhook grava uma venda;
 *  2. o recálculo é pedido a /api/metrics (a conta acontece no servidor, o
 *     cliente nunca lê a tabela de transações);
 *  3. um polling de 90s cobre quedas de WebSocket e o gasto do Meta Ads,
 *     que entra por job agendado e não gera evento de Realtime.
 */
export function MonthlyMetricsBlock({ initialMetrics }: MonthlyMetricsBlockProps) {
  const [metrics, setMetrics] = React.useState(initialMetrics)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [lastSync, setLastSync] = React.useState<string | null>(null)
  const [isLive, setIsLive] = React.useState(false)
  const [showFormula, setShowFormula] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch(
        `/api/metrics?year=${initialMetrics.year}&month=${initialMetrics.month}`,
        { cache: 'no-store' },
      )
      if (response.ok) {
        const payload = (await response.json()) as { ok: boolean; metrics: MonthlyMetrics }
        if (payload.ok) {
          setMetrics(payload.metrics)
          setLastSync(
            new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          )
        }
      }
    } catch {
      // Falha de rede: mantém os últimos números válidos na tela.
    } finally {
      setIsRefreshing(false)
    }
  }, [initialMetrics.month, initialMetrics.year])

  // Marca o horário inicial só após montar, para o HTML do servidor e do
  // cliente coincidirem na primeira renderização.
  React.useEffect(() => {
    setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
  }, [])

  React.useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    let debounce: ReturnType<typeof setTimeout> | undefined

    // Uma rajada de webhooks não deve virar uma rajada de refetches.
    const scheduleRefresh = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void refresh(), 1200)
    }

    const channel = supabase
      .channel('canali-metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_transactions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ad_spend' }, scheduleRefresh)
      .subscribe((status: string) => setIsLive(status === 'SUBSCRIBED'))

    return () => {
      clearTimeout(debounce)
      void supabase.removeChannel(channel)
    }
  }, [refresh])

  React.useEffect(() => {
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  const profitIsPositive = metrics.grossProfit >= 0
  const profitMargin =
    metrics.netRevenue > 0 ? (metrics.grossProfit / metrics.netRevenue) * 100 : 0

  return (
    <Section
      id="metricas"
      index="02"
      title="Métricas do Mês"
      icon={Activity}
      actions={
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              isLive
                ? 'border-positive/25 bg-positive/10 text-positive'
                : 'border-border bg-muted text-muted-foreground',
            )}
          >
            <span className="relative flex size-1.5">
              {isLive ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-70" />
              ) : null}
              <span
                className={cn(
                  'relative inline-flex size-1.5 rounded-full',
                  isLive ? 'bg-positive' : 'bg-muted-foreground',
                )}
              />
            </span>
            {isLive ? 'Ao vivo' : 'Sincronizando'}
          </span>

          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isRefreshing}>
            <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      }
    >
      {/* KPIs principais */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Faturamento bruto"
          value={formatCurrency(metrics.grossRevenue)}
          hint={`${formatNumber(metrics.approvedCount)} venda(s) aprovada(s)`}
          icon={Banknote}
        />

        <Stat
          label="Faturamento líquido"
          value={formatCurrency(metrics.netRevenue)}
          hint={`${formatCurrency(metrics.platformFees)} em taxas descontadas`}
          icon={Coins}
        />

        <Stat
          label="Investimento em tráfego"
          value={formatCurrency(metrics.adSpend)}
          hint="Meta Ads no mês corrente"
          icon={Megaphone}
        />

        <Stat
          label="Lucro bruto do mês"
          value={formatCurrency(metrics.grossProfit)}
          hint={`Margem de ${formatPercent(profitMargin)} · líquido − tráfego`}
          icon={Wallet}
          emphasis
          tone={profitIsPositive ? 'positive' : 'negative'}
        />

        <Stat
          label="ROAS"
          value={metrics.adSpend > 0 ? formatMultiplier(metrics.roas) : '—'}
          hint={
            metrics.adSpend > 0
              ? 'Líquido ÷ investimento'
              : 'Sem investimento registrado no mês'
          }
          icon={BadgePercent}
          emphasis
          tone={metrics.roas >= 1 ? 'positive' : metrics.adSpend > 0 ? 'negative' : 'muted'}
        />
      </div>

      {/* Detalhamento */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Faturamento por plataforma
            </p>
            <span className="text-[11px] text-muted-foreground">bruto no mês</span>
          </div>

          {metrics.byPlatform.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhuma venda registrada em {metrics.monthLabel.toLowerCase()}. Assim que um webhook
              chegar, o valor aparece aqui automaticamente.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {metrics.byPlatform.map((platform) => {
                const share =
                  metrics.grossRevenue > 0
                    ? (platform.grossRevenue / metrics.grossRevenue) * 100
                    : 0

                return (
                  <li key={platform.platform}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{PLATFORM_LABELS[platform.platform]}</span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="tabular">{formatNumber(platform.approvedCount)} vendas</span>
                        <span className="font-semibold text-foreground tabular">
                          {formatCurrency(platform.grossRevenue)}
                        </span>
                        <span className="w-12 text-right text-xs tabular">
                          {formatPercent(share, 0)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-700"
                        style={{ width: `${Math.min(share, 100)}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-1.5">
              <ShoppingCart className="size-3.5 text-muted-foreground" />
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Ticket médio
              </p>
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight tabular">
              {formatCurrency(metrics.averageTicket)}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-1.5">
              <ArrowDownRight className="size-3.5 text-muted-foreground" />
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Reembolsos & estornos
              </p>
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight text-negative tabular">
              {formatCurrency(metrics.refundedAmount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(metrics.refundCount)} transação(ões) já descontada(s)
            </p>
          </div>
        </div>
      </div>

      {/* A fórmula é consulta pontual, não leitura diária: fica atrás de um
          clique para não competir com os números. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setShowFormula((current) => !current)}
          aria-expanded={showFormula}
          aria-controls="formula-metricas"
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium transition-colors',
            'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
            showFormula
              ? 'border-border bg-accent text-foreground'
              : 'border-transparent bg-muted hover:bg-accent hover:text-foreground',
          )}
        >
          <Info className="size-3" />
          Cálculo
        </button>

        {showFormula ? (
          <span id="formula-metricas">
            Bruto = vendas aprovadas · Líquido = bruto − taxas − reembolsos · Lucro = líquido −
            tráfego
          </span>
        ) : null}

        {lastSync ? <span className="ml-auto tabular">Atualizado às {lastSync}</span> : null}
      </div>
    </Section>
  )
}
