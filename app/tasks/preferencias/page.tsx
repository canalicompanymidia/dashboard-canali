import { PreferenciasView } from '@/components/tasks/preferencias'
import { Topbar } from '@/components/tasks/topbar'
import { requireColaborador } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function PreferenciasPage() {
  const colab = await requireColaborador()

  return (
    <>
      <Topbar crumbs={[{ label: 'Preferências' }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <header>
            <p className="rotulo">Tasks · Preferências</p>
            <h1 className="mt-1.5 font-serif text-3xl leading-tight font-normal tracking-[-0.01em]">Suas integrações</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Configurações só suas: valem para {colab.email} e não mudam nada para o resto do time.
            </p>
          </header>
          <PreferenciasView />
        </div>
      </div>
    </>
  )
}
