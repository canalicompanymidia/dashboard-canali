'use client'

import * as React from 'react'

import { contarChatNaoLidas } from '@/app/tasks/chat/actions'
import { tocarSomChat, useSomChat } from '@/components/tasks/chat-som'
import { useSinalChat } from '@/components/tasks/presenca'

/** Avisa a barra lateral que o total de não lidas mudou. */
export const EVENTO_CHAT_LIDO = 'tasks:chat-lido'

/**
 * Total de mensagens não lidas, vivo: recontado quando chega aviso de
 * mensagem, quando uma conversa é lida e, por garantia, a cada minuto.
 */
export function useChatNaoLidas(inicial: number): number {
  const { sinalChat } = useSinalChat()
  const [total, setTotal] = React.useState(inicial)
  const anterior = React.useRef(inicial)
  // Mantém o áudio pronto para tocar em qualquer tela do Tasks.
  useSomChat()

  const recontar = React.useCallback(async () => {
    const r = await contarChatNaoLidas()
    if (!r.ok) return
    if (r.data > anterior.current) tocarSomChat()
    anterior.current = r.data
    setTotal(r.data)
  }, [])

  React.useEffect(() => {
    if (sinalChat) void recontar()
  }, [sinalChat, recontar])

  React.useEffect(() => {
    window.addEventListener(EVENTO_CHAT_LIDO, recontar)
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void recontar()
    }, 60_000)
    return () => {
      window.removeEventListener(EVENTO_CHAT_LIDO, recontar)
      window.clearInterval(id)
    }
  }, [recontar])

  return total
}
