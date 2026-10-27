'use client'

import * as React from 'react'

import { somLigado } from '@/components/tasks/chat-som'

/*
 * Notificação do sistema (o balão no canto da tela) quando chega mensagem
 * e o Hub não está na frente: outra aba, outra janela ou minimizado.
 * Com o Hub em uso, basta o som.
 *
 * O sino do chat liga e desliga os dois avisos juntos. A permissão é do
 * navegador e só pode ser pedida num clique da pessoa.
 */

/** Pede ao chat que abra uma conversa (quando já está na tela do chat). */
export const EVENTO_ABRIR_CONVERSA = 'tasks:chat-abrir'

export type PermissaoNotificacao = 'indisponivel' | 'default' | 'granted' | 'denied'

/** Mensagens já avisadas: o contador e a conversa aberta podem ver a mesma. */
const avisadas = new Set<string>()

function permissaoAtual(): PermissaoNotificacao {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'indisponivel'
  return Notification.permission
}

/** true quando a pessoa não está olhando para o Hub agora. */
export function hubEmSegundoPlano(): boolean {
  return document.visibilityState !== 'visible' || !document.hasFocus()
}

export function abrirConversaPeloAviso(conversaId: string) {
  window.focus()
  if (window.location.pathname.startsWith('/tasks/chat')) {
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_CONVERSA, { detail: conversaId }))
  } else {
    window.location.assign(`/tasks/chat?c=${conversaId}`)
  }
}

export function notificarMensagem(aviso: { mensagemId: string; conversaId: string; titulo: string; corpo: string }) {
  if (avisadas.has(aviso.mensagemId)) return
  avisadas.add(aviso.mensagemId)
  if (permissaoAtual() !== 'granted' || !somLigado() || !hubEmSegundoPlano()) return

  const corpo = aviso.corpo.length > 140 ? `${aviso.corpo.slice(0, 139)}…` : aviso.corpo
  try {
    const n = new Notification(aviso.titulo, {
      body: corpo,
      // Mesma conversa: a notificação nova substitui a anterior.
      tag: `chat-${aviso.conversaId}`,
      icon: '/favicon.svg',
    })
    n.onclick = () => {
      n.close()
      abrirConversaPeloAviso(aviso.conversaId)
    }
  } catch {
    // Alguns navegadores (Android) só notificam via service worker: fica o som.
  }
}

/** Marca mensagens como já vistas sem notificar (ex.: as que já estavam na tela). */
export function jaVistas(ids: string[]) {
  for (const id of ids) avisadas.add(id)
}

/** Estado da permissão e a função de pedir (chamar dentro de um clique). */
export function usePermissaoNotificacao(): [PermissaoNotificacao, () => Promise<void>] {
  const [estado, setEstado] = React.useState<PermissaoNotificacao>('indisponivel')

  React.useEffect(() => setEstado(permissaoAtual()), [])

  const pedir = React.useCallback(async () => {
    if (permissaoAtual() !== 'default') return
    const r = await Notification.requestPermission()
    setEstado(r)
  }, [])

  return [estado, pedir]
}
