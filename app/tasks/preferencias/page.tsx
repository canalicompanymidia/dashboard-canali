import { PreferenciasView } from '@/components/tasks/preferencias'
import { Topbar } from '@/components/tasks/topbar'
import { requireColaborador } from '@/lib/auth'
import { getEquipes, getPessoas } from '@/lib/tasks/data'

export const dynamic = 'force-dynamic'

export default async function PreferenciasPage() {
  const colab = await requireColaborador()
  const [pessoas, equipes] = await Promise.all([getPessoas(), getEquipes()])
  const eu = pessoas.find((p) => p.email === colab.email) ?? { ...colab, avatar_url: null, cargo: null, gestor_email: null }
  const minhasEquipes = equipes.filter((e) => e.membros.includes(colab.email) || e.lider_email === colab.email)
  const gestor = eu.gestor_email ? pessoas.find((p) => p.email === eu.gestor_email) : null
  const gestorNome = gestor ? gestor.nome || gestor.email : null

  return (
    <>
      <Topbar crumbs={[{ label: 'Preferências' }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <header>
            <p className="rotulo">Tasks · Preferências</p>
            <h1 className="mt-1.5 font-serif text-3xl leading-tight font-normal tracking-[-0.01em]">Seu perfil e integrações</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Configurações só suas: valem para {colab.email} e não mudam nada para o resto do time.
            </p>
          </header>
          <PreferenciasView pessoa={eu} equipes={minhasEquipes} gestorNome={gestorNome} />
        </div>
      </div>
    </>
  )
}
