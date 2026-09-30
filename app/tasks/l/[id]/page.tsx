import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import { ListaHeader } from '@/components/tasks/lista-header'
import { ViewCalendario } from '@/components/tasks/view-calendario'
import { ViewLista } from '@/components/tasks/view-lista'
import { ViewQuadro } from '@/components/tasks/view-quadro'
import { requireColaborador } from '@/lib/auth'
import { getListaContexto, getTarefasDaLista } from '@/lib/tasks/data'
import { COOKIE_VIEWS, lerViewsLembradas, resolverVisualizacao } from '@/lib/tasks/visualizacao'

export const dynamic = 'force-dynamic'

export default async function ListaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const colab = await requireColaborador()
  const [{ id }, { view }, jar] = await Promise.all([params, searchParams, cookies()])

  const contexto = await getListaContexto(id, colab)
  if (!contexto) notFound()

  const tarefas = await getTarefasDaLista(contexto.lista.id)

  // ?view → a última aba desta pessoa nesta lista → padrão da lista →
  // padrão do espaço → Quadro.
  const atual = resolverVisualizacao({
    param: view,
    lembrada: lerViewsLembradas(jar.get(COOKIE_VIEWS)?.value)[contexto.lista.id],
    lista: contexto.lista.visualizacao_padrao,
    espaco: contexto.espaco.visualizacao_padrao,
  })

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
