import { NextResponse } from 'next/server'

import { getVaultCredentials, unlockVault } from '@/lib/vault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/vault/unlock  { password: string }
 *
 * Valida a Senha Mestre e devolve as credenciais na mesma resposta —
 * uma ida ao servidor em vez de duas, e a senha mestre nunca é reenviada.
 */
export async function POST(request: Request) {
  let password = ''

  try {
    const body = (await request.json()) as { password?: unknown }
    password = typeof body.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ ok: false, error: 'Corpo inválido.' }, { status: 400 })
  }

  if (!password) {
    return NextResponse.json({ ok: false, error: 'Informe a Senha Mestre.' }, { status: 400 })
  }

  const result = await unlockVault(password)

  if (!result.ok) {
    // 401 para senha errada; a mensagem detalhada cobre erro de configuração.
    return NextResponse.json({ ok: false, error: result.message }, { status: 401 })
  }

  const credentials = await getVaultCredentials()

  return NextResponse.json({
    ok: true,
    message: result.message,
    credentials: credentials ?? [],
  })
}
