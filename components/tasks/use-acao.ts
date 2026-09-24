'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import type { Resultado } from '@/lib/tasks/types'

/**
 * Chama uma Server Action com estado de envio e erro, e atualiza a tela
 * de baixo (router.refresh) quando dá certo — assim a lista atrás do
 * modal reflete a mudança sem recarregar a página inteira.
 */
export function useAcao() {
  const router = useRouter()
  const [pendente, setPendente] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [mensagem, setMensagem] = React.useState<string | null>(null)

  const executar = React.useCallback(
    async <T,>(
      acao: () => Promise<Resultado<T>>,
      opcoes: { atualizar?: boolean } = {},
    ): Promise<T | undefined> => {
      setPendente(true)
      setErro(null)
      setMensagem(null)
      try {
        const resultado = await acao()
        if (!resultado.ok) {
          setErro(resultado.message)
          return undefined
        }
        if (resultado.message) setMensagem(resultado.message)
        if (opcoes.atualizar !== false) router.refresh()
        return resultado.data
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha inesperada. Tente de novo.')
        return undefined
      } finally {
        setPendente(false)
      }
    },
    [router],
  )

  const limpar = React.useCallback(() => {
    setErro(null)
    setMensagem(null)
  }, [])

  return { executar, pendente, erro, mensagem, limpar, setErro }
}
