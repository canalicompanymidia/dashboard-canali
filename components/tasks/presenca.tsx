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
 */

interface PresencaValue {
  online: ReadonlySet<string>
}

const PresencaContext = React.createContext<PresencaValue>({ online: new Set() })

const CANAL = 'tasks:presenca'

export function PresencaProvider({ email, children }: { email: string; children: React.ReactNode }) {
  const [online, setOnline] = React.useState<ReadonlySet<string>>(() => new Set([email.toLowerCase()]))

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
        c.on('presence', { event: 'sync' }, () => {
          const chaves = Object.keys(c.presenceState()).map((k) => k.toLowerCase())
          setOnline(new Set([eu, ...chaves]))
        })
        c.subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') await c.track({ desde: new Date().toISOString() })
        })
      } catch {
        // Sem presença: a lista fica só com a própria pessoa.
      }
    }
    void entrar()

    // Voltou para a aba depois de um tempo: garante que ainda está anunciado.
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && canal?.state === 'joined') {
        void canal.track({ desde: new Date().toISOString() })
      }
    }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', aoVoltar)
      if (canal) void supabase.removeChannel(canal)
    }
  }, [email])

  const value = React.useMemo(() => ({ online }), [online])
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
