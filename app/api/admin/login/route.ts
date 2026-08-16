import { NextResponse } from 'next/server'

import { ADMIN_COOKIE, checkAdminPassword, issueAdminSession } from '@/lib/admin/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/admin/login { password } — emite a sessão do painel admin. */
export async function POST(request: Request) {
  const secret = process.env.ADMIN_PASSWORD

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'O painel administrativo está aberto — não há senha configurada.' },
      { status: 400 },
    )
  }

  let password = ''
  try {
    const body = (await request.json()) as { password?: unknown }
    password = typeof body.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ ok: false, error: 'Corpo inválido.' }, { status: 400 })
  }

  if (!checkAdminPassword(password, secret)) {
    return NextResponse.json({ ok: false, error: 'Senha incorreta.' }, { status: 401 })
  }

  const session = await issueAdminSession(secret)
  const response = NextResponse.json({ ok: true })

  response.cookies.set(ADMIN_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // 'lax' para o cookie sobreviver ao redirect após o login
    path: '/',
    maxAge: session.maxAge,
  })

  return response
}
