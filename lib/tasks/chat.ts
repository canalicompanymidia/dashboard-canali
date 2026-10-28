import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/server'

import type { ConversaResumo, MensagemChat, ReacaoChat, TipoConversa } from './types'

/** Mensagens por página do histórico. */
export const PAGINA_CHAT = 60

/** Conversas da pessoa, da mais recente para a mais antiga. */
export async function getConversas(email: string): Promise<ConversaResumo[]> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return []

  let { data: minhas, error } = await supabase.from('tarefas_chat_membros').select('conversa_id, silenciado').eq('email', email)
  // Banco sem a migração 0015 (coluna silenciado): segue sem silenciar.
  if (error) {
    const semColuna = await supabase.from('tarefas_chat_membros').select('conversa_id').eq('email', email)
    minhas = (semColuna.data ?? []).map((m) => ({ ...m, silenciado: false }))
    error = semColuna.error
  }
  const ids = (minhas ?? []).map((m) => m.conversa_id as string)
  const silenciadas = new Set((minhas ?? []).filter((m) => m.silenciado).map((m) => m.conversa_id as string))
  if (ids.length === 0) return []

  const [conversas, membros, naoLidas, previas] = await Promise.all([
    supabase.from('tarefas_chat_conversas').select('id, tipo, nome, ultima_em').in('id', ids),
    supabase.from('tarefas_chat_membros').select('conversa_id, email').in('conversa_id', ids),
    supabase.rpc('chat_nao_lidas', { p_email: email }),
    // Uma consulta curta por conversa: o time é pequeno e o índice
    // (conversa_id, created_at desc) responde cada uma na hora.
    Promise.all(
      ids.map((id) =>
        supabase
          .from('tarefas_chat_mensagens')
          .select('id, autor, texto, created_at')
          .eq('conversa_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    ),
  ])

  const membrosPor = new Map<string, string[]>()
  for (const m of membros.data ?? []) {
    const lista = membrosPor.get(m.conversa_id as string) ?? []
    lista.push(m.email as string)
    membrosPor.set(m.conversa_id as string, lista)
  }
  const naoLidasPor = new Map<string, number>(
    ((naoLidas.data ?? []) as { conversa_id: string; nao_lidas: number }[]).map((n) => [n.conversa_id, Number(n.nao_lidas)]),
  )
  const previaPor = new Map<string, MensagemChat>()
  previas.forEach((p, i) => {
    if (p.data) previaPor.set(ids[i], p.data as MensagemChat)
  })

  return (conversas.data ?? [])
    .map((c) => ({
      id: c.id as string,
      tipo: c.tipo as TipoConversa,
      nome: (c.nome as string | null) ?? null,
      membros: membrosPor.get(c.id as string) ?? [],
      ultima_em: c.ultima_em as string,
      previa: previaPor.get(c.id as string) ?? null,
      nao_lidas: naoLidasPor.get(c.id as string) ?? 0,
      silenciado: silenciadas.has(c.id as string),
    }))
    .sort((a, b) => b.ultima_em.localeCompare(a.ultima_em))
}

/** Total de mensagens não lidas, para o contador da barra lateral. Grupos silenciados não entram. */
export async function contarChat(email: string): Promise<number> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('chat_nao_lidas', { p_email: email })
  if (error || !data) return 0
  return (data as { nao_lidas: number; silenciado: boolean }[])
    .filter((n) => !n.silenciado)
    .reduce((soma, n) => soma + Number(n.nao_lidas), 0)
}

export async function ehMembro(conversaId: string, email: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return false
  const { data } = await supabase
    .from('tarefas_chat_membros')
    .select('email')
    .eq('conversa_id', conversaId)
    .eq('email', email)
    .maybeSingle()
  return Boolean(data)
}

/**
 * Mensagens de uma conversa em ordem de leitura. `antes` pagina para trás;
 * `depois` traz só as que chegaram (usado pelo aviso em tempo real).
 * Quem chama confere antes que a pessoa é membro.
 */
export async function getMensagens(
  conversaId: string,
  opcoes: { antes?: string; depois?: string } = {},
): Promise<{ mensagens: MensagemChat[]; temMais: boolean }> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return { mensagens: [], temMais: false }

  let q = supabase
    .from('tarefas_chat_mensagens')
    .select('id, autor, texto, created_at')
    .eq('conversa_id', conversaId)
    .order('created_at', { ascending: false })
    .limit(PAGINA_CHAT + 1)
  if (opcoes.antes) q = q.lt('created_at', opcoes.antes)
  if (opcoes.depois) q = q.gt('created_at', opcoes.depois)

  const { data } = await q
  const linhas = (data ?? []) as MensagemChat[]
  const temMais = !opcoes.depois && linhas.length > PAGINA_CHAT
  const mensagens = linhas.slice(0, PAGINA_CHAT).reverse()
  const reacoes = await getReacoes(mensagens.map((m) => m.id))
  return { mensagens: mensagens.map((m) => ({ ...m, reacoes: reacoes.get(m.id) ?? [] })), temMais }
}

/** Reações agrupadas por mensagem, na ordem em que cada emoji apareceu. */
export async function getReacoes(ids: string[]): Promise<Map<string, ReacaoChat[]>> {
  const mapa = new Map<string, ReacaoChat[]>()
  const supabase = getSupabaseAdminClient()
  if (!supabase || ids.length === 0) return mapa

  const { data } = await supabase
    .from('tarefas_chat_reacoes')
    .select('mensagem_id, email, emoji')
    .in('mensagem_id', ids)
    .order('created_at', { ascending: true })

  for (const r of data ?? []) {
    const lista = mapa.get(r.mensagem_id as string) ?? []
    const existente = lista.find((x) => x.emoji === r.emoji)
    if (existente) existente.emails.push(r.email as string)
    else lista.push({ emoji: r.emoji as string, emails: [r.email as string] })
    mapa.set(r.mensagem_id as string, lista)
  }
  return mapa
}
