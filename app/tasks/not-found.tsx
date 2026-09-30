import Link from 'next/link'
import { SearchX } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'

/** Lista, pasta, espaço ou tarefa que não existe mais (ou que a pessoa não pode ver). */
export default function TasksNaoEncontrado() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <SearchX className="mx-auto size-8 text-muted-foreground/60" />
        <h1 className="mt-3 font-serif text-2xl">Isto não existe mais</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A lista, pasta, espaço ou tarefa que você tentou abrir foi excluída, ou você não tem acesso a ela.
        </p>
        <Link href="/tasks" className={buttonVariants({ variant: 'outline', className: 'mt-5' })}>
          Voltar ao Início do Tasks
        </Link>
      </div>
    </div>
  )
}
