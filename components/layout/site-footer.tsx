'use client'

import { usePathname } from 'next/navigation'

export function SiteFooter({ year }: { year: number }) {
  const pathname = usePathname()

  // O Tasks é um aplicativo de tela cheia com rolagem interna: um rodapé
  // abaixo dele só empurraria a interface para fora da janela.
  if (pathname.startsWith('/tasks')) return null

  return (
    <footer className="no-print border-t border-border/80 bg-card/40">
      <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
        <p>© {year} Canali Company · Hub de Marketing Unificado</p>
        <p className="text-center sm:text-right">
          Dados de Hotmart, OnProfit, TMB e Meta Ads · atualização em tempo real
        </p>
      </div>
    </footer>
  )
}
