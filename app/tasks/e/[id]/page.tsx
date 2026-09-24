import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'

import { EspacoAcoes } from '@/components/tasks/estrutura-acoes'
import { Avatares, MarcaEspaco } from '@/components/tasks/pecas'
import { TabelaDeListas } from '@/components/tasks/tabela-listas'
import { TaskRow } from '@/components/tasks/task-row'
import { Topbar } from '@/components/tasks/topbar'
import { requireColaborador } from '@/lib/auth'
import { getEspaco, getPessoas, getTarefasDoEspaco } from '@/lib/tasks/data'

export const dynamic = 'force-dynamic'

export default async function EspacoPage({ params }: { params: Promise<{ id: string }> }) {
  const colab = await requireColaborador()
  const { id } = await params
  const espaco = await getEspaco(id, colab)
  if (!espaco) notFound()

  const [tarefas, pessoas] = await Promise.all([getTarefasDoEspaco(espaco.id), getPessoas()])
  const nomes = Object.fromEntries(pessoas.map((p) => [p.email, p.nome || p.email]))
  const totalListas = espaco.listas.length + espaco.pastas.reduce((n, p) => n + p.listas.length, 0)

  return (
    <>
      <Topbar crumbs={[{ label: espaco.nome, tipo: 'espaco', cor: espaco.cor, privado: espaco.privado }]}>
        <EspacoAcoes espaco={espaco} />
      </Topbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
          <header className="flex flex-wrap items-center gap-4">
            <MarcaEspaco nome={espaco.nome} cor={espaco.cor} tamanho="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 font-serif text-3xl leading-tight">
                {espaco.nome}
                {espaco.privado ? <Lock className="size-4 text-muted-foreground" aria-label="Espaço privado" /> : null}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {espaco.pastas.length} pasta(s) · {totalListas} lista(s)
                {espaco.privado ? ' · privado: só administradores e membros' : ''}
              </p>
            </div>
            {espaco.privado && espaco.membros.length > 0 ? <Avatares emails={espaco.membros} max={6} tamanho="md" /> : null}
          </header>

          <section>
            <h2 className="rotulo mb-2">Listas</h2>
            <TabelaDeListas
              nomes={nomes}
              grupos={[
                ...espaco.pastas.map((p) => ({ titulo: p.nome, href: `/tasks/p/${p.id}`, listas: p.listas })),
                ...(espaco.listas.length > 0 || espaco.pastas.length === 0
                  ? [{ titulo: espaco.pastas.length > 0 ? 'Fora de pastas' : undefined, listas: espaco.listas }]
                  : []),
              ]}
            />
          </section>

          <section>
            <h2 className="rotulo mb-2">Em aberto, por último movimento</h2>
            {tarefas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma tarefa em aberto neste espaço.
              </p>
            ) : (
              <ul className="rounded-xl border border-border bg-card p-1.5">
                {tarefas.map((t) => (
                  <li key={t.id}>
                    <TaskRow tarefa={t} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
