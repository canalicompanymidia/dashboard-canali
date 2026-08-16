import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  isServiceRoleConfigured,
  isSupabaseConfigured,
} from './config'

/**
 * Cliente de leitura para Server Components (chave anônima, sujeito a RLS).
 * Enxerga apenas o conteúdo público: metas, ações, documentos e as views
 * agregadas de faturamento.
 */
export async function getSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null

  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components não podem escrever cookies. Ignorar é seguro:
          // não há sessão de usuário para renovar neste painel.
        }
      },
    },
  })
}

/**
 * Cliente administrativo (service_role) — ignora RLS.
 *
 * Use SOMENTE em rotas de API, Server Actions e webhooks. Nunca importe
 * este módulo em componentes de cliente: 'server-only' quebra o build se
 * alguém tentar.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!isServiceRoleConfigured()) return null

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'canali-hub/1.0' } },
  })
}

/**
 * Igual ao anterior, mas lança quando não configurado.
 * Para rotas que não têm o que fazer sem banco (webhooks, cofre, admin).
 */
export function requireSupabaseAdminClient(): SupabaseClient {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error(
      'Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
  return client
}
