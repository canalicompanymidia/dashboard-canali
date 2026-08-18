import { NextResponse } from 'next/server'

import { getVaultConteudo } from '@/lib/vault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/vault/credentials
 *
 * Só responde com sessão válida, e devolve apenas o que aquele escopo pode
 * ver — a filtragem é do servidor, não da interface.
 */
export async function GET() {
  const conteudo = await getVaultConteudo()

  if (!conteudo) {
    return NextResponse.json(
      { ok: false, error: 'Sessão do cofre expirada. Autentique-se novamente.' },
      { status: 401 },
    )
  }

  return NextResponse.json({
    ok: true,
    acesso: conteudo.acesso,
    credenciais: conteudo.credenciais,
    subcategorias: conteudo.subcategorias,
    ocultas: conteudo.ocultas,
  })
}
