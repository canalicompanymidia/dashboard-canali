'use client'

import * as React from 'react'
import { CornerDownRight, ListChecks, MessageSquare, Paperclip } from 'lucide-react'

import { Avatares, DataChip, PrioridadeFlag, StatusDot } from '@/components/tasks/pecas'
import { useTasks } from '@/components/tasks/provider'
import { statusEncerra, type Tarefa } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Linha compacta de tarefa, usada onde tarefas de listas diferentes se
 * misturam (Início, Minhas tarefas, busca). Clicar abre o modal.
 */
export function TaskRow({
  tarefa,
  mostrarLista = true,
  mostrarStatus = false,
  className,
}: {
  tarefa: Tarefa
  mostrarLista?: boolean
  mostrarStatus?: boolean
  className?: string
}) {
  const { abrirTarefa } = useTasks()
  const concluida = statusEncerra(tarefa.status_tipo)

  return (
    <button
      type="button"
      onClick={() => abrirTarefa(tarefa.id)}
      className={cn(
        'flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-accent/60',
        className,
      )}
    >
      <StatusDot cor={tarefa.status_cor} tipo={tarefa.status_tipo} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {tarefa.pai_id ? <CornerDownRight className="size-3 shrink-0 text-muted-foreground" /> : null}
          <span className={cn('truncate', concluida && 'text-muted-foreground line-through')}>{tarefa.titulo}</span>
        </span>
        {mostrarLista ? (
          <span className="block truncate text-[11px] text-muted-foreground">
            {mostrarStatus ? <>{tarefa.status_nome} · </> : null}
            {tarefa.pasta_nome ? `${tarefa.pasta_nome} / ` : `${tarefa.espaco_nome} / `}
            {tarefa.lista_nome}
          </span>
        ) : null}
      </span>
      <Indicadores tarefa={tarefa} />
      <Avatares emails={tarefa.responsaveis} tamanho="xs" max={2} />
      <DataChip iso={tarefa.data_vencimento} concluida={concluida} className="w-16 justify-end" />
      <PrioridadeFlag prioridade={tarefa.prioridade} />
    </button>
  )
}

/** Contadores discretos: subtarefas, checklist, comentários e anexos. */
export function Indicadores({ tarefa, className }: { tarefa: Tarefa; className?: string }) {
  const itens: React.ReactNode[] = []
  if (tarefa.subtarefas_total > 0) {
    itens.push(
      <span key="sub" className="inline-flex items-center gap-0.5" title="Subtarefas">
        <CornerDownRight className="size-3" />
        {tarefa.subtarefas_concluidas}/{tarefa.subtarefas_total}
      </span>,
    )
  }
  if (tarefa.checklist_total > 0) {
    itens.push(
      <span key="chk" className="inline-flex items-center gap-0.5" title="Checklist">
        <ListChecks className="size-3" />
        {tarefa.checklist_feitos}/{tarefa.checklist_total}
      </span>,
    )
  }
  if (tarefa.comentarios_total > 0) {
    itens.push(
      <span key="com" className="inline-flex items-center gap-0.5" title="Comentários">
        <MessageSquare className="size-3" />
        {tarefa.comentarios_total}
      </span>,
    )
  }
  if (tarefa.anexos_total > 0) {
    itens.push(
      <span key="anx" className="inline-flex items-center gap-0.5" title="Anexos">
        <Paperclip className="size-3" />
        {tarefa.anexos_total}
      </span>,
    )
  }
  if (itens.length === 0) return null
  return (
    <span className={cn('hidden items-center gap-2 text-[11px] text-muted-foreground tabular sm:inline-flex', className)}>
      {itens}
    </span>
  )
}
