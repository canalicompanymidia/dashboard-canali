import 'server-only'

import { hmacSha256, safeCompare } from '@/lib/crypto'

/**
 * Autenticação dos webhooks.
 *
 * O endpoint é público na internet: sem validação, qualquer um poderia
 * inflar o faturamento do painel com um POST. Por isso a política é
 * FAIL-CLOSED — se o segredo não estiver configurado, o endpoint recusa
 * em vez de aceitar tudo.
 *
 * Dois modos, escolhidos por variável de ambiente:
 *   • Token compartilhado — a plataforma manda um header fixo.
 *   • Assinatura HMAC-SHA256 do corpo cru — mais forte, resiste a replay
 *     de payload alterado.
 */

export interface WebhookAuthResult {
  valid: boolean
  reason: string
}

const TOKEN_HEADERS = [
  'x-webhook-token',
  'x-api-key',
  'x-auth-token',
  'authorization',
  'token',
]

const SIGNATURE_HEADERS = [
  'x-signature',
  'x-hub-signature-256',
  'x-webhook-signature',
  'x-hmac-signature',
]

function readHeader(request: Request, names: string[]): string | null {
  for (const name of names) {
    const value = request.headers.get(name)
    if (value) return value.replace(/^(Bearer|sha256=)\s*/i, '').trim()
  }
  return null
}

/**
 * Valida um webhook genérico (OnProfit, TMB).
 * `secret` habilita HMAC; `token` habilita comparação direta.
 */
export function verifyWebhookAuth(
  request: Request,
  rawBody: string,
  options: { secret?: string; token?: string; platform: string },
): WebhookAuthResult {
  const { secret, token, platform } = options

  if (!secret && !token) {
    return {
      valid: false,
      reason:
        `Webhook da ${platform} sem segredo configurado. ` +
        `Defina ${platform.toUpperCase()}_WEBHOOK_TOKEN ou ${platform.toUpperCase()}_WEBHOOK_SECRET.`,
    }
  }

  if (token) {
    const provided = readHeader(request, TOKEN_HEADERS)
    if (provided && safeCompare(provided, token)) {
      return { valid: true, reason: 'Token válido.' }
    }
  }

  if (secret) {
    const provided = readHeader(request, SIGNATURE_HEADERS)
    if (provided && safeCompare(provided.toLowerCase(), hmacSha256(rawBody, secret).toLowerCase())) {
      return { valid: true, reason: 'Assinatura HMAC válida.' }
    }
  }

  return { valid: false, reason: 'Token ou assinatura inválidos.' }
}

/**
 * Validação do Hotmart: header `X-HOTMART-HOTTOK` comparado ao hottok
 * gerado no painel de webhooks da plataforma.
 */
export function verifyHotmartAuth(request: Request): WebhookAuthResult {
  const expected = process.env.HOTMART_HOTTOK

  if (!expected) {
    return {
      valid: false,
      reason: 'HOTMART_HOTTOK não configurado — webhook recusado por segurança.',
    }
  }

  const provided =
    request.headers.get('x-hotmart-hottok') ??
    request.headers.get('hottok') ??
    new URL(request.url).searchParams.get('hottok')

  if (provided && safeCompare(provided.trim(), expected.trim())) {
    return { valid: true, reason: 'Hottok válido.' }
  }

  return { valid: false, reason: 'Hottok inválido ou ausente.' }
}
