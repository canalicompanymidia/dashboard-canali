'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'

import { TaskDetailDialog } from '@/components/tasks/task-detail'

/**
 * Observa ?t=<id> na URL e abre o modal da tarefa. Fica no layout, então
 * funciona em qualquer tela do módulo — e um link com ?t= abre direto.
 */
export function TaskOverlay() {
  const params = useSearchParams()
  const id = params.get('t')
  if (!id) return null
  return <TaskDetailDialog key={id} tarefaId={id} />
}
