import { SearchX } from 'lucide-react'

import { Vazio } from '@/components/tasks/pecas'
import { TaskRow } from '@/components/tasks/task-row'
import { Topbar } from '@/components/tasks/topbar'
import { requireColaborador } from '@/lib/auth'
import { buscarTarefas } from '@/lib/tasks/data'

export const dynamic = 'force-dynamic'

export default async function BuscaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const colab = await requireColaborador()
  const { q } = await searchParams
  const termo = (q ?? '').trim()
  const resultados = termo ? await buscarTarefas(colab, termo) : []

  return (
    <>
      <Topbar crumbs={[{ label: termo ? `Busca: “${termo}”` : 'Busca' }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1000px] px-4 py-5 sm:px-6">
          <form action="/tasks/busca" className="mb-4">
            <input
              type="search"
              name="q"
              defaultValue={termo}
              placeholder="Buscar pelo título da tarefa"
              autoFocus
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
              aria-label="Buscar tarefas"
            />
          </form>

          {!termo ? (
            <p className="text-sm text-muted-foreground">Digite parte do título e pressione Enter.</p>
          ) : resultados.length === 0 ? (
            <Vazio icone={SearchX} titulo="Nada encontrado" texto={`Nenhuma tarefa com “${termo}” nos espaços que você vê.`} />
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground tabular">{resultados.length} resultado(s)</p>
              <ul className="rounded-xl border border-border bg-card p-1.5">
                {resultados.map((t) => (
                  <li key={t.id}>
                    <TaskRow tarefa={t} mostrarStatus />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  )
}
