'use client'

import * as React from 'react'
import { Check, Link2, MessageCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

/**
 * Links para mandar a alguém: copiar o endereço de uma tarefa, lista
 * (com a aba aberta) ou espaço, ou já abrir o WhatsApp com o texto
 * pronto. Quem recebe precisa ser colaborador: o link passa pelo login
 * e volta para o lugar certo.
 */

export function urlAbsoluta(caminho: string): string {
  return typeof window === 'undefined' ? caminho : `${window.location.origin}${caminho}`
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // Sem permissão de área de transferência (http, navegador antigo): plano B.
    const campo = document.createElement('textarea')
    campo.value = texto
    campo.style.position = 'fixed'
    campo.style.opacity = '0'
    document.body.appendChild(campo)
    campo.select()
    const ok = document.execCommand('copy')
    campo.remove()
    return ok
  }
}

function abrirWhatsApp(titulo: string, caminho: string) {
  const texto = `${titulo}\n${urlAbsoluta(caminho)}`
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
}

/** Botão de ícone "copiar link", com confirmação visível. */
export function BotaoCopiarLink({ caminho, rotulo = 'Copiar link' }: { caminho: string; rotulo?: string }) {
  const [copiado, setCopiado] = React.useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={async () => {
        if (await copiar(urlAbsoluta(caminho))) {
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1800)
        }
      }}
      aria-label={copiado ? 'Link copiado' : rotulo}
      title={copiado ? 'Link copiado!' : rotulo}
    >
      {copiado ? <Check className="size-4 text-positive" /> : <Link2 className="size-4" />}
    </Button>
  )
}

/** Itens de menu: copiar link e enviar no WhatsApp. */
export function ItensCompartilhar({ caminho, titulo }: { caminho: string; titulo: string }) {
  return (
    <>
      <DropdownMenuItem onSelect={() => void copiar(urlAbsoluta(caminho))}>
        <Link2 />
        Copiar link
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => abrirWhatsApp(titulo, caminho)}>
        <MessageCircle />
        Enviar no WhatsApp
      </DropdownMenuItem>
    </>
  )
}
