import { ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

/** Logou, provou o e-mail, e mesmo assim não tem permissão. */
export default async function SemAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>
}) {
  const { motivo } = await searchParams
  const ehAdmin = motivo === 'admin'

  return (
    <div className="hero-surface flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-warning/15">
          <ShieldAlert className="size-5 text-warning-foreground dark:text-warning" />
        </span>

        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          {ehAdmin ? 'Área restrita a administradores' : 'Acesso ainda não liberado'}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {ehAdmin
            ? 'Seu acesso ao Hub está ativo, mas o painel administrativo é limitado a quem tem papel de administrador.'
            : 'Seu e-mail foi confirmado, mas ainda não consta na lista de colaboradores autorizados. Peça a um administrador da Canali para liberar seu acesso.'}
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {ehAdmin ? (
            <Button asChild variant="outline">
              <a href="/">Voltar ao Hub</a>
            </Button>
          ) : null}

          <form action="/auth/sair" method="post">
            <Button type="submit" variant={ehAdmin ? 'ghost' : 'outline'} className="w-full">
              Sair e usar outro e-mail
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
