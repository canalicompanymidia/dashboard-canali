'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight, ExternalLink, FileText, Layers, PauseCircle } from 'lucide-react'

import { Section } from '@/components/home/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getAccent } from '@/lib/accents'
import { getDiaSemana } from '@/lib/dias-semana'
import type { MarketingAction } from '@/lib/types'
import { cn } from '@/lib/utils'

interface MarketingActionsBlockProps {
  actions: MarketingAction[]
}

/**
 * BLOCO 3 — Ações de marketing ativas.
 * O card diz só o que é e quando acontece; o resto fica no modal.
 */
export function MarketingActionsBlock({ actions }: MarketingActionsBlockProps) {
  const [selected, setSelected] = React.useState<MarketingAction | null>(null)

  return (
    <Section id="acoes" index="03" title="Ações de marketing ativas" icon={Layers}>
      {actions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <Layers className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">Nenhuma ação cadastrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre campanhas, funis e webinários no painel administrativo.
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((action) => (
            <ActionCard key={action.id} action={action} onOpen={() => setSelected(action)} />
          ))}
        </div>
      )}

      <ActionDialog
        action={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      />
    </Section>
  )
}

function ActionCard({ action, onOpen }: { action: MarketingAction; onOpen: () => void }) {
  const accent = getAccent(action.accent)
  const isPaused = action.status === 'paused'
  const dia = getDiaSemana(action.dia_semana)

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 text-left transition-colors',
        'hover:border-input hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
        isPaused && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn('size-2 shrink-0 rounded-full', accent.fill)} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{action.category ?? 'Ação'}</span>
        {/* Quando acontece: a única informação que vale ver sem abrir. */}
        {dia ? (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground tabular">
            {dia.curto}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight">
          {action.title}
        </h3>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      {isPaused ? (
        <span className="mt-2 flex items-center gap-1 text-xs text-warning-foreground dark:text-warning">
          <PauseCircle className="size-3.5" />
          Pausada
        </span>
      ) : null}
    </button>
  )
}

function ActionDialog({
  action,
  onOpenChange,
}: {
  action: MarketingAction | null
  onOpenChange: (open: boolean) => void
}) {
  const accent = getAccent(action?.accent)
  const dia = getDiaSemana(action?.dia_semana)

  // Cada linha de `how_it_works` vira um passo numerado do fluxo.
  const steps = React.useMemo(() => {
    if (!action?.how_it_works) return []
    return action.how_it_works
      .split('\n')
      .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
  }, [action?.how_it_works])

  const links = action ? [...action.links, ...action.briefings] : []
  // Uma linha só com o essencial, em vez de um quadro por campo.
  const meta = action
    ? [action.category, dia?.recorrente, action.owner_name].filter(Boolean).join(' · ')
    : ''

  return (
    <Dialog open={Boolean(action)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {action ? (
          <>
            <DialogHeader>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn('size-2 shrink-0 rounded-full', accent.fill)} aria-hidden />
                <span className="line-clamp-1">{meta}</span>
                {action.status === 'paused' ? <Badge variant="warning">Pausada</Badge> : null}
              </p>
              <DialogTitle className="text-xl sm:text-2xl">{action.title}</DialogTitle>
              {action.subtitle ? (
                <DialogDescription>{action.subtitle}</DialogDescription>
              ) : null}
            </DialogHeader>

            {/* Os links vêm primeiro: é o que a pessoa abre o modal para pegar. */}
            {links.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {action.links.map((link, index) => (
                  <LinkButton key={`l-${index}`} link={link} icon={ExternalLink} />
                ))}
                {action.briefings.map((link, index) => (
                  <LinkButton key={`b-${index}`} link={link} icon={FileText} />
                ))}
              </div>
            ) : null}

            {steps.length > 0 ? (
              <ol className="space-y-2">
                {steps.map((step, index) => (
                  <li key={`${action.id}-step-${index}`} className="flex gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-snug">{step}</span>
                  </li>
                ))}
              </ol>
            ) : null}

            {action.flow_image_url ? (
              <a
                href={action.flow_image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg border border-border bg-muted"
                title="Abrir o fluxograma em tamanho real"
              >
                {/* <img> em vez de next/image: as URLs vêm do banco e podem
                    apontar para qualquer host. */}
                <img
                  src={action.flow_image_url}
                  alt={`Fluxograma da ação ${action.title}`}
                  loading="lazy"
                  className="max-h-72 w-full object-contain"
                />
              </a>
            ) : null}

            {action.target_audience ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Público: </span>
                {action.target_audience}
              </p>
            ) : null}

            {/* O texto longo existe para quem precisa, mas não ocupa a tela. */}
            {action.description ? (
              <details className="group rounded-lg border border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  Descrição completa
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="border-t border-border px-3 py-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                  {action.description}
                </p>
              </details>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function LinkButton({
  link,
  icon: Icon,
}: {
  link: { label: string; url: string }
  icon: typeof ExternalLink
}) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={link.url} target="_blank" rel="noopener noreferrer">
        <Icon className="size-3.5" />
        {link.label}
      </a>
    </Button>
  )
}
