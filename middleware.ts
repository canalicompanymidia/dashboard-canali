import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Porta de entrada do Hub.
 *
 * Sem sessão do Supabase, nenhuma página abre. Esta camada é de
 * EXPERIÊNCIA — manda para o login em vez de mostrar tela vazia. A
 * autorização de verdade está em dois lugares que não dependem daqui:
 * `requireColaborador()` nas páginas e o RLS no banco. Se o middleware
 * falhasse por completo, as consultas ainda voltariam vazias.
 *
 * Também renova o cookie de sessão a cada navegação, que é o que mantém
 * o time logado sem precisar pedir o link por e-mail toda hora.
 */

/** Rotas que não podem exigir sessão, e por quê. */
const PUBLICAS = [
  '/login', //         a própria tela de login
  '/auth', //          callback do link mágico e logout
  '/sem-acesso', //    explica a quem logou mas não está na lista
  '/landing', //       página de vendas pública — não é área interna
  // Webhooks e o job agendado se autenticam por SEGREDO no header, não
  // por sessão de navegador. Exigir login aqui quebraria a entrada de
  // vendas da Hotmart e a sincronização do Meta Ads.
  '/api/webhooks',
  '/api/integrations',
]

function ehPublica(pathname: string): boolean {
  return PUBLICAS.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (ehPublica(pathname)) return NextResponse.next()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Sem credenciais não há como autenticar ninguém. Fecha, não abre:
  // uma variável de ambiente perdida não pode virar Hub aberto na
  // internet. A tela de login explica o que falta.
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL('/login?erro=config', request.url))
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // getUser() valida o token no servidor de auth. Trocar por getSession()
  // aqui aceitaria um cookie forjado.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const login = request.nextUrl.clone()
    login.pathname = '/login'
    login.search = ''
    // Guarda o destino para devolver a pessoa onde ela queria chegar.
    if (pathname !== '/') login.searchParams.set('destino', pathname)
    return NextResponse.redirect(login)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Tudo, menos o que o navegador busca sozinho e a landing estática.
     * Sem esta exclusão o CSS e as fontes também seriam redirecionados
     * para o login, e a tela de login apareceria sem estilo.
     */
    '/((?!_next/static|_next/image|favicon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|html|txt|xml|webmanifest)$).*)',
  ],
}
