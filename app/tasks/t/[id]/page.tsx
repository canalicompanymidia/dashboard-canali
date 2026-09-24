import { notFound, redirect } from 'next/navigation'

import { requireColaborador } from '@/lib/auth'
import { getEspacosVisiveis, getTarefa } from '@/lib/tasks/data'

export const dynamic = 'force-dynamic'

/**
 * Link direto para uma tarefa: leva à lista dela com o modal aberto.
 * É o endereço que vale a pena colar no WhatsApp.
 */
export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const colab = await requireColaborador()
  const { id } = await params

  const tarefa = await getTarefa(id)
  if (!tarefa) notFound()

  const espacos = await getEspacosVisiveis(colab)
  if (!espacos.some((e) => e.id === tarefa.espaco_id)) notFound()

  redirect(`/tasks/l/${tarefa.lista_id}?t=${tarefa.id}`)
}
