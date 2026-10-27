'use client'

import * as React from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Quem está com o Tasks aberto agora. Usa a presença do Realtime num
 * canal PRIVADO ("tasks:presenca"): o Supabase só deixa entrar quem
 * apresenta o token de um colaborador ativo (policies em
 * realtime.messages, migration 0008). Pelo canal passa apenas o e-mail
 * de quem está online — nenhum dado de tarefa.
 *
 * Se o canal falhar (Realtime fora, policy ausente), ninguém aparece
 * online e o resto do módulo segue normal.
 *
 * O chat usa o mesmo canal para avisar "chegou mensagem": quem envia
 * anuncia na presença o id da conversa (nunca o texto) e os outros
 * buscam as novidades no servidor, que confere quem é membro.
 */

/** Último aviso de mensagem nova vindo de outra pessoa. */
export interface SinalChat {
  conversa: string
  marca: string
}

interface PresencaValue {
  online: ReadonlySet<string>
  sinalChat: SinalChat | null
  /** Anuncia aos outros que esta pessoa mandou mensagem na conversa. */
  avisarChat: (conversa: string) => void
}

const PresencaContext = React.createContext<PresencaValue>({
  online: new Set(),
  sinalChat: null,
  avisarChat: () => {},
})

interface Meta {
  desde?: string
  chat?: SinalChat
}

const CANAL = 'tasks:presenca'

export function PresencaProvider({ email, children }: { email: string; children: React.ReactNode }) {
  const [online, setOnline] = React.useState<ReadonlySet<string>>(() => new Set([email.toLowerCase()]))
  const [sinalChat, setSinalChat] = React.useState<SinalChat | null>(null)
  const canalRef = React.useRef<RealtimeChannel | null>(null)
  const desdeRef = React.useRef(new Date().toISOString())

  React.useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    let canal: RealtimeChannel | null = null
    let cancelado = false
    const eu = email.toLowerCase()

    const entrar = async () => {
      try {
        // Canal privado: o socket precisa do token da sessão para as policies valerem.
        await supabase.realtime.setAuth()
        if (cancelado) return
        const c = supabase.channel(CANAL, { config: { private: true, presence: { key: eu } } })
        canal = c
        canalRef.current = c
        // Marcas já vistas: um sync repete o estado inteiro, e só o aviso
        // novo deve disparar a busca.
        const vistas = new Map<string, string>()
        let primeiro = true
        c.on('presence', { event: 'sync' }, () => {
          const estado = c.presenceState() as Record<string, Meta[]>
          const chaves = Object.keys(estado).map((k) => k.toLowerCase())
          setOnline(new Set([eu, ...chaves]))
          for (const [chave, metas] of Object.entries(estado)) {
            if (chave.toLowerCase() === eu) continue
            const chat = metas.at(-1)?.chat
            if (!chat || vistas.get(chave) === chat.marca) continue
            vistas.set(chave, chat.marca)
            // No primeiro sync, o aviso é antigo: só registra.
            if (!primeiro) setSinalChat({ conversa: chat.conversa, marca: chat.marca })
          }
          primeiro = false
        })
        c.subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') await c.track({ desde: desdeRef.current })
        })
      } catch {
        // Sem presença: a lista fica só com a própria pessoa.
      }
    }
    void entrar()

    // Voltou para a aba depois de um tempo: garante que ainda está anunciado.
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && canal?.state === 'joined') {
        desdeRef.current = new Date().toISOString()
        void canal.track({ desde: desdeRef.current })
      }
    }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', aoVoltar)
      canalRef.current = null
      if (canal) void supabase.removeChannel(canal)
    }
  }, [email])

  const avisarChat = React.useCallback((conversa: string) => {
    const c = canalRef.current
    if (c?.state !== 'joined') return
    const marca = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    void c.track({ desde: desdeRef.current, chat: { conversa, marca } })
  }, [])

  const value = React.useMemo(() => ({ online, sinalChat, avisarChat }), [online, sinalChat, avisarChat])
  return <PresencaContext.Provider value={value}>{children}</PresencaContext.Provider>
}

/** true se a pessoa está com o Tasks aberto agora. */
export function useOnline(email: string): boolean {
  return React.useContext(PresencaContext).online.has(email.toLowerCase())
}

/** Todos os e-mails online agora (inclui você). */
export function useOnlineTodos(): ReadonlySet<string> {
  return React.useContext(PresencaContext).online
}

/** Aviso de mensagem nova e a função de anunciar a própria. */
export function useSinalChat(): Pick<PresencaValue, 'sinalChat' | 'avisarChat'> {
  const { sinalChat, avisarChat } = React.useContext(PresencaContext)
  return { sinalChat, avisarChat }
}
