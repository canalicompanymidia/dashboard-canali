'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ActionState } from '@/lib/admin/types'

interface ConfirmDeleteProps {
  action: (prev: ActionState | null, formData: FormData) => Promise<ActionState>
  id: string
  itemName: string
  /** Consequência extra a avisar (ex.: "os documentos também serão apagados"). */
  warning?: string
  label?: string
}

/**
 * Exclusão com confirmação em modal.
 * Exclusão é irreversível — nunca deve acontecer com um clique acidental.
 */
export function ConfirmDelete({ action, id, itemName, warning, label }: ConfirmDeleteProps) {
  const [open, setOpen] = React.useState(false)
  const [state, formAction, pending] = useActionState(action, null)

  React.useEffect(() => {
    if (state?.ok) setOpen(false)
  }, [state])

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={`Excluir ${itemName}`}
        title={`Excluir ${itemName}`}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir {label ?? 'item'}?</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{itemName}</strong> será removido
              permanentemente. Esta ação não pode ser desfeita.
              {warning ? <span className="mt-1.5 block text-destructive">{warning}</span> : null}
            </DialogDescription>
          </DialogHeader>

          {state && !state.ok ? (
            <p className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <form action={formAction}>
              <input type="hidden" name="id" value={id} />
              <Button type="submit" variant="destructive" disabled={pending}>
                <Trash2 className="size-4" />
                {pending ? 'Excluindo...' : 'Excluir'}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
