import { NextResponse } from 'next/server'

import { getVaultCredentials } from '@/lib/vault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/vault/credentials
 *
 * Só responde com sessão de cofre válida (cookie httpOnly emitido no
 * unlock). Sem sessão → 401, sem vazar nada.
 */
export async function GET() {
  const credentials = await getVaultCredentials()

  if (credentials === null) {
    return NextResponse.json(
      { ok: false, error: 'Sessão do cofre expirada. Informe a Senha Mestre novamente.' },
      { status: 401 },
    )
  }

  return NextResponse.json({ ok: true, credentials })
}
