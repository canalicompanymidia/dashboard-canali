'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

/** Intervalo mínimo entre duas recargas disparadas por voltar à aba. */
const INTERVALO_MS = 45_000

/**
 * Quando a pessoa volta para a aba depois de um tempo, recarrega os
 * dados do servidor uma vez: é assim que as mudanças dos colegas chegam
 * sem ninguém apertar F5, e sem recarregar a cada clique.
 */
export function AtualizarAoVoltar() {
  const router = useRouter()
  const ultima = React.useRef(Date.now())

  React.useEffect(() => {
    function aoMudar() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultima.current < INTERVALO_MS) return
      // Janela aberta (nova tarefa, edição, escolher arquivo/imagem): não
      // recarrega por baixo, senão o que a pessoa estava escrevendo some.
      // Escolher um arquivo tira o foco da aba, e a volta disparava isto.
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return
      ultima.current = Date.now()
      router.refresh()
    }
    document.addEventListener('visibilitychange', aoMudar)
    window.addEventListener('focus', aoMudar)
    return () => {
      document.removeEventListener('visibilitychange', aoMudar)
      window.removeEventListener('focus', aoMudar)
    }
  }, [router])

  return null
}
