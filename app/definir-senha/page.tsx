import { CanaliLogo } from '@/components/layout/canali-logo'
import { DefinirSenhaForm } from '@/components/auth/definir-senha-form'
import { requireColaborador } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Destino do link de convite e do link de redefinição.
 *
 * Chegar aqui exige a sessão criada pelo link — o middleware manda para
 * /login quem não tiver, e requireColaborador() confere que a pessoa
 * continua autorizada.
 */
export default async function DefinirSenhaPage() {
  const colaborador = await requireColaborador()

  return (
    <div className="hero-surface flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <CanaliLogo className="h-9 w-auto text-foreground" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Crie sua senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ela é sua e individual. Não compartilhe com ninguém do time.
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{colaborador.email}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <DefinirSenhaForm />
        </div>
      </div>
    </div>
  )
}
