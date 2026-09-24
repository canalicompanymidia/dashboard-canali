import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface SectionProps {
  id?: string
  /** Numeração do bloco na hierarquia da Home (01 a 04). */
  index: string
  title: string
  description?: string
  icon: LucideIcon
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Cabeçalho padrão dos 4 blocos da Home.
 * A numeração visível reforça a hierarquia de leitura de cima para baixo.
 */
export function Section({
  id,
  index,
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
}: SectionProps) {
  return (
    <section id={id} className={cn('scroll-mt-20', className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        {/* Sem subtítulo o texto é uma linha só: centraliza no ícone. Com
            subtítulo, o bloco é mais alto e o ícone acompanha o topo. */}
        <div className={cn('flex gap-3', description ? 'items-start' : 'items-center')}>
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-prata',
              description && 'mt-0.5',
            )}
          >
            <Icon className="size-4.5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="rotulo tabular">{index}</span>
              <h2 className="font-serif text-xl leading-none font-normal sm:text-2xl">
                {title}
              </h2>
            </div>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>

        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      {children}
    </section>
  )
}
