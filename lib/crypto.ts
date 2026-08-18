import 'server-only'

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Criptografia do Cofre de Senhas.
 *
 * Duas responsabilidades separadas de propósito:
 *  1. SENHA MESTRE — guardada como hash scrypt. Nunca é reversível.
 *  2. CREDENCIAIS  — cifradas com AES-256-GCM. A chave vive em variável de
 *     ambiente, FORA do banco, então um dump do Postgres não expõe senha
 *     nenhuma.
 *
 * Estes módulos exigem runtime Node (não Edge) — as rotas que os usam
 * declaram `export const runtime = 'nodejs'`.
 */

const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64
const SCRYPT_MAXMEM = 64 * 1024 * 1024

// ---------------------------------------------------------------------------
//  Chave de criptografia
// ---------------------------------------------------------------------------

/**
 * Deriva a chave AES de 32 bytes a partir de VAULT_ENCRYPTION_KEY.
 * Aceita base64 ou hex de 32 bytes; qualquer outro formato é derivado por
 * scrypt para garantir o tamanho correto.
 */
function getEncryptionKey(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY

  if (!raw) {
    throw new Error(
      'VAULT_ENCRYPTION_KEY não configurada. Gere uma com: npm run vault:keygen',
    )
  }

  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')

  const asBase64 = Buffer.from(raw, 'base64')
  if (asBase64.length === 32) return asBase64

  // Fallback: qualquer passphrase vira 32 bytes de forma determinística.
  return scryptSync(raw, 'canali-hub-vault-salt', 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })
}

export function isVaultEncryptionConfigured(): boolean {
  return Boolean(process.env.VAULT_ENCRYPTION_KEY)
}

// ---------------------------------------------------------------------------
//  AES-256-GCM — credenciais do cofre
// ---------------------------------------------------------------------------

/** Cifra um segredo. Formato de saída: base64(iv):base64(authTag):base64(ciphertext). */
export function encryptSecret(plainText: string): string {
  if (!plainText) return ''

  const key = getEncryptionKey()
  const iv = randomBytes(12) // 96 bits — tamanho recomendado para GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':')
}

/**
 * Decifra um segredo. Retorna null se o payload estiver corrompido ou se a
 * chave tiver mudado — o cofre mostra "erro ao decifrar" em vez de quebrar
 * a página inteira.
 */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null

  try {
    const [ivB64, tagB64, dataB64] = payload.split(':')
    if (!ivB64 || !tagB64 || !dataB64) return null

    const key = getEncryptionKey()
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
//  Senha Mestre — hash scrypt
// ---------------------------------------------------------------------------

/** Gera o hash da Senha Mestre. Formato: scrypt$<salt-b64>$<hash-b64>. */
export function hashMasterPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password.normalize('NFKC'), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })

  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`
}

/** Compara a senha informada com o hash guardado, em tempo constante. */
export function verifyMasterPassword(password: string, storedHash: string): boolean {
  try {
    const [scheme, saltB64, hashB64] = storedHash.split('$')
    if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false

    const expected = Buffer.from(hashB64, 'base64')
    const derived = scryptSync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    })

    return timingSafeEqual(expected, derived)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
//  Token de sessão do cofre (HMAC assinado, curta duração)
// ---------------------------------------------------------------------------

const SESSION_TTL_SECONDS = 15 * 60 // 15 minutos

function getSessionSecret(): Buffer {
  const raw = process.env.VAULT_SESSION_SECRET
  if (raw) return Buffer.from(raw, 'utf8')
  // Sem segredo próprio, deriva da chave de criptografia (sempre presente).
  return getEncryptionKey()
}

/**
 * Escopo de uma sessão do cofre.
 *
 * 'master' vê tudo. Um perfil vê apenas as subcategorias liberadas para
 * ele — e a lista de subcategorias NÃO vai no token: fica no banco e é
 * consultada a cada leitura. Assim, revogar um acesso no admin tem efeito
 * imediato, sem esperar a sessão de 15 minutos expirar.
 */
export type VaultScope = { kind: 'master' } | { kind: 'profile'; profileId: string }

function scopeToString(scope: VaultScope): string {
  return scope.kind === 'master' ? 'master' : `p:${scope.profileId}`
}

function scopeFromString(raw: string): VaultScope | null {
  if (raw === 'master') return { kind: 'master' }
  if (raw.startsWith('p:')) {
    const profileId = raw.slice(2)
    return profileId ? { kind: 'profile', profileId } : null
  }
  return null
}

/**
 * Emite um token opaco válido por 15 minutos.
 * É ele que autoriza a leitura das credenciais depois da Senha Mestre ou
 * do PIN — nenhum dos dois trafega de novo.
 */
export function issueVaultSession(scope: VaultScope): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000
  const nonce = randomBytes(8).toString('hex')
  const payload = `${expiresAt}.${nonce}.${scopeToString(scope)}`
  const signature = createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')

  return { token: `${payload}.${signature}`, expiresAt }
}

/**
 * Valida o token e devolve o escopo. null quando a assinatura não confere,
 * o prazo venceu ou o formato é inválido.
 */
export function verifyVaultSession(token: string | undefined | null): VaultScope | null {
  if (!token) return null

  try {
    const parts = token.split('.')
    if (parts.length !== 4) return null

    const [expiresAtRaw, nonce, scopeRaw, signature] = parts
    const payload = `${expiresAtRaw}.${nonce}.${scopeRaw}`
    const expected = createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')

    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null

    if (!(Number(expiresAtRaw) > Date.now())) return null

    return scopeFromString(scopeRaw)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
//  PIN individual dos perfis
// ---------------------------------------------------------------------------

/**
 * O PIN usa o MESMO scrypt da Senha Mestre, e não um hash rápido.
 *
 * São só 4 dígitos — 10.000 combinações. O scrypt torna cada tentativa
 * cara (~100ms), mas sozinho não basta: o bloqueio por tentativas em
 * cofre_perfis é o que de fato inviabiliza a força bruta.
 */
export function hashPin(pin: string): string {
  return hashMasterPassword(pin)
}

export function verifyPin(pin: string, storedHash: string): boolean {
  return verifyMasterPassword(pin, storedHash)
}

// ---------------------------------------------------------------------------
//  Assinatura de webhooks
// ---------------------------------------------------------------------------

/**
 * Compara duas assinaturas em tempo constante.
 * Evita que a diferença de tempo de resposta vaze o valor esperado.
 */
export function safeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** HMAC-SHA256 hex de um corpo cru — validação de webhooks assinados. */
export function hmacSha256(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}
