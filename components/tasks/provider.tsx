'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { carregarTarefa } from '@/app/tasks/actions'
import type { EspacoComArvore, EventoTarefa, Pessoa, Resultado, TarefaDetalhe } from '@/lib/tasks/types'

interface TasksContextValue {
  colab: Pessoa
  pessoas: Pessoa[]
  pessoa: (email: string) => Pessoa | undefined
  /** Nome para mostrar: o nome cadastrado, ou o e-mail quando não há nome. */
  nomeDe: (email: string | null | undefined) => string
  arvore: EspacoComArvore[]
  abrirTarefa: (id: string) => void
  /** `atualizar` recarrega a tela de baixo depois de fechar, quando o modal mudou algo. */
  fecharTarefa: (opcoes?: { atualizar?: boolean }) => void
  /** Busca antecipada do detalhe (ao passar o mouse), para o modal abrir pronto. */
  prefetchTarefa: (id: string) => void
  /** O detalhe, do prefetch se houver um recente; senão busca agora. */
  pegarDetalhe: (id: string) => Promise<Resultado<TarefaDetalhe>>
  /** Avisa as outras telas abertas que uma tarefa mudou. */
  emitir: (evento: EventoTarefa) => void
  /** Recebe os avisos. Devolve a função que cancela a assinatura. */
  ouvir: (fn: (evento: EventoTarefa) => void) => () => void
  sidebarAberta: boolean
  setSidebarAberta: (aberta: boolean) => void
}

const TasksContext = React.createContext<TasksContextValue | null>(null)

/** Quanto tempo um prefetch vale antes de ser refeito. */
const VALIDADE_PREFETCH_MS = 20_000

/**
 * Estado compartilhado do módulo: quem está logado, quem são as pessoas
 * (para avatares e seletores), a árvore de espaços, a abertura do modal
 * e o "barramento" que mantém a lista atrás do modal em dia sem pedir
 * a tela inteira de novo ao servidor.
 *
 * O modal vive na URL (?t=<id>), então o link é compartilhável e o
 * "voltar" fecha. A URL é trocada com pushState, que o roteador do Next
 * entende sem re-renderizar a página no servidor.
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
  const ouvintes = React.useRef(new Set<(evento: EventoTarefa) => void>())
  const prefetches = React.useRef(new Map<string, { em: number; promessa: Promise<Resultado<TarefaDetalhe>> }>())

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

  const abrirTarefa = React.useCallback((id: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set('t', id)
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`)
  }, [])

  const fecharTarefa = React.useCallback(
    (opcoes?: { atualizar?: boolean }) => {
      const params = new URLSearchParams(window.location.search)
      if (params.has('t')) {
        params.delete('t')
        const q = params.toString()
        window.history.pushState(null, '', q ? `${window.location.pathname}?${q}` : window.location.pathname)
      }
      // Contadores da barra lateral e painéis do Início são do servidor:
      // uma recarga só, depois de fechar, e só se algo mudou.
      if (opcoes?.atualizar) router.refresh()
    },
    [router],
  )

  const pegarDetalhe = React.useCallback((id: string) => {
    const guardado = prefetches.current.get(id)
    if (guardado && Date.now() - guardado.em < VALIDADE_PREFETCH_MS) return guardado.promessa
    const promessa = carregarTarefa(id)
    prefetches.current.set(id, { em: Date.now(), promessa })
    return promessa
  }, [])

  const prefetchTarefa = React.useCallback(
    (id: string) => {
      void pegarDetalhe(id)
    },
    [pegarDetalhe],
  )

  const emitir = React.useCallback((evento: EventoTarefa) => {
    // Depois de uma mudança o prefetch daquela tarefa está velho.
    if (evento.tipo !== 'criada') prefetches.current.delete(evento.tipo === 'removida' ? evento.id : evento.tarefa.id)
    for (const fn of ouvintes.current) fn(evento)
  }, [])

  const ouvir = React.useCallback((fn: (evento: EventoTarefa) => void) => {
    ouvintes.current.add(fn)
    return () => {
      ouvintes.current.delete(fn)
    }
  }, [])

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
      prefetchTarefa,
      pegarDetalhe,
      emitir,
      ouvir,
      sidebarAberta,
      setSidebarAberta,
    }),
    [colab, pessoas, pessoa, nomeDe, arvore, abrirTarefa, fecharTarefa, prefetchTarefa, pegarDetalhe, emitir, ouvir, sidebarAberta],
  )

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}

export function useTasks(): TasksContextValue {
  const ctx = React.useContext(TasksContext)
  if (!ctx) throw new Error('useTasks() precisa estar dentro de <TasksProvider>.')
  return ctx
}

/**
 * Mantém uma lista local de tarefas em dia com o que o modal (ou outra
 * visualização) mudou. `listaId` limita aos avisos daquela lista.
 */
export function useEventosDeTarefa(
  listaId: string | null,
  setItens: React.Dispatch<React.SetStateAction<import('@/lib/tasks/types').Tarefa[]>>,
) {
  const { ouvir } = useTasks()
  React.useEffect(
    () =>
      ouvir((evento) => {
        setItens((atual) => {
          if (evento.tipo === 'removida') return atual.filter((t) => t.id !== evento.id && t.pai_id !== evento.id)
          const daLista = listaId === null || evento.tarefa.lista_id === listaId
          const existe = atual.some((t) => t.id === evento.tarefa.id)
          if (evento.tipo === 'criada') return daLista && !existe ? [...atual, evento.tarefa] : atual
          if (!daLista) return atual.filter((t) => t.id !== evento.tarefa.id)
          return existe ? atual.map((t) => (t.id === evento.tarefa.id ? evento.tarefa : t)) : [...atual, evento.tarefa]
        })
      }),
    [ouvir, listaId, setItens],
  )
}
