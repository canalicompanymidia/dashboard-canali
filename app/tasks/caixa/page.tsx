import { CaixaView } from '@/components/tasks/caixa'
import { Topbar } from '@/components/tasks/topbar'
import { requireColaborador } from '@/lib/auth'
import { getCaixa, getMinhasTarefas } from '@/lib/tasks/data'
import { hojeISO } from '@/lib/tasks/datas'
import { statusEncerra } from '@/lib/tasks/types'

export const dynamic = 'force-dynamic'

export default async function CaixaPage() {
  const colab = await requireColaborador()
  const [{ avisos, tarefas }, minhas] = await Promise.all([getCaixa(colab), getMinhasTarefas(colab)])
  const hoje = hojeISO()
  const urgentes = minhas.filter((t) => !statusEncerra(t.status_tipo) && t.data_vencimento && t.data_vencimento <= hoje)

  return (
    <>
      <Topbar crumbs={[{ label: 'Caixa de entrada' }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CaixaView avisos={avisos} tarefas={tarefas} urgentes={urgentes} agora={new Date().toISOString()} />
      </div>
    </>
  )
}
