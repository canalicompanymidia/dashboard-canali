import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

import { buscarColaborador, marcarAcesso } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Tipos de link de e-mail que levam a pessoa para dentro do Hub. */
const TIPOS: EmailOtpType[] = ['invite', 'recovery', 'magiclink', 'signup', 'email']

/**
 * Destino dos links enviados por e-mail (convite e redefinição de senha).
 *
 * Precisa aceitar DUAS formas, porque o Supabase usa uma ou outra
 * dependendo de quem iniciou o fluxo:
 *
 *   ?token_hash=&type=  — o link vem do template de e-mail. Funciona
 *     sempre, inclusive para convites disparados pelo admin, e é a forma
 *     recomendada para aplicações que resolvem a sessão no servidor.
 *
 *   ?code=  — fluxo PKCE. Só funciona quando o pedido nasceu no MESMO
 *     navegador que vai clicar no link (o "esqueci minha senha"). Num
 *     convite isso nunca acontece: quem pede é o admin, quem clica é
 *     outra pessoa.
 *
 * Sem os dois, a sessão volta no fragmento da URL (#access_token=...),
 * que o navegador não envia ao servidor. Nesse caso mandamos para a tela
 * de entrada, que sabe recuperar a sessão pelo fragmento.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const tipoBruto = url.searchParams.get('type') ?? ''
  const destinoBruto = url.searchParams.get('destino') ?? '/'

  // Só caminho relativo: um `destino` absoluto viraria redirecionamento
  // aberto, e o link sai por e-mail — é exatamente o formato que um
  // phishing usaria para levar a pessoa para fora com cara de link nosso.
  const destino =
    destinoBruto.startsWith('/') && !destinoBruto.startsWith('//') ? destinoBruto : '/'

  const supabase = await getSupabaseServerClient()
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?erro=config', url.origin))
  }

  let email: string | null = null

  if (tokenHash && TIPOS.includes(tipoBruto as EmailOtpType)) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: tipoBruto as EmailOtpType,
    })
    if (error || !data.user?.email) {
      return NextResponse.redirect(new URL('/login?erro=expirado', url.origin))
    }
    email = data.user.email
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.user?.email) {
      return NextResponse.redirect(new URL('/login?erro=expirado', url.origin))
    }
    email = data.user.email
  } else {
    // Nem token_hash nem code: a sessão provavelmente veio no fragmento.
    // O fragmento sobrevive ao redirecionamento, então a tela de entrada
    // consegue recuperá-lo no navegador.
    return NextResponse.redirect(
      new URL(`/login?recuperar=1&destino=${encodeURIComponent(destino)}`, url.origin),
    )
  }

  const normalizado = email.toLowerCase()
  const colaborador = await buscarColaborador(normalizado)

  if (!colaborador) {
    // Autenticou, mas saiu da lista (ou nunca esteve). Encerra a sessão
    // em vez de deixar um logado sem permissão circulando.
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/sem-acesso', url.origin))
  }

  await marcarAcesso(normalizado)

  return NextResponse.redirect(new URL(destino, url.origin))
}
