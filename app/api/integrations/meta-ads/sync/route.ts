import { NextResponse } from 'next/server'

import { safeCompare } from '@/lib/crypto'
import { isMetaAdsConfigured, syncMetaAdsSpend } from '@/lib/integrations/meta-ads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Sincronização do investimento em tráfego do Meta Ads.
 *
 *   GET  /api/integrations/meta-ads/sync        → job agendado (Vercel Cron)
 *   POST /api/integrations/meta-ads/sync        → disparo manual pelo admin
 *
 * Protegido por CRON_SECRET. O Vercel Cron envia
 * `Authorization: Bearer <CRON_SECRET>` automaticamente.
 */

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false

  const header = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (header && safeCompare(header, expected)) return true

  const query = new URL(request.url).searchParams.get('secret')
  return Boolean(query && safeCompare(query, expected))
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Não autorizado. Informe o CRON_SECRET.' },
      { status: 401 },
    )
  }

  if (!isMetaAdsConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Meta Ads não configurado. Defina META_ADS_ACCESS_TOKEN e META_ADS_ACCOUNT_ID.',
      },
      { status: 400 },
    )
  }

  const url = new URL(request.url)
  const result = await syncMetaAdsSpend({
    since: url.searchParams.get('since') ?? undefined,
    until: url.searchParams.get('until') ?? undefined,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
