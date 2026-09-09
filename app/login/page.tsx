import { redirect } from 'next/navigation'
import { AlertTriangle, ShieldCheck } from 'lucide-react'

import { CanaliLogo } from '@/components/layout/canali-logo'
import { LoginForm } from '@/components/auth/login-form'
import { RecuperarSessao } from '@/components/auth/recuperar-sessao'
import { getColaborador } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ERROS: Record<string, string> = {
  link: 'O link estava incompleto. Use "Esqueci minha senha" para receber outro.',
  expirado: 'Este link já foi usado ou expirou. Use "Esqueci minha senha" para receber outro.',
  config: 'O servidor está sem as credenciais do Supabase. Avise o responsável técnico.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; erro?: string; recuperar?: string }>
}) {
  const { destino, erro, recuperar } = await searchParams

  // Já logado e autorizado: não faz sentido mostrar a tela de login.
  if (await getColaborador()) redirect(destino?.startsWith('/') ? destino : '/')

  return (
    <div className="hero-surface flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <CanaliLogo className="h-9 w-auto text-foreground" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Hub Canali Company</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Área interna. Cada pessoa tem o próprio login.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          {recuperar ? (
            <RecuperarSessao destino={destino?.startsWith('/') ? destino : '/'} />
          ) : null}

          {erro && ERROS[erro] ? (
            <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {ERROS[erro]}
            </p>
          ) : null}

          <LoginForm destino={destino} />
        </div>

        <p className="mt-4 flex items-start justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          Os dados deste painel são confidenciais da Canali Company.
        </p>
      </div>
    </div>
  )
}
