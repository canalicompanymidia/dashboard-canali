import 'server-only'

import { redirect } from 'next/navigation'

import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Autenticação do Hub.
 *
 * Duas checagens distintas, e a diferença importa:
 *
 *   1. ESTAR LOGADO  — o Supabase confirma que a pessoa é dona do e-mail.
 *      Sozinho não vale nada: qualquer um pode criar conta no Supabase.
 *   2. ESTAR NA LISTA — o e-mail consta em `colaboradores_autorizados`
 *      e está ativo. É esta que autoriza.
 *
 * As duas são refeitas do banco a cada requisição, nunca gravadas no
 * cookie: desativar alguém corta o acesso na hora, sem esperar a sessão
 * expirar. E o banco repete a checagem por conta própria via RLS — se
 * esta camada falhar, as consultas ainda voltam vazias.
 */

export interface Colaborador {
  email: string
  nome: string | null
  papel: 'admin' | 'colaborador'
}

/** E-mail confirmado pelo Supabase, ou null. */
export async function getEmailLogado(): Promise<string | null> {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return null

  // getUser() valida o token no servidor de auth. getSession() só lê o
  // cookie, que o próprio cliente poderia forjar — não serve para decidir
  // acesso.
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user?.email) return null

  return data.user.email.toLowerCase()
}

/** Busca o colaborador na lista. Null = logado mas sem autorização. */
export async function getColaborador(): Promise<Colaborador | null> {
  const email = await getEmailLogado()
  if (!email) return null

  return buscarColaborador(email)
}

/**
 * Consulta a lista pelo e-mail. Usa service_role porque a tabela de
 * permissões não é legível por quem está sendo verificado — quem pergunta
 * "posso entrar?" não pode ler a lista de quem pode.
 */
export async function buscarColaborador(email: string): Promise<Colaborador | null> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('colaboradores_autorizados')
    .select('email, nome, papel, ativo')
    .ilike('email', email)
    .maybeSingle()

  if (error || !data || !data.ativo) return null

  return {
    email: String(data.email).toLowerCase(),
    nome: (data.nome as string | null) ?? null,
    papel: data.papel === 'admin' ? 'admin' : 'colaborador',
  }
}

/** Exige colaborador ativo. Redireciona quando não é. */
export async function requireColaborador(): Promise<Colaborador> {
  const colaborador = await getColaborador()
  if (colaborador) return colaborador

  // Logado porém fora da lista é diferente de não logado: a pessoa provou
  // o e-mail e mesmo assim não tem acesso. Merece uma tela que explique,
  // em vez de um laço de login que nunca resolve.
  redirect((await getEmailLogado()) ? '/sem-acesso' : '/login')
}

/** Exige papel de admin. */
export async function requireAdmin(): Promise<Colaborador> {
  const colaborador = await requireColaborador()
  if (colaborador.papel !== 'admin') redirect('/sem-acesso?motivo=admin')
  return colaborador
}

/** Registra o último acesso — alimenta a coluna da tela de colaboradores. */
export async function marcarAcesso(email: string): Promise<void> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return

  await supabase
    .from('colaboradores_autorizados')
    .update({ ultimo_acesso_em: new Date().toISOString() })
    .ilike('email', email)
}
