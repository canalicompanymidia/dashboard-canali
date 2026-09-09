'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'

import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Rede de segurança para links de e-mail que voltam com a sessão no
 * FRAGMENTO da URL (#access_token=...).
 *
 * O fragmento nunca é enviado ao servidor, então o callback não consegue
 * lê-lo. Mas ele sobrevive ao redirecionamento e chega aqui, no
 * navegador — onde dá para transformar em sessão de verdade.
 *
 * O caminho correto é o template de e-mail apontar para
 * `?token_hash=...&type=...`, que o servidor resolve sozinho. Este
 * componente existe para o dia em que um template ficar sem ajustar e
 * um convite já tiver saído: em vez de um erro sem saída, a pessoa
 * entra.
 */
export function RecuperarSessao({ destino }: { destino: string }) {
  const [estado, setEstado] = React.useState<'verificando' | 'nada' | 'erro'>('verificando')

  React.useEffect(() => {
    const fragmento = window.location.hash.replace(/^#/, '')
    if (!fragmento) {
      setEstado('nada')
      return
    }

    const params = new URLSearchParams(fragmento)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      setEstado('nada')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setEstado('erro')
      return
    }

    let cancelado = false

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }: { error: { message: string } | null }) => {
        if (cancelado) return
        if (error) {
          setEstado('erro')
          return
        }
        // Tira o token da barra de endereços antes de sair da página —
        // ele não precisa ficar no histórico do navegador.
        window.history.replaceState(null, '', window.location.pathname)
        // Navegação completa, e não router.push: o servidor precisa
        // receber os cookies que o setSession acabou de gravar.
        window.location.replace(destino)
      })

    return () => {
      cancelado = true
    }
  }, [destino])

  if (estado === 'nada') return null

  if (estado === 'erro') {
    return (
      <p className="mb-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
        Não foi possível concluir o acesso por este link. Peça um novo em &quot;Esqueci minha
        senha&quot;.
      </p>
    )
  }

  return (
    <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 shrink-0 animate-spin" />
      Concluindo seu acesso...
    </p>
  )
}
