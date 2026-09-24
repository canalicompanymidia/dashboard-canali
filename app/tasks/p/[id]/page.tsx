import { notFound } from 'next/navigation'
import { FolderOpen } from 'lucide-react'

import { PastaAcoes } from '@/components/tasks/estrutura-acoes'
import { TabelaDeListas } from '@/components/tasks/tabela-listas'
import { Topbar } from '@/components/tasks/topbar'
import { requireColaborador } from '@/lib/auth'
import { getPasta, getPessoas } from '@/lib/tasks/data'

export const dynamic = 'force-dynamic'

export default async function PastaPage({ params }: { params: Promise<{ id: string }> }) {
  const colab = await requireColaborador()
  const { id } = await params
  const resultado = await getPasta(id, colab)
  if (!resultado) notFound()

  const { pasta, espaco } = resultado
  const pessoas = await getPessoas()
  const nomes = Object.fromEntries(pessoas.map((p) => [p.email, p.nome || p.email]))
  const total = pasta.listas.reduce((n, l) => n + l.tarefas_total, 0)
  const feitas = pasta.listas.reduce((n, l) => n + l.tarefas_concluidas, 0)

  return (
    <>
      <Topbar
        crumbs={[
          { label: espaco.nome, href: `/tasks/e/${espaco.id}`, tipo: 'espaco', cor: espaco.cor, privado: espaco.privado },
          { label: pasta.nome, tipo: 'pasta' },
        ]}
      >
        <PastaAcoes pasta={pasta} espaco={espaco} />
      </Topbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
          <header className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-warning/15">
              <FolderOpen className="size-5 text-warning-foreground dark:text-warning" />
            </span>
            <div>
              <h1 className="font-serif text-3xl leading-tight">{pasta.nome}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {pasta.listas.length} lista(s) · {feitas}/{total} tarefas concluídas
              </p>
            </div>
          </header>

          <section>
            <h2 className="rotulo mb-2">Listas</h2>
            <TabelaDeListas nomes={nomes} grupos={[{ listas: pasta.listas }]} />
          </section>
        </div>
      </div>
    </>
  )
}
