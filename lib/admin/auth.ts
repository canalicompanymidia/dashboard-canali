/**
 * Proteção OPCIONAL do painel administrativo.
 *
 * A especificação define o painel como público para o time, e é assim que
 * ele funciona por padrão. Só que /admin grava no banco — deixar essa
 * superfície aberta na internet significa que qualquer pessoa com a URL
 * pode alterar metas, ações e documentos.
 *
 * Meio-termo: definindo ADMIN_PASSWORD, o /admin passa a pedir senha.
 * Sem a variável, nada muda em relação ao especificado.
 *
 * Usa Web Crypto (não node:crypto) porque o middleware roda no Edge.
 */

export const ADMIN_COOKIE = 'canali_admin_session'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 horas — uma jornada de trabalho

const encoder = new TextEncoder()

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
}

/** Comparação em tempo constante — não vaza o prefixo correto pelo tempo. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** true quando o gate está ligado (ADMIN_PASSWORD definida). */
export function isAdminGateEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD)
}

export async function issueAdminSession(secret: string): Promise<{
  token: string
  maxAge: number
}> {
  const expiresAt = Date.now() + SESSION_TTL_MS
  const payload = String(expiresAt)
  return {
    token: `${payload}.${await sign(payload, secret)}`,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  }
}

export async function verifyAdminSession(
  token: string | undefined | null,
  secret: string,
): Promise<boolean> {
  if (!token) return false

  const separator = token.lastIndexOf('.')
  if (separator < 1) return false

  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  if (!safeEqual(signature, await sign(payload, secret))) return false
  return Number(payload) > Date.now()
}

/** Valida a senha informada no login, em tempo constante. */
export function checkAdminPassword(input: string, expected: string): boolean {
  return safeEqual(input, expected)
}
