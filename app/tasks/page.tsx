import { Agenda, AtribuidasAMim, BotaoNovaTarefa, MeuTrabalho, Recentes } from '@/components/tasks/home'
import { Topbar } from '@/components/tasks/topbar'
import { requireColaborador } from '@/lib/auth'
import {
  getMinhasTarefas,
  getTarefasDelegadas,
  getTarefasPorVencimento,
  getTarefasRecentes,
} from '@/lib/tasks/data'
import { hojeISO, somarDias } from '@/lib/tasks/datas'
import { primeiroNome } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function TasksInicioPage() {
  const colab = await requireColaborador()
  const hoje = hojeISO()
  const inicioAgenda = somarDias(hoje, -7)
  const fimAgenda = somarDias(hoje, 21)

  const [minhas, delegadas, recentes, agenda] = await Promise.all([
    getMinhasTarefas(colab),
    getTarefasDelegadas(colab),
    getTarefasRecentes(colab, 8),
    getTarefasPorVencimento(colab, inicioAgenda, fimAgenda),
  ])

  return (
    <>
      <Topbar crumbs={[{ label: 'Início' }]}>
        <BotaoNovaTarefa />
      </Topbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <header>
            <p className="rotulo">Tasks · Início</p>
            <h1 className="mt-1.5 font-serif text-3xl leading-tight font-normal tracking-[-0.01em] sm:text-4xl">
              {primeiroNome(colab.nome) ? `Olá, ${primeiroNome(colab.nome)}!` : 'Olá!'}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Suas tarefas, a agenda e o que o time mexeu por último.
            </p>
          </header>

          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-5">
              <MeuTrabalho minhas={minhas} delegadas={delegadas} />
              <Recentes tarefas={recentes} />
            </div>
            <div className="min-w-0 space-y-5">
              <Agenda tarefas={agenda} inicio={inicioAgenda} fim={fimAgenda} />
              <AtribuidasAMim minhas={minhas} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
