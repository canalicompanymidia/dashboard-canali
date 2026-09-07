'use client'

import { useActionState } from 'react'
import { ShieldCheck } from 'lucide-react'

import { FormFeedback } from '@/components/admin/action-form'
import { SenhaCampos } from '@/components/auth/senha-campos'
import { Button } from '@/components/ui/button'
import { definirSenha } from '@/app/definir-senha/actions'

export function DefinirSenhaForm() {
  const [state, formAction, pending] = useActionState(definirSenha, null)

  return (
    <form action={formAction} className="space-y-4">
      <SenhaCampos desabilitado={pending} />

      <FormFeedback state={state} />

      <Button type="submit" className="w-full" disabled={pending}>
        <ShieldCheck className="size-4" />
        {pending ? 'Salvando...' : 'Salvar senha e entrar'}
      </Button>
    </form>
  )
}
