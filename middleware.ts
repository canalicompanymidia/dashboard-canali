import { NextResponse, type NextRequest } from 'next/server'

import { ADMIN_COOKIE, verifyAdminSession } from '@/lib/admin/auth'

/**
 * Gate opcional do painel administrativo.
 *
 * Sem ADMIN_PASSWORD, o middleware deixa passar — o painel segue público
 * para o time, como especificado. Com a variável definida, /admin exige
 * login.
 */
export async function middleware(request: NextRequest) {
  const secret = process.env.ADMIN_PASSWORD
  if (!secret) return NextResponse.next()

  const { pathname } = request.nextUrl

  // A própria tela de login não pode exigir login.
  if (pathname === '/admin/login') return NextResponse.next()

  const token = request.cookies.get(ADMIN_COOKIE)?.value
  if (await verifyAdminSession(token, secret)) return NextResponse.next()

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/admin/login'
  loginUrl.search = ''
  loginUrl.searchParams.set('from', pathname)

  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/admin/:path*'],
}
