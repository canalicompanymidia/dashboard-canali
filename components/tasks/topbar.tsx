'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, FolderOpen, Lock, Menu } from 'lucide-react'

import { MarcaEspaco } from '@/components/tasks/pecas'
import { useTasks } from '@/components/tasks/provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  href?: string
  tipo?: 'espaco' | 'pasta' | 'lista'
  cor?: string | null
  privado?: boolean
}

/**
 * Barra superior de cada tela: trilha (Espaço › Pasta › Lista), ações à
 * direita e, opcionalmente, uma segunda linha (as abas de visualização).
 */
export function Topbar({
  crumbs,
  children,
  abaixo,
  className,
}: {
  crumbs: Crumb[]
  children?: React.ReactNode
  abaixo?: React.ReactNode
  className?: string
}) {
  const { setSidebarAberta } = useTasks()

  return (
    <header className={cn('shrink-0 border-b border-border bg-card/60', className)}>
      <div className="flex min-h-12 items-center gap-2 px-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={() => setSidebarAberta(true)}
          aria-label="Abrir navegação"
        >
          <Menu className="size-4" />
        </Button>

        <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13px]" aria-label="Trilha">
          {crumbs.map((c, i) => {
            const ultimo = i === crumbs.length - 1
            const conteudo = (
              <span className="flex min-w-0 items-center gap-1.5">
                {c.tipo === 'espaco' ? <MarcaEspaco nome={c.label} cor={c.cor ?? '#62676f'} /> : null}
                {c.tipo === 'pasta' ? (
                  <FolderOpen className="size-3.5 shrink-0 text-warning-foreground dark:text-warning" />
                ) : null}
                {c.tipo === 'lista' ? (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.cor ?? 'var(--muted-foreground)' }}
                  />
                ) : null}
                <span className={cn('truncate', ultimo ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {c.label}
                </span>
                {c.privado ? <Lock className="size-3 shrink-0 text-muted-foreground" /> : null}
              </span>
            )
            return (
              <React.Fragment key={`${c.label}-${i}`}>
                {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" /> : null}
                {c.href && !ultimo ? (
                  <Link href={c.href} className="min-w-0 rounded px-1 py-0.5 hover:bg-accent">
                    {conteudo}
                  </Link>
                ) : (
                  <span className="min-w-0 px-1 py-0.5">{conteudo}</span>
                )}
              </React.Fragment>
            )
          })}
        </nav>

        {children ? <div className="flex shrink-0 items-center gap-1.5">{children}</div> : null}
      </div>
      {abaixo ? <div className="px-3 sm:px-4">{abaixo}</div> : null}
    </header>
  )
}

/** Abas de visualização (Lista · Quadro · Calendário), como links. */
export function AbasDeVisualizacao({
  itens,
  atual,
}: {
  itens: { chave: string; label: string; href: string; icone: React.ComponentType<{ className?: string }> }[]
  atual: string
}) {
  return (
    <div className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
      {itens.map((item) => {
        const ativo = item.chave === atual
        return (
          <Link
            key={item.chave}
            href={item.href}
            role="tab"
            aria-selected={ativo}
            className={cn(
              'flex h-9 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium whitespace-nowrap transition-colors',
              ativo
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            <item.icone className="size-3.5" />
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
