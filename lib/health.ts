import 'server-only'

import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase/server'
import {
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from '@/lib/supabase/config'

/**
 * Diagnóstico de conexão.
 *
 * Conferir se a variável de ambiente existe não prova nada: uma URL com o
 * caminho errado ou uma chave trocada passam nesse teste e quebram na
 * primeira consulta. Estas funções fazem a chamada de verdade e devolvem a
 * mensagem crua do Supabase, que é o que realmente aponta o problema.
 */

export interface HealthCheck {
  name: string
  status: 'ok' | 'erro' | 'ausente'
  detail: string
  hint?: string
}

/** Confere o formato da URL antes de qualquer chamada de rede. */
export function checkSupabaseUrl(): HealthCheck {
  const name = 'Formato da URL do Supabase'

  if (!SUPABASE_URL) {
    return {
      name,
      status: 'ausente',
      detail: 'NEXT_PUBLIC_SUPABASE_URL não está definida.',
      hint: 'Cadastre a variável na Vercel e refaça o deploy.',
    }
  }

  let parsed: URL
  try {
    parsed = new URL(SUPABASE_URL)
  } catch {
    return {
      name,
      status: 'erro',
      detail: `Valor não é uma URL válida: "${SUPABASE_URL}"`,
      hint: 'O valor deve começar com https:// e não pode incluir o nome da variável.',
    }
  }

  if (parsed.protocol !== 'https:') {
    return {
      name,
      status: 'erro',
      detail: `A URL usa "${parsed.protocol}" em vez de https.`,
      hint: 'Use o Project URL exatamente como o Supabase mostra.',
    }
  }

  // Esta é a causa clássica de "Invalid path specified in request URL": o
  // supabase-js concatena /rest/v1 no fim da URL, então qualquer caminho já
  // presente vira um endereço duplicado que o gateway recusa.
  const path = parsed.pathname.replace(/\/+$/, '')
  if (path) {
    return {
      name,
      status: 'erro',
      detail: `A URL tem um caminho depois do domínio: "${parsed.pathname}"`,
      hint: `Use apenas https://${parsed.host} — sem /rest/v1 e sem nada depois do domínio.`,
    }
  }

  return {
    name,
    status: 'ok',
    detail: `https://${parsed.host}`,
  }
}

/** Leitura pública: prova que a URL e a chave anônima funcionam. */
export async function checkSupabaseRead(): Promise<HealthCheck> {
  const name = 'Leitura do banco (chave anônima)'

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      name,
      status: 'ausente',
      detail: 'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    }
  }

  try {
    const supabase = await getSupabaseServerClient()
    if (!supabase) return { name, status: 'ausente', detail: 'Cliente não pôde ser criado.' }

    const { count, error } = await supabase
      .from('annual_goals')
      .select('*', { count: 'exact', head: true })

    if (error) return { name, status: 'erro', detail: error.message, hint: hintFor(error.message) }

    return { name, status: 'ok', detail: `${count ?? 0} meta(s) encontrada(s).` }
  } catch (error) {
    return { name, status: 'erro', detail: (error as Error).message }
  }
}

/** Escrita: prova que a service_role está válida — é a que o cofre usa. */
export async function checkSupabaseWrite(): Promise<HealthCheck> {
  const name = 'Escrita no banco (service_role)'

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      name,
      status: 'ausente',
      detail: 'SUPABASE_SERVICE_ROLE_KEY não está definida.',
      hint: 'Sem ela, webhooks, admin e cofre não conseguem gravar.',
    }
  }

  try {
    const supabase = getSupabaseAdminClient()
    if (!supabase) return { name, status: 'ausente', detail: 'Cliente não pôde ser criado.' }

    // app_settings é bloqueada para a chave anônima: se esta leitura passa,
    // a service_role está mesmo valendo.
    const { error } = await supabase.from('app_settings').select('key').limit(1)

    if (error) return { name, status: 'erro', detail: error.message, hint: hintFor(error.message) }

    return { name, status: 'ok', detail: 'Conexão validada com permissão de escrita.' }
  } catch (error) {
    return { name, status: 'erro', detail: (error as Error).message }
  }
}

/** Traduz os erros mais comuns do Supabase em uma instrução acionável. */
function hintFor(message: string): string | undefined {
  const m = message.toLowerCase()

  if (m.includes('invalid path')) {
    return 'A URL do Supabase tem um caminho a mais. Use só https://SEU-PROJETO.supabase.co, sem nada depois do domínio.'
  }
  if (m.includes('jwt') || m.includes('api key') || m.includes('invalid authentication')) {
    return 'A chave não confere com este projeto. Copie de novo em Project Settings → API.'
  }
  if (m.includes('could not find the table') || m.includes('does not exist') || m.includes('schema cache')) {
    return 'A tabela não existe. Rode supabase/schema.sql e depois supabase/seed.sql no SQL Editor.'
  }
  if (m.includes('fetch failed') || m.includes('enotfound') || m.includes('getaddrinfo')) {
    return 'O domínio não respondeu. Confira se a URL do projeto está escrita corretamente.'
  }
  return undefined
}

/** Roda todos os testes de uma vez. */
export async function runHealthChecks(): Promise<HealthCheck[]> {
  const url = checkSupabaseUrl()

  // Sem URL válida, as chamadas de rede só produziriam ruído.
  if (url.status !== 'ok') {
    return [
      url,
      { name: 'Leitura do banco (chave anônima)', status: 'erro', detail: 'Não testado — corrija a URL primeiro.' },
      { name: 'Escrita no banco (service_role)', status: 'erro', detail: 'Não testado — corrija a URL primeiro.' },
    ]
  }

  const [read, write] = await Promise.all([checkSupabaseRead(), checkSupabaseWrite()])
  return [url, read, write]
}
