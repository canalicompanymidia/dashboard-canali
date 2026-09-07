import { NextResponse } from 'next/server'

import { buscarColaborador, marcarAcesso } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Destino do link mágico.
 *
 * Troca o código de uso único por uma sessão em cookie e confere, de
 * novo, se o e-mail continua autorizado — a lista pode ter mudado entre
 * o envio do link e o clique.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const destinoBruto = url.searchParams.get('destino') ?? '/'

  // Só caminho relativo: um `destino` absoluto viraria redirecionamento
  // aberto, e o link sai por e-mail — é exatamente o formato que um
  // phishing usaria para levar a pessoa para fora com cara de link nosso.
  const destino =
    destinoBruto.startsWith('/') && !destinoBruto.startsWith('//') ? destinoBruto : '/'

  if (!code) {
    return NextResponse.redirect(new URL('/login?erro=link', url.origin))
  }

  const supabase = await getSupabaseServerClient()
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?erro=config', url.origin))
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user?.email) {
    return NextResponse.redirect(new URL('/login?erro=expirado', url.origin))
  }

  const email = data.user.email.toLowerCase()
  const colaborador = await buscarColaborador(email)

  if (!colaborador) {
    // Autenticou, mas saiu da lista (ou nunca esteve). Encerra a sessão
    // em vez de deixar um logado sem permissão circulando.
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/sem-acesso', url.origin))
  }

  await marcarAcesso(email)

  return NextResponse.redirect(new URL(destino, url.origin))
}
