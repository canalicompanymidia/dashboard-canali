import { BotaoNovaTarefa } from '@/components/tasks/home'
import { MinhasView, type FiltroMinhas } from '@/components/tasks/minhas-view'
import { Topbar } from '@/components/tasks/topbar'
import { requireColaborador } from '@/lib/auth'
import { getMinhasTarefas } from '@/lib/tasks/data'

export const dynamic = 'force-dynamic'

const FILTROS: FiltroMinhas[] = ['pendentes', 'hoje', 'feitas', 'todas']

export default async function MinhasTarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>
}) {
  const colab = await requireColaborador()
  const { f } = await searchParams
  const filtro: FiltroMinhas = FILTROS.includes(f as FiltroMinhas) ? (f as FiltroMinhas) : 'pendentes'
  const minhas = await getMinhasTarefas(colab)

  return (
    <>
      <Topbar crumbs={[{ label: 'Minhas tarefas' }]}>
        <BotaoNovaTarefa />
      </Topbar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MinhasView tarefas={minhas} filtro={filtro} />
      </div>
    </>
  )
}
