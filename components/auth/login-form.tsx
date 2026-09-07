'use client'

import { useActionState } from 'react'
import { Mail, Send } from 'lucide-react'

import { FormFeedback } from '@/components/admin/action-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { enviarLinkDeAcesso } from '@/app/login/actions'

/** Pede o e-mail e dispara o link de acesso. Sem senha para memorizar. */
export function LoginForm({ destino }: { destino?: string }) {
  const [state, formAction, pending] = useActionState(enviarLinkDeAcesso, null)

  return (
    <form action={formAction} className="space-y-3">
      {destino ? <input type="hidden" name="destino" value={destino} /> : null}

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail corporativo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="voce@canalicompany.com"
          required
          autoFocus
          disabled={pending || state?.ok}
        />
      </div>

      <FormFeedback state={state} />

      {state?.ok ? null : (
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? (
            'Enviando...'
          ) : (
            <>
              <Send className="size-4" />
              Receber link de acesso
            </>
          )}
        </Button>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Mail className="mt-px size-3.5 shrink-0" />
        Você recebe um link que entra direto, sem senha para decorar. Ele vale por uma hora e só
        funciona uma vez.
      </p>
    </form>
  )
}
