import { ArrowUpRight, LogOut } from 'lucide-react'

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
import { requireColaborador, type Colaborador } from '@/lib/auth'
import { primeiroNome } from '@/lib/utils'
import { isVaultConfigured } from '@/lib/vault'

// O painel mostra faturamento do dia: nada aqui pode ficar em cache.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // Nada é buscado antes de saber quem está pedindo. O middleware já
  // barrou quem não tem sessão; aqui confirmamos que a pessoa continua
  // na lista de autorizados — que pode ter mudado depois do login.
  const colaborador = await requireColaborador()
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
        <PageIntro year={goalsData.context.year} colaborador={colaborador} />

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

function PageIntro({ year, colaborador }: { year: number; colaborador: Colaborador }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pt-4 sm:pt-8">
      <div>
        <p className="rotulo">Hub de Marketing · {year}</p>
        {/* Saudação do Design System: sempre "Olá", sempre o primeiro nome. */}
        <h1 className="mt-2 font-serif text-4xl leading-[1.08] font-normal tracking-[-0.01em] sm:text-[44px]">
          {primeiroNome(colaborador.nome) ? `Olá, ${primeiroNome(colaborador.nome)}!` : 'Olá!'}
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
          Metas, faturamento do mês, ações no ar e os acessos do time, num lugar só.
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
            className="rounded-md border border-border bg-card px-3 py-1.5 font-medium transition-colors hover:bg-accent"
          >
            {item.label}
          </a>
        ))}
        {/* Sai do Hub: outro aplicativo, em subdomínio próprio, com login e
            verificação em duas etapas dele. A seta avisa que este item
            navega para fora, e não rola a página como os anteriores. */}
        <a
          href="https://automacoes.hubcanalicompany.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-medium transition-colors hover:bg-accent"
        >
          Automações
          <ArrowUpRight className="size-3.5" />
        </a>

        <span className="rounded-md border border-border bg-card px-3 py-1.5 font-medium tabular">
          {year}
        </span>

        {/* POST e não link: um GET de logout pode ser disparado por um
            <img> em qualquer site e derrubar a sessão sem a pessoa pedir. */}
        <form action="/auth/sair" method="post">
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-medium transition-colors hover:bg-accent"
          >
            <LogOut className="size-3.5" />
            Sair
          </button>
        </form>
      </nav>
    </div>
  )
}
