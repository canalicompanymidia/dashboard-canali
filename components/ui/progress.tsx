'use client'

import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/lib/utils'

interface ProgressProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  value?: number
  /** Classe do preenchimento — normalmente o gradiente do accent. */
  indicatorClassName?: string
  /** Exibe o brilho animado enquanto a meta não foi batida. */
  shimmer?: boolean
}

function Progress({ className, value = 0, indicatorClassName, shimmer, ...props }: ProgressProps) {
  // A barra satura em 100% mesmo quando a meta é superada — o número acima
  // dela é que comunica o excedente.
  const clamped = Math.min(Math.max(value, 0), 100)

  return (
    <ProgressPrimitive.Root
      value={clamped}
      className={cn('relative h-2.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          'relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-out',
          shimmer && 'progress-shimmer',
          indicatorClassName ?? 'bg-primary',
        )}
        style={{ width: `${clamped}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
