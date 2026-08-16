'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'

import { cn } from '@/lib/utils'

interface CopyButtonProps {
  value: string
  label?: string
  className?: string
}

/**
 * Botão de copiar com confirmação visual.
 *
 * `navigator.clipboard` só existe em contexto seguro (HTTPS ou localhost);
 * o fallback com textarea + execCommand cobre o resto.
 */
export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false)
  const timeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  React.useEffect(() => () => clearTimeout(timeout.current), [])

  async function copy() {
    if (!value) return

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }

      setCopied(true)
      clearTimeout(timeout.current)
      timeout.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // Sem permissão de clipboard: o valor segue visível para cópia manual.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={copied ? 'Copiado!' : `Copiar ${label ?? 'valor'}`}
      aria-label={copied ? 'Copiado' : `Copiar ${label ?? 'valor'}`}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
        copied && 'text-positive',
        className,
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}
