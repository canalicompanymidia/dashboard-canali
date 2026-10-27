'use client'

import * as React from 'react'

/*
 * "Plim" de mensagem nova, como no WhatsApp. O som é gerado pelo próprio
 * navegador (Web Audio), sem arquivo para baixar.
 *
 * O navegador só libera áudio depois que a pessoa interage com a página:
 * o contexto é criado/retomado no primeiro clique ou tecla.
 */

const CHAVE = 'tasks:chat-som'
const EVENTO = 'tasks:chat-som-mudou'
/** Várias mensagens juntas tocam uma vez só. */
const INTERVALO_MINIMO_MS = 1500

let contexto: AudioContext | null = null
let ultimoToque = 0
let ouvindoGesto = false

function obterContexto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!contexto) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    contexto = new Ctor()
  }
  return contexto
}

function prepararNoPrimeiroGesto() {
  if (ouvindoGesto || typeof window === 'undefined') return
  ouvindoGesto = true
  const liberar = () => {
    void obterContexto()?.resume()
    window.removeEventListener('pointerdown', liberar)
    window.removeEventListener('keydown', liberar)
  }
  window.addEventListener('pointerdown', liberar)
  window.addEventListener('keydown', liberar)
}

export function somLigado(): boolean {
  try {
    return window.localStorage.getItem(CHAVE) !== 'off'
  } catch {
    return true
  }
}

/** Toca o aviso de mensagem nova (se o som estiver ligado). */
export function tocarSomChat() {
  if (!somLigado()) return
  const agora = Date.now()
  if (agora - ultimoToque < INTERVALO_MINIMO_MS) return
  const ctx = obterContexto()
  if (!ctx || ctx.state !== 'running') return
  ultimoToque = agora

  // Duas notas curtas e suaves, subindo.
  const inicio = ctx.currentTime
  for (const [freq, atraso] of [
    [880, 0],
    [1318.5, 0.11],
  ] as const) {
    const osc = ctx.createOscillator()
    const volume = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = inicio + atraso
    volume.gain.setValueAtTime(0.0001, t)
    volume.gain.exponentialRampToValueAtTime(0.18, t + 0.015)
    volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    osc.connect(volume).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.25)
  }
}

/** Liga o desbloqueio do áudio e devolve [ligado, alternar]. */
export function useSomChat(): [boolean, () => void] {
  const [ligado, setLigado] = React.useState(true)

  React.useEffect(() => {
    prepararNoPrimeiroGesto()
    setLigado(somLigado())
    const sincronizar = () => setLigado(somLigado())
    window.addEventListener(EVENTO, sincronizar)
    return () => window.removeEventListener(EVENTO, sincronizar)
  }, [])

  const alternar = React.useCallback(() => {
    const novo = !somLigado()
    try {
      window.localStorage.setItem(CHAVE, novo ? 'on' : 'off')
    } catch {
      // Sem armazenamento: vale só até recarregar.
    }
    setLigado(novo)
    window.dispatchEvent(new Event(EVENTO))
    if (novo) {
      void obterContexto()?.resume().then(() => {
        ultimoToque = 0
        tocarSomChat()
      })
    }
  }, [])

  return [ligado, alternar]
}
