'use client'

import * as React from 'react'

import type { Resultado } from '@/lib/tasks/types'

/**
 * Chama uma Server Action com estado de envio e erro.
 *
 * Não recarrega a tela: quem chama atualiza o próprio estado com o que
 * a ação devolve, e as ações que mudam a estrutura (espaços, listas,
 * status) revalidam a rota no servidor por conta própria.
 */
export function useAcao() {
  const [pendente, setPendente] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [mensagem, setMensagem] = React.useState<string | null>(null)

  const executar = React.useCallback(
    async <T,>(acao: () => Promise<Resultado<T>>): Promise<T | undefined> => {
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
        return resultado.data
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha inesperada. Tente de novo.')
        return undefined
      } finally {
        setPendente(false)
      }
    },
    [],
  )

  const limpar = React.useCallback(() => {
    setErro(null)
    setMensagem(null)
  }, [])

  return { executar, pendente, erro, mensagem, limpar, setErro }
}
