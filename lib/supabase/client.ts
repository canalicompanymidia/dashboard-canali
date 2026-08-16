'use client'

import { createBrowserClient } from '@supabase/ssr'

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config'

type BrowserClient = ReturnType<typeof createBrowserClient>

let cached: BrowserClient | null = null

/**
 * Cliente de browser (chave anônima).
 * Usado pelo Bloco 2 para assinar o Realtime e atualizar as métricas
 * assim que um webhook grava uma venda.
 *
 * Retorna null quando o Supabase não está configurado, para o componente
 * poder cair no modo somente-leitura sem quebrar.
 */
export function getSupabaseBrowserClient(): BrowserClient | null {
  if (!isSupabaseConfigured()) return null
  if (!cached) {
    cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return cached
}
