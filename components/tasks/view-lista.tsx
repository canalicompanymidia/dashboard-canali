'use client'

import * as React from 'react'
import { AlertTriangle, ChevronRight, CornerDownRight, Plus, X } from 'lucide-react'

import { atualizarTarefa, criarTarefa } from '@/app/tasks/actions'
import { Avatares, DataChip, PrioridadeFlag, StatusDot, StatusPill } from '@/components/tasks/pecas'
import { DataPicker, PessoasPicker, PrioridadePicker, StatusPicker } from '@/components/tasks/pickers'
import { useEventosDeTarefa, useTasks } from '@/components/tasks/provider'
import { Indicadores } from '@/components/tasks/task-row'
import { useAcao } from '@/components/tasks/use-acao'
import { Button } from '@/components/ui/button'
import { aplicarPatchLocal, type PatchLocal } from '@/lib/tasks/patch-local'
import { statusEncerra, type ListaContexto, type Status, type Tarefa } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Visualização em lista: um grupo por status, linhas com edição inline
 * de status, responsáveis, vencimento e prioridade. Subtarefas ficam
 * recolhidas sob a tarefa-mãe.
 */
export function ViewLista({ contexto, tarefas }: { contexto: ListaContexto; tarefas: Tarefa[] }) {
  const { statuses, lista } = contexto
  const [itens, setItens] = React.useState(tarefas)
  React.useEffect(() => setItens(tarefas), [tarefas])
  // O modal avisa o que mudou; a lista acompanha sem ir ao servidor.
  useEventosDeTarefa(lista.id, setItens)

  const [fechados, setFechados] = React.useState<Set<string>>(
    () => new Set(statuses.filter((s) => statusEncerra(s.tipo)).map((s) => s.id)),
  )

  // O erro de uma linha vive aqui, e não na linha: ao mudar de status a
  // linha troca de grupo (é desmontada e remontada), e um estado dentro
  // dela se perderia junto.
  const [erro, setErro] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!erro) return
    const t = setTimeout(() => setErro(null), 6000)
    return () => clearTimeout(t)
  }, [erro])

  function substituir(t: Tarefa) {
    setItens((atual) => atual.map((x) => (x.id === t.id ? t : x)))
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-3 py-4 sm:px-6">
      {erro ? (
        <div role="alert" className="sticky top-0 z-10 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="flex-1">{erro}</span>
          <Button variant="ghost" size="icon-sm" className="size-6 text-destructive" onClick={() => setErro(null)} aria-label="Fechar aviso">
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
      {statuses.map((status) => {
        const doStatus = itens.filter((t) => t.status_id === status.id && !t.pai_id)
        const fechado = fechados.has(status.id)
        return (
          <section key={status.id}>
            <header className="mb-1 flex items-center gap-2 px-1">
              <button
                type="button"
                onClick={() =>
                  setFechados((atual) => {
                    const novo = new Set(atual)
                    if (novo.has(status.id)) novo.delete(status.id)
                    else novo.add(status.id)
                    return novo
                  })
                }
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-expanded={!fechado}
                aria-label={fechado ? `Expandir ${status.nome}` : `Recolher ${status.nome}`}
              >
                <ChevronRight className={cn('size-3.5 transition-transform', !fechado && 'rotate-90')} />
              </button>
              <StatusPill nome={status.nome} cor={status.cor} tamanho="md" />
              <span className="text-xs text-muted-foreground tabular">{doStatus.length}</span>
            </header>

            {!fechado ? (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="hidden h-8 items-center gap-2 border-b border-border px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase md:flex">
                  <span className="w-6" />
                  <span className="flex-1">Nome</span>
                  <span className="w-28">Responsáveis</span>
                  <span className="w-24">Vencimento</span>
                  <span className="w-20">Prioridade</span>
                </div>
                {doStatus.map((t) => (
                  <Linha
                    key={t.id}
                    tarefa={t}
                    subtarefas={itens.filter((s) => s.pai_id === t.id)}
                    statuses={statuses}
                    onAtualizar={substituir}
                    aoErro={setErro}
                  />
                ))}
                <NovaLinha
                  listaId={lista.id}
                  status={status}
                  onCriada={(t) => setItens((atual) => [...atual, t])}
                />
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

function Linha({
  tarefa,
  subtarefas,
  statuses,
  onAtualizar,
  aoErro,
  nivel = 0,
}: {
  tarefa: Tarefa
  subtarefas: Tarefa[]
  statuses: Status[]
  onAtualizar: (t: Tarefa) => void
  aoErro: (mensagem: string) => void
  nivel?: number
}) {
  const { abrirTarefa, prefetchTarefa } = useTasks()
  const [aberto, setAberto] = React.useState(false)
  const concluida = statusEncerra(tarefa.status_tipo)

  // Otimista: a linha muda no clique; se o servidor recusar, volta e o
  // aviso sobe para a lista (esta linha pode já ter sido remontada).
  async function patch(p: PatchLocal) {
    const anterior = tarefa
    onAtualizar(aplicarPatchLocal(tarefa, p, statuses))
    try {
      const res = await atualizarTarefa(tarefa.id, p)
      if (res.ok) onAtualizar(res.data.tarefa)
      else {
        onAtualizar(anterior)
        aoErro(res.message)
      }
    } catch (e) {
      onAtualizar(anterior)
      aoErro(e instanceof Error ? e.message : 'Falha inesperada. Tente de novo.')
    }
  }

  return (
    <>
      <div
        className={cn(
          'group flex min-h-9 items-center gap-2 border-b border-border px-2 text-[13px] last:border-b-0 hover:bg-accent/40',
          nivel > 0 && 'bg-muted/20',
        )}
        style={{ paddingLeft: `${8 + nivel * 24}px` }}
      >
        <span className="flex w-6 shrink-0 items-center justify-center">
          {subtarefas.length > 0 ? (
            <button
              type="button"
              onClick={() => setAberto((a) => !a)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={aberto ? 'Recolher subtarefas' : 'Expandir subtarefas'}
            >
              <ChevronRight className={cn('size-3.5 transition-transform', aberto && 'rotate-90')} />
            </button>
          ) : nivel > 0 ? (
            <CornerDownRight className="size-3 text-muted-foreground" />
          ) : null}
        </span>

        <StatusPicker statuses={statuses} valor={tarefa.status_id} onChange={(s) => patch({ status_id: s.id })}>
          <button type="button" className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-accent" aria-label={`Status: ${tarefa.status_nome}`}>
            <StatusDot cor={tarefa.status_cor} tipo={tarefa.status_tipo} />
          </button>
        </StatusPicker>

        <button
          type="button"
          onClick={() => abrirTarefa(tarefa.id)}
          onMouseEnter={() => prefetchTarefa(tarefa.id)}
          className={cn('min-w-0 flex-1 truncate py-2 text-left hover:underline', concluida && 'text-muted-foreground line-through')}
        >
          {tarefa.titulo}
        </button>

        <Indicadores tarefa={tarefa} />

        <span className="hidden w-28 md:block">
          <PessoasPicker valor={tarefa.responsaveis} onChange={(emails) => patch({ responsaveis: emails })}>
            <button type="button" className="flex h-7 items-center rounded-md px-1 hover:bg-accent" aria-label="Responsáveis">
              {tarefa.responsaveis.length ? (
                <Avatares emails={tarefa.responsaveis} tamanho="xs" />
              ) : (
                <span className="text-xs text-muted-foreground/70">—</span>
              )}
            </button>
          </PessoasPicker>
        </span>

        <span className="w-16 md:w-24">
          <DataPicker valor={tarefa.data_vencimento} onChange={(iso) => patch({ data_vencimento: iso })} rotulo="Vencimento">
            <button type="button" className="flex h-7 items-center rounded-md px-1 hover:bg-accent" aria-label="Vencimento">
              {tarefa.data_vencimento ? (
                <DataChip iso={tarefa.data_vencimento} concluida={concluida} />
              ) : (
                <span className="text-xs text-muted-foreground/70">—</span>
              )}
            </button>
          </DataPicker>
        </span>

        <span className="w-7 md:w-20">
          <PrioridadePicker valor={tarefa.prioridade} onChange={(p) => patch({ prioridade: p })}>
            <button type="button" className="flex h-7 items-center rounded-md px-1 hover:bg-accent" aria-label="Prioridade">
              <PrioridadeFlag prioridade={tarefa.prioridade} />
              <span className="ml-1 hidden text-xs md:inline">
                {tarefa.prioridade ? { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' }[tarefa.prioridade] : ''}
              </span>
            </button>
          </PrioridadePicker>
        </span>
      </div>

      {aberto
        ? subtarefas.map((s) => (
            <Linha key={s.id} tarefa={s} subtarefas={[]} statuses={statuses} onAtualizar={onAtualizar} aoErro={aoErro} nivel={nivel + 1} />
          ))
        : null}
    </>
  )
}

function NovaLinha({
  listaId,
  status,
  onCriada,
}: {
  listaId: string
  status: Status
  onCriada: (t: Tarefa) => void
}) {
  const { executar, pendente, erro } = useAcao()
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

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="flex h-8 w-full items-center gap-1.5 px-3 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"
      >
        <Plus className="size-3.5" />
        Adicionar tarefa
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <StatusDot cor={status.cor} tipo={status.tipo} />
      <input
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
        placeholder="Nome da tarefa — Enter para criar, Esc para cancelar"
        className="h-8 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
      {erro ? <span className="text-xs text-destructive">{erro}</span> : null}
    </div>
  )
}
