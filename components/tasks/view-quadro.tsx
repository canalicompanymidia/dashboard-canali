'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'

import { criarTarefa, moverTarefa } from '@/app/tasks/actions'
import { Avatares, ChipsDeCampos, DataChip, PrioridadeFlag, StatusPill } from '@/components/tasks/pecas'
import { useTasks } from '@/components/tasks/provider'
import { Indicadores } from '@/components/tasks/task-row'
import { useAcao } from '@/components/tasks/use-acao'
import { statusEncerra, type ListaContexto, type Status, type Tarefa } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Quadro (kanban): uma coluna por status. Arrastar um card entre colunas
 * muda o status; dentro da coluna, reordena. A posição é fracionária —
 * soltar entre dois cards só grava a tarefa movida.
 */
export function ViewQuadro({ contexto, tarefas }: { contexto: ListaContexto; tarefas: Tarefa[] }) {
  const { statuses, campos, lista } = contexto
  const { executar, erro, setErro } = useAcao()
  const [itens, setItens] = React.useState(tarefas)
  React.useEffect(() => setItens(tarefas), [tarefas])

  const [arrastando, setArrastando] = React.useState<string | null>(null)
  const [sobre, setSobre] = React.useState<string | null>(null)

  const porStatus = React.useMemo(() => {
    const mapa = new Map<string, Tarefa[]>()
    for (const s of statuses) mapa.set(s.id, [])
    for (const t of itens) {
      if (t.pai_id) continue
      mapa.get(t.status_id)?.push(t)
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.posicao - b.posicao || a.created_at.localeCompare(b.created_at))
    return mapa
  }, [itens, statuses])

  async function soltar(status: Status, antesDeId: string | null) {
    const id = arrastando
    setArrastando(null)
    setSobre(null)
    if (!id) return

    const coluna = (porStatus.get(status.id) ?? []).filter((t) => t.id !== id)
    let posicao: number
    if (antesDeId) {
      const idx = coluna.findIndex((t) => t.id === antesDeId)
      const anterior = coluna[idx - 1]
      const proxima = coluna[idx]
      posicao = anterior ? (anterior.posicao + proxima.posicao) / 2 : proxima.posicao - 1024
    } else {
      const ultima = coluna[coluna.length - 1]
      posicao = ultima ? ultima.posicao + 1024 : 1024
    }

    const original = itens.find((t) => t.id === id)
    if (!original) return
    if (original.status_id === status.id && original.posicao === posicao) return

    // Otimista: o card já aparece no lugar novo enquanto o servidor grava.
    setItens((atual) =>
      atual.map((t) =>
        t.id === id
          ? {
              ...t,
              status_id: status.id,
              status_nome: status.nome,
              status_cor: status.cor,
              status_tipo: status.tipo,
              status_posicao: status.posicao,
              posicao,
            }
          : t,
      ),
    )

    const salvo = await executar(() => moverTarefa({ tarefa_id: id, status_id: status.id, posicao }))
    if (!salvo) setItens((atual) => atual.map((t) => (t.id === id ? original : t)))
    else setItens((atual) => atual.map((t) => (t.id === id ? salvo : t)))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {erro ? (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          <span className="flex-1">{erro}</span>
          <button type="button" onClick={() => setErro(null)}>fechar</button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-3 py-4 sm:px-6">
        {statuses.map((status) => {
          const cards = porStatus.get(status.id) ?? []
          const destacada = sobre === status.id && arrastando !== null
          return (
            <section
              key={status.id}
              className={cn(
                'flex max-h-full w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30 transition-colors',
                destacada && 'border-ring bg-accent/60',
              )}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (sobre !== status.id) setSobre(status.id)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                void soltar(status, null)
              }}
            >
              <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
                <StatusPill nome={status.nome} cor={status.cor} tamanho="md" />
                <span className="text-xs text-muted-foreground tabular">{cards.length}</span>
              </header>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {cards.map((t) => (
                  <Card
                    key={t.id}
                    tarefa={t}
                    campos={campos}
                    arrastando={arrastando === t.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setArrastando(t.id)
                    }}
                    onDragEnd={() => {
                      setArrastando(null)
                      setSobre(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void soltar(status, t.id)
                    }}
                  />
                ))}
                {cards.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    Arraste tarefas para cá
                  </p>
                ) : null}
              </div>

              <NovoCard listaId={lista.id} status={status} onCriada={(t) => setItens((atual) => [...atual, t])} />
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Card({
  tarefa,
  campos,
  arrastando,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  tarefa: Tarefa
  campos: ListaContexto['campos']
  arrastando: boolean
  onDragStart: React.DragEventHandler<HTMLDivElement>
  onDragEnd: () => void
  onDrop: React.DragEventHandler<HTMLDivElement>
}) {
  const { abrirTarefa } = useTasks()
  const concluida = statusEncerra(tarefa.status_tipo)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={onDrop}
      onClick={() => abrirTarefa(tarefa.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          abrirTarefa(tarefa.id)
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'cursor-grab rounded-lg border border-border bg-card p-3 text-left shadow-xs transition-all hover:border-input hover:shadow-md active:cursor-grabbing',
        'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
        arrastando && 'opacity-40',
      )}
    >
      <p className={cn('text-[13px] leading-snug font-medium', concluida && 'text-muted-foreground line-through')}>
        {tarefa.titulo}
      </p>
      {tarefa.etiquetas.length > 0 ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{tarefa.etiquetas.map((e) => `#${e}`).join(' ')}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusPill nome={tarefa.status_nome} cor={tarefa.status_cor} tamanho="xs" />
        <PrioridadeFlag prioridade={tarefa.prioridade} />
        <DataChip iso={tarefa.data_vencimento} concluida={concluida} />
        <Indicadores tarefa={tarefa} className="inline-flex" />
        <span className="ml-auto">
          <Avatares emails={tarefa.responsaveis} tamanho="xs" />
        </span>
      </div>
      <div className="mt-1.5 empty:hidden">
        <ChipsDeCampos campos={campos} valores={tarefa.campos} />
      </div>
    </div>
  )
}

function NovoCard({
  listaId,
  status,
  onCriada,
}: {
  listaId: string
  status: Status
  onCriada: (t: Tarefa) => void
}) {
  const { executar, pendente } = useAcao()
  const [editando, setEditando] = React.useState(false)
  const [titulo, setTitulo] = React.useState('')

  async function criar() {
    const t = titulo.trim()
    if (!t) return setEditando(false)
    const nova = await executar(() => criarTarefa({ lista_id: listaId, titulo: t, status_id: status.id }))
    if (nova) {
      onCriada(nova)
      setTitulo('')
    }
  }

  return (
    <div className="shrink-0 p-2 pt-0">
      {editando ? (
        <textarea
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={criar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void criar()
            }
            if (e.key === 'Escape') {
              setTitulo('')
              setEditando(false)
            }
          }}
          disabled={pendente}
          rows={2}
          placeholder="Nome da tarefa — Enter para criar"
          className="w-full resize-none rounded-lg border border-input bg-card p-2 text-[13px] outline-none focus-visible:border-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Adicionar tarefa
        </button>
      )}
    </div>
  )
}
