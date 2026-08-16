import * as React from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: string
  htmlFor?: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

/** Rótulo + campo + dica, com espaçamento consistente em todo o admin. */
export function Field({ label, htmlFor, hint, required, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Agrupador em grade para formulários densos. */
export function FieldGrid({
  columns = 2,
  className,
  children,
}: {
  columns?: 2 | 3 | 4
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'grid gap-3',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  )
}
