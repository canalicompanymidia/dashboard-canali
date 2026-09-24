'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'

import type { EspacoComArvore, Pessoa } from '@/lib/tasks/types'

interface TasksContextValue {
  colab: Pessoa
  pessoas: Pessoa[]
  pessoa: (email: string) => Pessoa | undefined
  /** Nome para mostrar: o nome cadastrado, ou o e-mail quando não há nome. */
  nomeDe: (email: string | null | undefined) => string
  arvore: EspacoComArvore[]
  abrirTarefa: (id: string) => void
  fecharTarefa: () => void
  sidebarAberta: boolean
  setSidebarAberta: (aberta: boolean) => void
}

const TasksContext = React.createContext<TasksContextValue | null>(null)

/**
 * Estado compartilhado do módulo: quem está logado, quem são as pessoas
 * (para desenhar avatares e seletores), a árvore de espaços e a abertura
 * do modal de tarefa — que vive na URL (?t=<id>) para o link ser
 * compartilhável e o botão "voltar" fechar o modal.
 */
export function TasksProvider({
  colab,
  pessoas,
  arvore,
  children,
}: {
  colab: Pessoa
  pessoas: Pessoa[]
  arvore: EspacoComArvore[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarAberta, setSidebarAberta] = React.useState(false)

  const mapa = React.useMemo(() => new Map(pessoas.map((p) => [p.email, p])), [pessoas])

  const pessoa = React.useCallback((email: string) => mapa.get(email.toLowerCase()), [mapa])

  const nomeDe = React.useCallback(
    (email: string | null | undefined) => {
      if (!email) return ''
      const p = mapa.get(email.toLowerCase())
      return p?.nome?.trim() || email
    },
    [mapa],
  )

  // A URL é lida na hora do clique (e não por hook) para o provider não
  // exigir Suspense em toda a árvore. Só o modal observa o parâmetro.
  const abrirTarefa = React.useCallback(
    (id: string) => {
      const params = new URLSearchParams(window.location.search)
      params.set('t', id)
      router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false })
    },
    [router],
  )

  const fecharTarefa = React.useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    params.delete('t')
    const q = params.toString()
    router.push(q ? `${window.location.pathname}?${q}` : window.location.pathname, { scroll: false })
  }, [router])

  // Navegou: a gaveta do celular fecha sozinha.
  React.useEffect(() => {
    setSidebarAberta(false)
  }, [pathname])

  const value = React.useMemo<TasksContextValue>(
    () => ({
      colab,
      pessoas,
      pessoa,
      nomeDe,
      arvore,
      abrirTarefa,
      fecharTarefa,
      sidebarAberta,
      setSidebarAberta,
    }),
    [colab, pessoas, pessoa, nomeDe, arvore, abrirTarefa, fecharTarefa, sidebarAberta],
  )

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}

export function useTasks(): TasksContextValue {
  const ctx = React.useContext(TasksContext)
  if (!ctx) throw new Error('useTasks() precisa estar dentro de <TasksProvider>.')
  return ctx
}
