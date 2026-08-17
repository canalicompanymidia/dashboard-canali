import { CalendarRange, Target, TrendingUp } from 'lucide-react'

import { Section } from '@/components/home/section'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { getAccent } from '@/lib/accents'
import type { GoalProgress, YearContext } from '@/lib/types'
import { cn, formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/utils'

interface AnnualGoalsBlockProps {
  goals: GoalProgress[]
  accumulatedRevenue: number
  context: YearContext
}

/**
 * BLOCO 1 — Metas anuais e projeção de EBITDA.
 *
 * Cada painel responde três perguntas na ordem em que a diretoria pergunta:
 * quanto já fizemos, onde vamos fechar no ritmo atual, e como está a margem.
 */
export function AnnualGoalsBlock({ goals, accumulatedRevenue, context }: AnnualGoalsBlockProps) {
  const progressPct = context.daysElapsed / context.daysInYear

  return (
    <Section
      id="metas"
      index="01"
      title="Metas Anuais e Projeção"
      icon={Target}
      actions={
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs shadow-xs">
          <CalendarRange className="size-3.5 text-muted-foreground" />
          <span className="tabular">
            Dia {context.daysElapsed} de {context.daysInYear}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium tabular">{formatPercent(progressPct * 100, 0)} do ano</span>
        </div>
      }
    >
      {/* Faixa de contexto: o número acumulado vale para as duas metas. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border bg-card px-5 py-4 shadow-xs">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Faturamento acumulado no ano
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular sm:text-3xl">
            {formatCurrency(accumulatedRevenue)}
          </p>
        </div>

        <div className="hidden h-10 w-px bg-border sm:block" />

        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Média diária
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight tabular">
            {formatCurrency(accumulatedRevenue / Math.max(context.daysElapsed, 1))}
          </p>
        </div>

        <div className="hidden h-10 w-px bg-border sm:block" />

        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Dias restantes
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight tabular">
            {context.daysInYear - context.daysElapsed}
          </p>
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <Target className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">Nenhuma meta cadastrada para {context.year}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre as metas anuais no painel administrativo para ativar este bloco.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {goals.map((item) => (
            <GoalPanel key={item.goal.id} item={item} />
          ))}
        </div>
      )}
    </Section>
  )
}

function GoalPanel({ item }: { item: GoalProgress }) {
  const accent = getAccent(item.goal.accent)
  const { goal } = item

  const ebitdaDelta =
    item.ebitdaPct !== null ? item.ebitdaPct - Number(goal.target_ebitda_pct) : null

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md',
        accent.border,
      )}
    >
      {/* Faixa superior na cor do painel — diferencia META 1 de META 2 de relance. */}
      <div className={cn('h-1 w-full', accent.gradient)} />

      <div className="p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-widest uppercase">{goal.label}</h3>
              <Badge variant={item.onTrack ? 'positive' : 'warning'}>
                {item.onTrack ? 'No ritmo' : 'Abaixo do ritmo'}
              </Badge>
            </div>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular sm:text-[28px]">
              {formatCurrency(goal.target_revenue)}
            </p>
            {goal.description ? (
              <p className="mt-1 text-xs text-muted-foreground">{goal.description}</p>
            ) : null}
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Atingido
            </p>
            <p className={cn('text-3xl font-bold tracking-tight tabular', accent.text)}>
              {formatPercent(item.progressPct)}
            </p>
          </div>
        </header>

        <div className="mt-4">
          <Progress
            value={item.progressPct}
            indicatorClassName={accent.gradient}
            shimmer={item.progressPct < 100}
            aria-label={`Progresso da ${goal.label}`}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular">{formatCurrency(item.accumulatedRevenue)}</span>
            <span className="tabular">
              Faltam {formatCurrency(item.remaining)}
            </span>
          </div>
        </div>

        {/* Projeção linear — a leitura mais consultada do bloco. */}
        <div
          className={cn(
            'mt-4 rounded-lg border p-3.5',
            accent.surface,
            accent.border,
          )}
        >
          <div className="flex items-center gap-1.5">
            <TrendingUp className={cn('size-3.5', accent.text)} />
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Projeção linear
            </p>
          </div>
          <p className="mt-1.5 text-sm leading-snug">
            No ritmo atual, fecharemos o ano em{' '}
            <strong className={cn('text-base font-bold tabular', accent.text)}>
              {formatCurrency(item.projectedRevenue)}
            </strong>
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular">
            {formatPercent(item.projectionPct)} da meta ·{' '}
            {item.onTrack
              ? `${formatCurrencyCompact(item.projectedRevenue - Number(goal.target_revenue))} acima`
              : `${formatCurrencyCompact(Number(goal.target_revenue) - item.projectedRevenue)} abaixo`}
          </p>
        </div>

        {/* EBITDA e ritmo necessário */}
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              EBITDA objetivo
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular">
              {formatPercent(goal.target_ebitda_pct)}
            </dd>
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-3">
            <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              EBITDA acumulado
            </dt>
            <dd
              className={cn(
                'mt-1 text-lg font-semibold tabular',
                ebitdaDelta === null
                  ? 'text-muted-foreground'
                  : ebitdaDelta >= 0
                    ? 'text-positive'
                    : 'text-negative',
              )}
            >
              {item.ebitdaPct === null ? '—' : formatPercent(item.ebitdaPct)}
            </dd>
            {ebitdaDelta !== null ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground tabular">
                {ebitdaDelta >= 0 ? '+' : ''}
                {formatPercent(ebitdaDelta)} vs objetivo
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-muted-foreground">Lance no admin</p>
            )}
          </div>

          <div className="col-span-2 rounded-lg border border-border bg-background/60 p-3 sm:col-span-1">
            <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Ritmo necessário
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular">
              {formatCurrencyCompact(item.requiredMonthlyPace)}
            </dd>
            <p className="mt-0.5 text-[11px] text-muted-foreground">por mês até dezembro</p>
          </div>
        </dl>
      </div>
    </article>
  )
}
