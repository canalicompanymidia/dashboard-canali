'use client'

import * as React from 'react'
import {
  ArrowUpRight,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Layers,
  PauseCircle,
  Target,
  User,
  Users,
} from 'lucide-react'

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
import type { MarketingAction } from '@/lib/types'
import { cn } from '@/lib/utils'

interface MarketingActionsBlockProps {
  actions: MarketingAction[]
}

/**
 * BLOCO 3 — Ações de marketing ativas.
 * Grid de cards clicáveis; o detalhamento completo abre em modal central.
 */
export function MarketingActionsBlock({ actions }: MarketingActionsBlockProps) {
  const [selected, setSelected] = React.useState<MarketingAction | null>(null)

  const activeCount = actions.filter((action) => action.status === 'active').length

  return (
    <Section
      id="acoes"
      index="03"
      title="Ações de marketing ativas"
      description="Campanhas, lançamentos e funis em operação. Clique em um card para ver o fluxo completo."
      icon={Layers}
      actions={
        <Badge variant="outline">
          {activeCount} ativa{activeCount === 1 ? '' : 's'} de {actions.length}
        </Badge>
      }
    >
      {actions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <Layers className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">Nenhuma ação cadastrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre campanhas, funis e webinários no painel administrativo.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-xs transition-all',
        'hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
        accent.border,
        accent.ring,
        accent.glow,
        isPaused && 'opacity-70',
      )}
    >
      <div className={cn('h-1 w-full', accent.gradient)} />

      {action.image_url ? (
        <div className="relative h-32 w-full overflow-hidden bg-muted">
          {/* <img> em vez de next/image: as URLs vêm do banco e podem apontar
              para qualquer host, o que o otimizador do Next recusaria. */}
          <img
            src={action.image_url}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {action.category ? (
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', accent.badge)}>
              {action.category}
            </span>
          ) : null}
          {isPaused ? (
            <Badge variant="warning">
              <PauseCircle className="size-3" />
              Pausada
            </Badge>
          ) : (
            <Badge variant="positive">Ativa</Badge>
          )}
        </div>

        <h3 className="mt-2.5 text-base leading-snug font-semibold tracking-tight">
          {action.title}
        </h3>

        {action.subtitle ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{action.subtitle}</p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <User className="size-3.5 shrink-0" />
            <span className="truncate">{action.owner_name ?? 'Sem responsável'}</span>
          </span>
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 text-xs font-medium transition-transform group-hover:translate-x-0.5',
              accent.text,
            )}
          >
            Ver detalhes
            <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </div>
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

  // Cada linha de `how_it_works` vira um passo numerado do fluxo.
  const steps = React.useMemo(() => {
    if (!action?.how_it_works) return []
    return action.how_it_works
      .split('\n')
      .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
  }, [action?.how_it_works])

  return (
    <Dialog open={Boolean(action)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {action ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-1.5">
                {action.category ? (
                  <span
                    className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', accent.badge)}
                  >
                    {action.category}
                  </span>
                ) : null}
                <Badge variant={action.status === 'active' ? 'positive' : 'warning'}>
                  {action.status === 'active' ? 'Ativa' : 'Pausada'}
                </Badge>
              </div>

              <DialogTitle className="text-xl sm:text-2xl">{action.title}</DialogTitle>
              {action.subtitle ? (
                <DialogDescription>{action.subtitle}</DialogDescription>
              ) : null}
            </DialogHeader>

            {/* Fluxograma / imagem explicativa */}
            {action.flow_image_url || action.image_url ? (
              <figure className="overflow-hidden rounded-lg border border-border bg-muted">
                <img
                  src={action.flow_image_url ?? action.image_url ?? ''}
                  alt={`Fluxo da ação ${action.title}`}
                  loading="lazy"
                  className="max-h-80 w-full object-contain"
                />
                <figcaption className="flex items-center gap-1.5 border-t border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
                  <ImageIcon className="size-3" />
                  {action.flow_image_url ? 'Fluxograma da ação' : 'Imagem da ação'}
                </figcaption>
              </figure>
            ) : null}

            {action.description ? (
              <div>
                <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Como funciona
                </h4>
                <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line">
                  {action.description}
                </p>
              </div>
            ) : null}

            {steps.length > 0 ? (
              <div>
                <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Fluxo da operação
                </h4>
                <ol className="mt-2 space-y-2">
                  {steps.map((step, index) => (
                    <li key={`${action.id}-step-${index}`} className="flex gap-3">
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                          accent.badge,
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="text-sm leading-snug">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className={cn('rounded-lg border p-3', accent.surface, accent.border)}>
                <div className="flex items-center gap-1.5">
                  <Users className={cn('size-3.5', accent.text)} />
                  <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Público-alvo
                  </h4>
                </div>
                <p className="mt-1.5 text-sm">{action.target_audience ?? 'Não definido'}</p>
              </div>

              <div className="rounded-lg border border-border bg-background/60 p-3">
                <div className="flex items-center gap-1.5">
                  <Target className="size-3.5 text-muted-foreground" />
                  <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Responsável interno
                  </h4>
                </div>
                <p className="mt-1.5 text-sm">{action.owner_name ?? 'Não definido'}</p>
                {action.owner_email ? (
                  <a
                    href={`mailto:${action.owner_email}`}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    {action.owner_email}
                  </a>
                ) : null}
              </div>
            </div>

            {action.links.length > 0 ? (
              <LinkGroup title="Links úteis" links={action.links} icon={ExternalLink} />
            ) : null}

            {action.briefings.length > 0 ? (
              <LinkGroup title="Briefings associados" links={action.briefings} icon={FileText} />
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function LinkGroup({
  title,
  links,
  icon: Icon,
}: {
  title: string
  links: { label: string; url: string }[]
  icon: typeof ExternalLink
}) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((link, index) => (
          <Button key={`${link.url}-${index}`} variant="outline" size="sm" asChild>
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              <Icon className="size-3.5" />
              {link.label}
            </a>
          </Button>
        ))}
      </div>
    </div>
  )
}
