import 'server-only'

import { NextResponse } from 'next/server'

import type { PlatformSource } from '@/lib/types'
import { verifyWebhookAuth } from './auth'
import { normalizeGeneric } from './generic'
import { ingestTransaction, logWebhookEvent, readJsonBody } from './ingest'

/**
 * Fábrica de handlers para plataformas com payload configurável
 * (OnProfit e TMB). Hotmart tem rota própria porque o contrato dela é
 * fixo e documentado.
 */
export function createGenericWebhookHandler(platform: PlatformSource, displayName: string) {
  const envPrefix = platform.toUpperCase()

  async function POST(request: Request) {
    const { raw, json } = await readJsonBody(request)

    const auth = verifyWebhookAuth(request, raw, {
      platform,
      token: process.env[`${envPrefix}_WEBHOOK_TOKEN`],
      secret: process.env[`${envPrefix}_WEBHOOK_SECRET`],
    })

    if (!auth.valid) {
      await logWebhookEvent({
        platform,
        signatureValid: false,
        payload: json ?? { _raw: raw.slice(0, 2000) },
        errorMessage: auth.reason,
      })
      return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 })
    }

    if (!json) {
      await logWebhookEvent({
        platform,
        signatureValid: true,
        payload: { _raw: raw.slice(0, 2000) },
        errorMessage: 'Corpo não é um JSON válido.',
      })
      return NextResponse.json({ ok: false, error: 'JSON inválido.' }, { status: 400 })
    }

    const transaction = normalizeGeneric(platform, json)

    // Sem ID não há idempotência possível. Guardamos o evento cru para que
    // o time consiga mapear os campos reais e ajustar PLATFORM_FIELD_MAPS.
    if (!transaction) {
      await logWebhookEvent({
        platform,
        signatureValid: true,
        payload: json,
        errorMessage:
          'Nenhum identificador de transação reconhecido. ' +
          'Ajuste PLATFORM_FIELD_MAPS em lib/webhooks/generic.ts com base neste payload.',
      })
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: 'Identificador de transação não reconhecido — payload salvo para mapeamento.',
      })
    }

    const result = await ingestTransaction(transaction)

    await logWebhookEvent({
      platform,
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

  async function GET() {
    return NextResponse.json({
      endpoint: platform,
      name: displayName,
      status: 'online',
      configured: Boolean(
        process.env[`${envPrefix}_WEBHOOK_TOKEN`] || process.env[`${envPrefix}_WEBHOOK_SECRET`],
      ),
      method: 'POST',
    })
  }

  return { POST, GET }
}
