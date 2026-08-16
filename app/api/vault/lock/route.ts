import { NextResponse } from 'next/server'

import { lockVault } from '@/lib/vault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/vault/lock — encerra a sessão do cofre imediatamente. */
export async function POST() {
  await lockVault()
  return NextResponse.json({ ok: true, message: 'Cofre bloqueado.' })
}
