import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Database } from 'lucide-react'

import { AtualizarAoVoltar } from '@/components/tasks/atualizar-ao-voltar'
import { PresencaProvider } from '@/components/tasks/presenca'
import { TasksProvider } from '@/components/tasks/provider'
import { TasksSidebar } from '@/components/tasks/sidebar'
import { TaskOverlay } from '@/components/tasks/task-overlay'
import { requireColaborador } from '@/lib/auth'
import { isServiceRoleConfigured } from '@/lib/supabase/config'
import { getArvore, getFavoritos, getPessoas, tasksDisponivel } from '@/lib/tasks/data'
import type { Pessoa } from '@/lib/tasks/types'

export const metadata: Metadata = {
  title: 'Tasks',
}

// Tarefas mudam o tempo todo: nada aqui pode ficar em cache.
export const dynamic = 'force-dynamic'

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  // Barreira do módulo: cobre todas as subrotas de /tasks de uma vez.
  const colab = await requireColaborador()

  if (!(await tasksDisponivel())) {
    return <TasksIndisponivel configurado={isServiceRoleConfigured()} />
  }

  const [arvore, pessoas, favoritos] = await Promise.all([getArvore(colab), getPessoas(), getFavoritos(colab.email)])
  // Quem está logado, com o perfil (foto, cargo) — o mesmo registro da lista de pessoas.
  const eu: Pessoa = pessoas.find((p) => p.email === colab.email) ?? { ...colab, avatar_url: null, cargo: null, gestor_email: null }

  return (
    <TasksProvider colab={eu} pessoas={pessoas} arvore={arvore} favoritos={favoritos}>
      <PresencaProvider email={colab.email}>
        {/* Altura fixa = viewport menos o cabeçalho: cada área rola por conta
            própria, como um aplicativo, e não a página inteira. */}
        <div className="flex h-[calc(100dvh-4rem)] overflow-hidden">
          <TasksSidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
        </div>
        <Suspense fallback={null}>
          <TaskOverlay />
        </Suspense>
        <AtualizarAoVoltar />
      </PresencaProvider>
    </TasksProvider>
  )
}

function TasksIndisponivel({ configurado }: { configurado: boolean }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <Database className="mx-auto size-8 text-muted-foreground/60" />
        <h1 className="mt-3 font-serif text-2xl">Tasks ainda não está ativo</h1>
        {configurado ? (
          <p className="mt-2 text-sm text-muted-foreground">
            As tabelas do módulo não existem neste banco. Rode o arquivo{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">supabase/migrations/0006_tasks.sql</code>{' '}
            no SQL Editor do Supabase e recarregue esta página.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            O Hub precisa de <code className="rounded bg-muted px-1 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
            configurada para ler e gravar tarefas.
          </p>
        )}
      </div>
    </div>
  )
}
