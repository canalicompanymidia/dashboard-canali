'use client'

import * as React from 'react'
import { Check, Eye, EyeOff, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { REQUISITOS, forcaSenha } from '@/lib/senha'
import { cn } from '@/lib/utils'

/**
 * Campo de senha com a lista de requisitos marcando em tempo real.
 *
 * A regra vem de lib/senha.ts, a mesma que o servidor usa: se a lista
 * mostrada aqui divergisse da validação real, a pessoa preencheria tudo
 * verde e ainda assim levaria erro no envio.
 */
export function SenhaCampos({ desabilitado }: { desabilitado?: boolean }) {
  const [senha, setSenha] = React.useState('')
  const [confirmacao, setConfirmacao] = React.useState('')
  const [visivel, setVisivel] = React.useState(false)

  const forca = forcaSenha(senha)
  const confere = confirmacao.length > 0 && senha === confirmacao

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="senha">Nova senha</Label>
        <div className="relative">
          <Input
            id="senha"
            name="senha"
            type={visivel ? 'text' : 'password'}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="new-password"
            required
            autoFocus
            disabled={desabilitado}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setVisivel((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        {/* Cinco traços, um por requisito cumprido. */}
        <div className="flex gap-1" aria-hidden>
          {REQUISITOS.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i < forca
                  ? forca === REQUISITOS.length
                    ? 'bg-positive'
                    : 'bg-warning'
                  : 'bg-border',
              )}
            />
          ))}
        </div>
      </div>

      <ul className="space-y-1">
        {REQUISITOS.map((requisito) => {
          const ok = requisito.atende(senha)
          return (
            <li
              key={requisito.id}
              className={cn(
                'flex items-center gap-1.5 text-[11px] transition-colors',
                ok ? 'text-positive' : 'text-muted-foreground',
              )}
            >
              {ok ? (
                <Check className="size-3 shrink-0" />
              ) : (
                <X className="size-3 shrink-0 opacity-40" />
              )}
              {requisito.rotulo}
            </li>
          )
        })}
      </ul>

      <div className="space-y-1.5">
        <Label htmlFor="confirmacao">Repita a senha</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          type={visivel ? 'text' : 'password'}
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="new-password"
          required
          disabled={desabilitado}
          aria-invalid={confirmacao.length > 0 && !confere}
        />
        {confirmacao.length > 0 && !confere ? (
          <p className="text-[11px] text-destructive">As duas senhas não são iguais.</p>
        ) : null}
      </div>
    </div>
  )
}
