'use client'

import * as React from 'react'
import { Mic, MonitorUp, Square } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Clipes de tela e de voz, gravados no próprio navegador (MediaRecorder)
 * e entregues como arquivo para o fluxo normal de anexos. Sem serviço
 * externo: o vídeo vai direto para o bucket privado do Hub.
 *
 * Limites: 5 minutos por clipe (≈ 40 MB a 1 Mbps, abaixo dos 50 MB do
 * bucket). Some nos navegadores sem suporte (Safari no iPhone, por ex.).
 */

type Modo = 'tela' | 'voz'

const LIMITE_SEGUNDOS = 5 * 60

const TIPOS: Record<Modo, string[]> = {
  tela: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'],
  voz: ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'],
}

function suporte(): { tela: boolean; voz: boolean } {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || !navigator.mediaDevices) {
    return { tela: false, voz: false }
  }
  return {
    tela: typeof navigator.mediaDevices.getDisplayMedia === 'function',
    voz: typeof navigator.mediaDevices.getUserMedia === 'function',
  }
}

function escolherTipo(modo: Modo): string | undefined {
  return TIPOS[modo].find((t) => MediaRecorder.isTypeSupported(t))
}

function carimbo(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}h${p(d.getMinutes())}`
}

function mmss(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
}

export function Gravador({
  onPronto,
  desabilitado,
  className,
}: {
  onPronto: (arquivo: File) => void
  desabilitado?: boolean
  className?: string
}) {
  const [disponivel, setDisponivel] = React.useState({ tela: false, voz: false })
  React.useEffect(() => setDisponivel(suporte()), [])

  const [modo, setModo] = React.useState<Modo | null>(null)
  const [segundos, setSegundos] = React.useState(0)
  const [erro, setErro] = React.useState<string | null>(null)

  const gravador = React.useRef<MediaRecorder | null>(null)
  const streams = React.useRef<MediaStream[]>([])
  const audio = React.useRef<AudioContext | null>(null)
  const partes = React.useRef<Blob[]>([])
  const timer = React.useRef<number | null>(null)

  const limpar = React.useCallback(() => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    for (const s of streams.current) for (const t of s.getTracks()) t.stop()
    streams.current = []
    void audio.current?.close().catch(() => undefined)
    audio.current = null
    gravador.current = null
    setModo(null)
    setSegundos(0)
  }, [])

  const parar = React.useCallback(() => {
    const rec = gravador.current
    if (rec && rec.state !== 'inactive') rec.stop()
    else limpar()
  }, [limpar])

  // Fechou o modal no meio: para tudo e libera câmera/tela.
  React.useEffect(() => () => limpar(), [limpar])

  async function iniciar(m: Modo) {
    setErro(null)
    try {
      let saida: MediaStream
      if (m === 'tela') {
        const tela = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 30 } },
          audio: true,
        })
        streams.current.push(tela)
        let mic: MediaStream | null = null
        try {
          mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
          streams.current.push(mic)
        } catch {
          // Sem microfone: grava só a tela (e o som do sistema, se houver).
        }
        saida = misturar(tela, mic)
        // "Parar compartilhamento" do próprio navegador encerra a gravação.
        tela.getVideoTracks()[0]?.addEventListener('ended', parar)
      } else {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        streams.current.push(mic)
        saida = mic
      }

      const tipo = escolherTipo(m)
      const rec = new MediaRecorder(saida, {
        ...(tipo ? { mimeType: tipo } : {}),
        videoBitsPerSecond: 1_000_000,
        audioBitsPerSecond: 96_000,
      })
      partes.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) partes.current.push(e.data)
      }
      rec.onstop = () => {
        const mime = (rec.mimeType || tipo || (m === 'tela' ? 'video/webm' : 'audio/webm')).split(';')[0]
        const blob = new Blob(partes.current, { type: mime })
        const ext = mime.includes('mp4') ? (m === 'tela' ? 'mp4' : 'm4a') : mime.includes('ogg') ? 'ogg' : 'webm'
        const nome = `${m === 'tela' ? 'clipe-de-tela' : 'clipe-de-voz'}-${carimbo()}.${ext}`
        limpar()
        if (blob.size === 0) return setErro('A gravação veio vazia. Tente de novo.')
        onPronto(new File([blob], nome, { type: mime }))
      }
      rec.start(1000)
      gravador.current = rec
      setModo(m)
      setSegundos(0)
      timer.current = window.setInterval(() => {
        setSegundos((s) => {
          if (s + 1 >= LIMITE_SEGUNDOS) parar()
          return s + 1
        })
      }, 1000)
    } catch (e) {
      limpar()
      const negado = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      setErro(
        negado
          ? m === 'tela'
            ? 'Captura de tela cancelada ou sem permissão.'
            : 'Sem permissão para usar o microfone.'
          : 'Não deu para começar a gravação neste navegador.',
      )
    }
  }

  function misturar(tela: MediaStream, mic: MediaStream | null): MediaStream {
    const video = tela.getVideoTracks()
    const fontes = [tela, mic].filter((s): s is MediaStream => Boolean(s && s.getAudioTracks().length > 0))
    if (fontes.length <= 1) return new MediaStream([...video, ...(fontes[0]?.getAudioTracks() ?? [])])
    // Som do sistema + microfone: mistura as duas fontes numa faixa só.
    const ctx = new AudioContext()
    audio.current = ctx
    const destino = ctx.createMediaStreamDestination()
    for (const s of fontes) ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(destino)
    return new MediaStream([...video, ...destino.stream.getAudioTracks()])
  }

  if (!disponivel.tela && !disponivel.voz) return null

  if (modo) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full bg-destructive/10 py-0.5 pr-0.5 pl-2.5 text-xs font-medium text-destructive',
          className,
        )}
        role="status"
      >
        <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden />
        {modo === 'tela' ? 'Gravando a tela' : 'Gravando voz'} · <span className="tabular">{mmss(segundos)}</span>
        <button
          type="button"
          onClick={parar}
          className="inline-flex h-6 items-center gap-1 rounded-full bg-destructive px-2 text-[11px] font-semibold text-white hover:opacity-90"
        >
          <Square className="size-3 fill-current" />
          Parar
        </button>
      </span>
    )
  }

  const botao = 'flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50'

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-3', className)}>
      {disponivel.tela ? (
        <button type="button" onClick={() => void iniciar('tela')} className={botao} disabled={desabilitado} title="Grava a tela (com sua voz, se liberar o microfone), até 5 minutos">
          <MonitorUp className="size-3.5" />
          Gravar tela
        </button>
      ) : null}
      {disponivel.voz ? (
        <button type="button" onClick={() => void iniciar('voz')} className={botao} disabled={desabilitado} title="Grava um recado de voz, até 5 minutos">
          <Mic className="size-3.5" />
          Gravar voz
        </button>
      ) : null}
      {erro ? <span className="text-[11px] text-destructive">{erro}</span> : null}
    </span>
  )
}
