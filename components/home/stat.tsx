import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface StatProps {
  label: string
  value: string
  hint?: string
  icon?: LucideIcon
  /** Realça o KPI principal do bloco. */
  emphasis?: boolean
  tone?: 'default' | 'positive' | 'negative' | 'muted'
  className?: string
  children?: React.ReactNode
}

const TONE_CLASSES = {
  default: 'text-foreground',
  positive: 'text-positive',
  negative: 'text-negative',
  muted: 'text-muted-foreground',
} as const

/** Bloco de KPI. Densidade alta: rótulo pequeno, número grande e tabular. */
export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  emphasis = false,
  tone = 'default',
  className,
  children,
}: StatProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-4 shadow-xs transition-colors',
        emphasis && 'ring-1 ring-positive/25',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
      </div>

      <p
        className={cn(
          'mt-2 font-semibold tracking-tight tabular',
          emphasis ? 'text-2xl sm:text-[26px]' : 'text-xl sm:text-[22px]',
          TONE_CLASSES[tone],
        )}
      >
        {value}
      </p>

      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  )
}
