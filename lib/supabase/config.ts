/**
 * Leitura centralizada das variáveis de ambiente do Supabase.
 *
 * O app precisa BUILDAR e RENDERIZAR mesmo sem credenciais configuradas —
 * nesse caso a Home mostra um banner de setup e valores zerados, em vez de
 * quebrar. Por isso nada aqui lança erro na importação do módulo.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/** Chave de serviço — SOMENTE servidor. Nunca prefixar com NEXT_PUBLIC_. */
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/** true quando o app tem credenciais suficientes para ler dados públicos. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

/** true quando o app pode escrever (webhooks, admin, cofre). */
export function isServiceRoleConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}
