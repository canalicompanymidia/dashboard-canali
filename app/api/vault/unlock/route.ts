import { NextResponse } from 'next/server'

import { getVaultConteudo, unlockVault, unlockVaultWithPin } from '@/lib/vault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/vault/unlock
 *
 * Dois modos:
 *   { modo: 'master', senha: string }
 *   { modo: 'perfil', perfilId: string, pin: string }
 *
 * Em ambos, as credenciais já visíveis para o escopo voltam na mesma
 * resposta — uma ida ao servidor em vez de duas.
 */
export async function POST(request: Request) {
  let corpo: Record<string, unknown>

  try {
    corpo = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'Corpo inválido.' }, { status: 400 })
  }

  const modo = String(corpo.modo ?? 'master')
  let resultado: { ok: boolean; message: string }

  if (modo === 'perfil') {
    const perfilId = typeof corpo.perfilId === 'string' ? corpo.perfilId : ''
    const pin = typeof corpo.pin === 'string' ? corpo.pin : ''

    if (!perfilId) {
      return NextResponse.json({ ok: false, error: 'Selecione seu nome.' }, { status: 400 })
    }
    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ ok: false, error: 'O PIN tem 4 dígitos.' }, { status: 400 })
    }

    resultado = await unlockVaultWithPin(perfilId, pin)
  } else {
    // `password` continua aceito para não quebrar chamadas antigas.
    const senha =
      typeof corpo.senha === 'string'
        ? corpo.senha
        : typeof corpo.password === 'string'
          ? corpo.password
          : ''

    if (!senha) {
      return NextResponse.json({ ok: false, error: 'Informe a Senha Mestre.' }, { status: 400 })
    }

    resultado = await unlockVault(senha)
  }

  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: resultado.message }, { status: 401 })
  }

  const conteudo = await getVaultConteudo()

  return NextResponse.json({
    ok: true,
    message: resultado.message,
    acesso: conteudo?.acesso ?? null,
    credenciais: conteudo?.credenciais ?? [],
    subcategorias: conteudo?.subcategorias ?? [],
    ocultas: conteudo?.ocultas ?? 0,
  })
}
