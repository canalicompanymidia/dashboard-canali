import { NextResponse } from 'next/server'

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
  const [perfis, configurado] = await Promise.all([listVaultProfilesPublic(), isVaultConfigured()])

  return NextResponse.json(
    { ok: true, perfis, configurado },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
