import { AnnualGoalsBlock } from '@/components/home/annual-goals-block'
import { MarketingActionsBlock } from '@/components/home/marketing-actions-block'
import { MonthlyMetricsBlock } from '@/components/home/monthly-metrics-block'
import { QuickAccessBlock } from '@/components/home/quick-access-block'
import { SetupBanner } from '@/components/home/setup-banner'
import {
  getDocumentCategories,
  getGoalsWithProgress,
  getMarketingActions,
  getMonthlyMetrics,
} from '@/lib/data'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { isVaultConfigured } from '@/lib/vault'

// O painel mostra faturamento do dia: nada aqui pode ficar em cache.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const configured = isSupabaseConfigured()

  // Os quatro blocos são independentes — buscar em paralelo evita empilhar
  // latência de rede e mantém o primeiro byte rápido.
  const [goalsData, metrics, actions, categories, vaultConfigured] = await Promise.all([
    getGoalsWithProgress(),
    getMonthlyMetrics(),
    getMarketingActions(),
    getDocumentCategories(),
    isVaultConfigured(),
  ])

  return (
    <div className="hero-surface">
      <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <PageIntro year={goalsData.context.year} />

        {configured ? null : <SetupBanner />}

        <AnnualGoalsBlock
          goals={goalsData.goals}
          accumulatedRevenue={goalsData.accumulatedRevenue}
          context={goalsData.context}
        />

        <MonthlyMetricsBlock initialMetrics={metrics} />

        <MarketingActionsBlock actions={actions} />

        <QuickAccessBlock categories={categories} vaultConfigured={vaultConfigured} />
      </div>
    </div>
  )
}

function PageIntro({ year }: { year: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Hub de Marketing Unificado
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Metas, faturamento em tempo real, ações ativas e acessos do time da Canali Company —
          centralizados em um só lugar.
        </p>
      </div>

      <nav className="no-print flex flex-wrap gap-1.5 text-xs" aria-label="Navegação dos blocos">
        {[
          { href: '#metas', label: 'Metas' },
          { href: '#metricas', label: 'Métricas' },
          { href: '#acoes', label: 'Ações' },
          { href: '#hub', label: 'Hub' },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-full border border-border bg-card px-3 py-1.5 font-medium shadow-xs transition-colors hover:bg-accent"
          >
            {item.label}
          </a>
        ))}
        <span className="rounded-full border border-border bg-card px-3 py-1.5 font-medium shadow-xs tabular">
          {year}
        </span>
      </nav>
    </div>
  )
}
