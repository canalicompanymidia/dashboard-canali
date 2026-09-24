import { notFound } from 'next/navigation'

import { ListaHeader, type VisualizacaoLista } from '@/components/tasks/lista-header'
import { ViewCalendario } from '@/components/tasks/view-calendario'
import { ViewLista } from '@/components/tasks/view-lista'
import { ViewQuadro } from '@/components/tasks/view-quadro'
import { requireColaborador } from '@/lib/auth'
import { getListaContexto, getTarefasDaLista } from '@/lib/tasks/data'

export const dynamic = 'force-dynamic'

const VIEWS: VisualizacaoLista[] = ['lista', 'quadro', 'calendario']

export default async function ListaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const colab = await requireColaborador()
  const [{ id }, { view }] = await Promise.all([params, searchParams])

  const contexto = await getListaContexto(id, colab)
  if (!contexto) notFound()

  const tarefas = await getTarefasDaLista(contexto.lista.id)
  const atual: VisualizacaoLista = VIEWS.includes(view as VisualizacaoLista) ? (view as VisualizacaoLista) : 'lista'

  return (
    <>
      <ListaHeader contexto={contexto} view={atual} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {atual === 'quadro' ? (
          <ViewQuadro contexto={contexto} tarefas={tarefas} />
        ) : atual === 'calendario' ? (
          <ViewCalendario contexto={contexto} tarefas={tarefas} />
        ) : (
          <ViewLista contexto={contexto} tarefas={tarefas} />
        )}
      </div>
    </>
  )
}
