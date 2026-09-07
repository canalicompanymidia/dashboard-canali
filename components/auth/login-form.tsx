'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { KeyRound, LogIn, Mail } from 'lucide-react'

import { FormFeedback } from '@/components/admin/action-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { entrarComSenha, pedirRedefinicao } from '@/app/login/actions'

/** Entrada com e-mail e senha, e o desvio para redefinir. */
export function LoginForm({ destino }: { destino?: string }) {
  const [modo, setModo] = React.useState<'entrar' | 'esqueci'>('entrar')

  return modo === 'entrar' ? (
    <FormularioEntrada destino={destino} onEsqueci={() => setModo('esqueci')} />
  ) : (
    <FormularioRedefinicao onVoltar={() => setModo('entrar')} />
  )
}

function FormularioEntrada({
  destino,
  onEsqueci,
}: {
  destino?: string
  onEsqueci: () => void
}) {
  const [state, formAction, pending] = useActionState(entrarComSenha, null)

  return (
    <form action={formAction} className="space-y-3">
      {destino ? <input type="hidden" name="destino" value={destino} /> : null}

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="voce@canalicompany.com"
          required
          autoFocus
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </div>

      <FormFeedback state={state} />

      <Button type="submit" className="w-full" disabled={pending}>
        <LogIn className="size-4" />
        {pending ? 'Entrando...' : 'Entrar'}
      </Button>

      <button
        type="button"
        onClick={onEsqueci}
        className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Esqueci minha senha
      </button>
    </form>
  )
}

function FormularioRedefinicao({ onVoltar }: { onVoltar: () => void }) {
  const [state, formAction, pending] = useActionState(pedirRedefinicao, null)

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email-reset">E-mail</Label>
        <Input
          id="email-reset"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="voce@canalicompany.com"
          required
          autoFocus
          disabled={pending || state?.ok}
        />
      </div>

      <FormFeedback state={state} />

      {state?.ok ? null : (
        <Button type="submit" className="w-full" disabled={pending}>
          <KeyRound className="size-4" />
          {pending ? 'Enviando...' : 'Enviar link para criar nova senha'}
        </Button>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Mail className="mt-px size-3.5 shrink-0" />
        O link vale uma hora e só funciona uma vez. Quem pedir a redefinição recebe um aviso na
        própria caixa de entrada — se você não pediu, avise um administrador.
      </p>

      <button
        type="button"
        onClick={onVoltar}
        className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Voltar para a entrada
      </button>
    </form>
  )
}
