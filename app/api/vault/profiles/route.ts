import { NextResponse } from 'next/server'

import { getColaborador } from '@/lib/auth'
import { isVaultConfigured, listVaultProfilesPublic } from '@/lib/vault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/vault/profiles
 *
 * Alimenta o seletor "Selecione seu nome" do modal do cofre.
 * Devolve apenas id e nome: hash de PIN e permissões nunca saem do servidor.
 */
export async function GET() {
  // A lista de nomes do time é dado de pessoal, não conteúdo público:
  // sem sessão, era reconhecimento de graça para engenharia social e
  // entregava os IDs necessários para tentar PIN.
  if (!(await getColaborador())) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 })
  }

  const [perfis, configurado] = await Promise.all([listVaultProfilesPublic(), isVaultConfigured()])

  return NextResponse.json(
    { ok: true, perfis, configurado },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
