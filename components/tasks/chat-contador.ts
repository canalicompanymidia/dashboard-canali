'use client'

import * as React from 'react'

import { carregarConversas, contarChatNaoLidas } from '@/app/tasks/chat/actions'
import { hubEmSegundoPlano, notificarMensagem } from '@/components/tasks/chat-notificacao'
import { tocarSomChat, useSomChat } from '@/components/tasks/chat-som'
import { useSinalChat } from '@/components/tasks/presenca'
import { useTasks } from '@/components/tasks/provider'

/** Avisa a barra lateral que o total de não lidas mudou. */
export const EVENTO_CHAT_LIDO = 'tasks:chat-lido'

/**
 * Total de mensagens não lidas, vivo: recontado quando chega aviso de
 * mensagem, quando uma conversa é lida e, por garantia, a cada minuto.
 */
export function useChatNaoLidas(inicial: number): number {
  const { sinalChat } = useSinalChat()
  const { colab, nomeDe } = useTasks()
  const [total, setTotal] = React.useState(inicial)
  const anterior = React.useRef(inicial)
  // Mantém o áudio pronto para tocar em qualquer tela do Tasks.
  useSomChat()

  const recontar = React.useCallback(async () => {
    const r = await contarChatNaoLidas()
    if (!r.ok) return
    if (r.data > anterior.current) {
      tocarSomChat()
      if (hubEmSegundoPlano()) void notificarNovas(colab.email, nomeDe)
    }
    anterior.current = r.data
    setTotal(r.data)
  }, [colab.email, nomeDe])

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

/** Notificação do sistema para a última mensagem de cada conversa não lida. */
async function notificarNovas(eu: string, nomeDe: (email: string) => string) {
  const r = await carregarConversas()
  if (!r.ok) return
  for (const c of r.data.filter((c) => c.nao_lidas > 0 && c.previa && c.previa.autor !== eu).slice(0, 3)) {
    const previa = c.previa!
    const autor = nomeDe(previa.autor)
    notificarMensagem({
      mensagemId: previa.id,
      conversaId: c.id,
      titulo: c.tipo === 'grupo' ? (c.nome ?? 'Grupo') : autor,
      corpo: c.tipo === 'grupo' ? `${autor.split(' ')[0]}: ${previa.texto}` : previa.texto,
    })
  }
}
