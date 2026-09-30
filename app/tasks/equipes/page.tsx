import { EquipesView } from '@/components/tasks/equipes'
import { Topbar } from '@/components/tasks/topbar'
import { requireColaborador } from '@/lib/auth'
import { getEquipes, getPessoas } from '@/lib/tasks/data'

export const dynamic = 'force-dynamic'

export default async function EquipesPage() {
  const colab = await requireColaborador()
  const [pessoas, equipes] = await Promise.all([getPessoas(), getEquipes()])

  return (
    <>
      <Topbar crumbs={[{ label: 'Equipes' }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EquipesView pessoas={pessoas} equipes={equipes} admin={colab.papel === 'admin'} />
      </div>
    </>
  )
}
