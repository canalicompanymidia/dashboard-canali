'use server'

import { z } from 'zod'

import { getColaborador, type Colaborador } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { contarChat, ehMembro, getConversas, getMensagens } from '@/lib/tasks/chat'
import { getPessoas } from '@/lib/tasks/data'
import { primeiraMensagem, uuid } from '@/lib/tasks/schemas'
import type { ConversaResumo, MensagemChat, Resultado } from '@/lib/tasks/types'

/*
 * Chat do Tasks. Toda ação confere a sessão e, quando mexe numa conversa,
 * que a pessoa é membro dela. As tabelas não têm policy: só este código,
 * com a service_role, lê e grava.
 */

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>

function falha<T = null>(message: string): Resultado<T> {
  return { ok: false, message }
}

function sucesso<T>(data: T): Resultado<T> {
  return { ok: true, data }
}

async function autenticar(): Promise<{ colab: Colaborador; supabase: SupabaseAdmin } | { erro: string }> {
  const colab = await getColaborador()
  if (!colab) return { erro: 'Sua sessão expirou. Entre novamente.' }
  const supabase = getSupabaseAdminClient()
  if (!supabase) return { erro: 'O banco do Hub não está configurado.' }
  return { colab, supabase }
}

/** Só e-mails de colaboradores ativos entram numa conversa. */
async function filtrarColaboradores(emails: string[]): Promise<string[]> {
  const ativos = new Set((await getPessoas()).map((p) => p.email))
  return [...new Set(emails.map((e) => e.trim().toLowerCase()))].filter((e) => ativos.has(e))
}

const emails = z.array(z.string().email({ message: 'E-mail inválido.' })).max(50)

const abrirSchema = z.object({
  emails: emails.min(1, { message: 'Escolha pelo menos uma pessoa.' }),
  nome: z.string().trim().max(80, { message: 'Nome com no máximo 80 caracteres.' }).optional(),
})

const enviarSchema = z.object({
  conversaId: uuid,
  texto: z
    .string()
    .trim()
    .min(1, { message: 'Escreva uma mensagem.' })
    .max(4000, { message: 'Mensagem com no máximo 4.000 caracteres.' }),
})

const grupoSchema = z.object({
  conversaId: uuid,
  nome: z.string().trim().min(1, { message: 'Dê um nome ao grupo.' }).max(80).optional(),
  adicionar: emails.optional(),
})

const paginaSchema = z.object({
  conversaId: uuid,
  antes: z.string().datetime({ offset: true }).optional(),
  depois: z.string().datetime({ offset: true }).optional(),
})

export async function carregarConversas(): Promise<Resultado<ConversaResumo[]>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  return sucesso(await getConversas(ctx.colab.email))
}

export async function contarChatNaoLidas(): Promise<Resultado<number>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  return sucesso(await contarChat(ctx.colab.email))
}

export async function carregarMensagens(
  input: unknown,
): Promise<Resultado<{ mensagens: MensagemChat[]; temMais: boolean }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  const parsed = paginaSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))
  const { conversaId, antes, depois } = parsed.data
  if (!(await ehMembro(conversaId, ctx.colab.email))) return falha('Conversa não encontrada.')
  return sucesso(await getMensagens(conversaId, { antes, depois }))
}

/**
 * Abre uma conversa. Com uma pessoa só, é a conversa individual (a mesma
 * de antes, se já existir). Com mais, cria um grupo.
 */
export async function abrirConversa(input: unknown): Promise<Resultado<{ id: string }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  const parsed = abrirSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const eu = ctx.colab.email
  const outros = (await filtrarColaboradores(parsed.data.emails)).filter((e) => e !== eu)
  if (outros.length === 0) return falha('Escolha pelo menos uma pessoa do time.')

  if (outros.length === 1) {
    const chave = [eu, outros[0]].sort().join('|')
    const { data: existe } = await ctx.supabase.from('tarefas_chat_conversas').select('id').eq('dm_chave', chave).maybeSingle()
    if (existe) return sucesso({ id: existe.id as string })

    const { data: nova, error } = await ctx.supabase
      .from('tarefas_chat_conversas')
      .insert({ tipo: 'dm', dm_chave: chave, criado_por: eu })
      .select('id')
      .single()
    if (error || !nova) {
      // Duas pessoas abriram ao mesmo tempo: a outra criou primeiro.
      const { data: corrida } = await ctx.supabase.from('tarefas_chat_conversas').select('id').eq('dm_chave', chave).maybeSingle()
      if (corrida) return sucesso({ id: corrida.id as string })
      return falha(`Erro ao abrir a conversa: ${error?.message ?? 'sem resposta'}`)
    }
    const { error: erroMembros } = await ctx.supabase
      .from('tarefas_chat_membros')
      .insert([eu, outros[0]].map((email) => ({ conversa_id: nova.id, email })))
    if (erroMembros) return falha(`Erro ao abrir a conversa: ${erroMembros.message}`)
    return sucesso({ id: nova.id as string })
  }

  const nome = parsed.data.nome?.trim()
  if (!nome) return falha('Dê um nome ao grupo.')
  const { data: grupo, error } = await ctx.supabase
    .from('tarefas_chat_conversas')
    .insert({ tipo: 'grupo', nome, criado_por: eu })
    .select('id')
    .single()
  if (error || !grupo) return falha(`Erro ao criar o grupo: ${error?.message ?? 'sem resposta'}`)
  const { error: erroMembros } = await ctx.supabase
    .from('tarefas_chat_membros')
    .insert([eu, ...outros].map((email) => ({ conversa_id: grupo.id, email })))
  if (erroMembros) return falha(`Erro ao criar o grupo: ${erroMembros.message}`)
  return sucesso({ id: grupo.id as string })
}

export async function enviarMensagem(input: unknown): Promise<Resultado<MensagemChat>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  const parsed = enviarSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))
  const { conversaId, texto } = parsed.data
  if (!(await ehMembro(conversaId, ctx.colab.email))) return falha('Conversa não encontrada.')

  const { data, error } = await ctx.supabase
    .from('tarefas_chat_mensagens')
    .insert({ conversa_id: conversaId, autor: ctx.colab.email, texto })
    .select('id, autor, texto, created_at')
    .single()
  if (error || !data) return falha(`Erro ao enviar: ${error?.message ?? 'sem resposta'}`)

  const em = data.created_at as string
  await Promise.all([
    ctx.supabase.from('tarefas_chat_conversas').update({ ultima_em: em }).eq('id', conversaId),
    ctx.supabase.from('tarefas_chat_membros').update({ lida_ate: em }).match({ conversa_id: conversaId, email: ctx.colab.email }),
  ])
  return sucesso(data as MensagemChat)
}

export async function marcarConversaLida(conversaId: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  const parsed = uuid.safeParse(conversaId)
  if (!parsed.success) return falha('Conversa inválida.')
  const { error } = await ctx.supabase
    .from('tarefas_chat_membros')
    .update({ lida_ate: new Date().toISOString() })
    .match({ conversa_id: parsed.data, email: ctx.colab.email })
  if (error) return falha(`Erro ao marcar como lida: ${error.message}`)
  return sucesso(null)
}

/** Renomeia o grupo e/ou adiciona pessoas. Qualquer membro pode. */
export async function editarGrupo(input: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  const parsed = grupoSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))
  const { conversaId, nome, adicionar } = parsed.data
  if (!(await ehMembro(conversaId, ctx.colab.email))) return falha('Conversa não encontrada.')

  const { data: conversa } = await ctx.supabase.from('tarefas_chat_conversas').select('tipo').eq('id', conversaId).maybeSingle()
  if (conversa?.tipo !== 'grupo') return falha('Só grupos podem ser editados.')

  if (nome) {
    const { error } = await ctx.supabase.from('tarefas_chat_conversas').update({ nome }).eq('id', conversaId)
    if (error) return falha(`Erro ao renomear: ${error.message}`)
  }
  if (adicionar && adicionar.length > 0) {
    const novos = await filtrarColaboradores(adicionar)
    if (novos.length > 0) {
      const { error } = await ctx.supabase
        .from('tarefas_chat_membros')
        .upsert(novos.map((email) => ({ conversa_id: conversaId, email })), { onConflict: 'conversa_id,email', ignoreDuplicates: true })
      if (error) return falha(`Erro ao adicionar: ${error.message}`)
    }
  }
  return sucesso(null)
}

/** Sai do grupo. O último a sair apaga o grupo e as mensagens. */
export async function sairDoGrupo(conversaId: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  const parsed = uuid.safeParse(conversaId)
  if (!parsed.success) return falha('Conversa inválida.')
  const id = parsed.data

  const { data: conversa } = await ctx.supabase.from('tarefas_chat_conversas').select('tipo').eq('id', id).maybeSingle()
  if (!conversa || !(await ehMembro(id, ctx.colab.email))) return falha('Conversa não encontrada.')
  if (conversa.tipo !== 'grupo') return falha('Só é possível sair de grupos.')

  const { error } = await ctx.supabase.from('tarefas_chat_membros').delete().match({ conversa_id: id, email: ctx.colab.email })
  if (error) return falha(`Erro ao sair: ${error.message}`)

  const { count } = await ctx.supabase.from('tarefas_chat_membros').select('email', { count: 'exact', head: true }).eq('conversa_id', id)
  if (!count) await ctx.supabase.from('tarefas_chat_conversas').delete().eq('id', id)
  return sucesso(null)
}
