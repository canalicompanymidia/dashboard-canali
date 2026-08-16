import { NextResponse } from 'next/server'

import { verifyHotmartAuth } from '@/lib/webhooks/auth'
import { normalizeHotmart } from '@/lib/webhooks/hotmart'
import { ingestTransaction, logWebhookEvent, readJsonBody } from '@/lib/webhooks/ingest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/hotmart
 *
 * Configure em: Hotmart > Ferramentas > Webhook > Novo webhook
 *   URL:    https://SEU-DOMINIO/api/webhooks/hotmart
 *   Versão: 2.0.0
 *   Copie o hottok gerado para a env HOTMART_HOTTOK.
 *
 * Sempre responde 200 quando a assinatura é válida, mesmo em erro interno:
 * a Hotmart desativa webhooks que acumulam falhas. O payload cru fica em
 * `webhook_events` para reprocessamento.
 */
export async function POST(request: Request) {
  const { raw, json } = await readJsonBody(request)
  const auth = verifyHotmartAuth(request)

  if (!auth.valid) {
    await logWebhookEvent({
      platform: 'hotmart',
      signatureValid: false,
      payload: json ?? { _raw: raw.slice(0, 2000) },
      errorMessage: auth.reason,
    })
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 })
  }

  if (!json) {
    await logWebhookEvent({
      platform: 'hotmart',
      signatureValid: true,
      payload: { _raw: raw.slice(0, 2000) },
      errorMessage: 'Corpo não é um JSON válido.',
    })
    return NextResponse.json({ ok: false, error: 'JSON inválido.' }, { status: 400 })
  }

  const transaction = normalizeHotmart(json)

  if (!transaction) {
    await logWebhookEvent({
      platform: 'hotmart',
      eventType: String(json.event ?? ''),
      signatureValid: true,
      payload: json,
      errorMessage: 'Payload sem identificador de transação.',
    })
    return NextResponse.json({ ok: true, ignored: true, reason: 'Sem ID de transação.' })
  }

  const result = await ingestTransaction(transaction)

  await logWebhookEvent({
    platform: 'hotmart',
    eventType: transaction.eventType,
    externalId: transaction.externalId,
    signatureValid: true,
    processed: result.ok,
    payload: json,
    errorMessage: result.ok ? null : result.message,
  })

  return NextResponse.json({
    ok: result.ok,
    ignored: result.ignored ?? false,
    message: result.message,
  })
}

/** GET só para conferir se a rota está no ar. */
export async function GET() {
  return NextResponse.json({
    endpoint: 'hotmart',
    status: 'online',
    configured: Boolean(process.env.HOTMART_HOTTOK),
    method: 'POST',
  })
}
