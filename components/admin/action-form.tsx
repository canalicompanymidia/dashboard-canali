'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import type { ActionState } from '@/lib/admin/types'
import { cn } from '@/lib/utils'

interface ActionFormProps {
  action: (prev: ActionState | null, formData: FormData) => Promise<ActionState>
  /** Render prop: recebe o estado de envio e o resultado da última tentativa. */
  children: (pending: boolean, state: ActionState | null) => React.ReactNode
  /** Limpa o formulário após sucesso — útil em formulários de criação. */
  resetOnSuccess?: boolean
  className?: string
  onSuccess?: () => void
}

/**
 * Formulário ligado a uma Server Action.
 *
 * Usa `useActionState`, então funciona mesmo antes do JS carregar: o POST
 * vai para o servidor e a página volta com o resultado.
 */
export function ActionForm({
  action,
  children,
  resetOnSuccess,
  className,
  onSuccess,
}: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, null)
  const formRef = React.useRef<HTMLFormElement>(null)
  const handledRef = React.useRef<ActionState | null>(null)

  React.useEffect(() => {
    // Guarda contra reexecução: o efeito roda de novo em qualquer re-render.
    if (!state?.ok || handledRef.current === state) return
    handledRef.current = state

    if (resetOnSuccess) formRef.current?.reset()
    onSuccess?.()
  }, [state, resetOnSuccess, onSuccess])

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children(pending, state)}
    </form>
  )
}

/** Retorno da action em formato legível — verde para sucesso, vermelho para erro. */
export function FormFeedback({
  state,
  className,
}: {
  state: ActionState | null
  className?: string
}) {
  if (!state) return null

  return (
    <p
      role="status"
      className={cn(
        'flex items-start gap-1.5 rounded-lg p-2.5 text-xs',
        state.ok ? 'bg-positive/10 text-positive' : 'bg-destructive/10 text-destructive',
        className,
      )}
    >
      {state.ok ? (
        <CheckCircle2 className="mt-px size-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-px size-3.5 shrink-0" />
      )}
      {state.message}
    </p>
  )
}
