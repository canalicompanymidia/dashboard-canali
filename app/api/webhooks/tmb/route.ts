import { createGenericWebhookHandler } from '@/lib/webhooks/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/tmb
 *
 * Autenticação (defina ao menos uma):
 *   TMB_WEBHOOK_TOKEN  — header x-webhook-token / Authorization
 *   TMB_WEBHOOK_SECRET — HMAC-SHA256 do corpo cru em x-signature
 */
export const { POST, GET } = createGenericWebhookHandler('tmb', 'TMB')
