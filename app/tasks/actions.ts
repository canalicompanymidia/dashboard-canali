'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getColaborador, type Colaborador } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import {
  getEspacosVisiveis,
  getStatuses,
  getTarefa,
  getTarefaDetalhe,
} from '@/lib/tasks/data'
import {
  podeAdministrarEspaco,
  podeApagarComentario,
  podeApagarItem,
  podeEditarComentario,
  type EspacoAcesso,
} from '@/lib/tasks/permissoes'
import {
  anexoPedidoSchema,
  anexoRegistroSchema,
  campoSchema,
  checklistItemSchema,
  comentarioSchema,
  espacoSchema,
  listaSchema,
  moverParaListaSchema,
  moverTarefaSchema,
  novaTarefaSchema,
  pastaSchema,
  patchTarefaSchema,
  primeiraMensagem,
  statusesSchema,
  uuid,
} from '@/lib/tasks/schemas'
import type {
  Anexo,
  Campo,
  Comentario,
  Espaco,
  ItemChecklist,
  Resultado,
  Status,
  Tarefa,
  TarefaDetalhe,
} from '@/lib/tasks/types'
import { BUCKET_ANEXOS, PRIORIDADES } from '@/lib/tasks/types'

/**
 * Server Actions do módulo Tasks.
 *
 * Toda operação começa conferindo QUEM está chamando e SE essa pessoa
 * enxerga o espaço em questão. Server Action é endpoint HTTP: o layout
 * protege a navegação, não a chamada — e como escrevemos com a
 * service_role, o banco também não segura. A barreira é aqui, em cada
 * função, sem exceção.
 */

const SEM_BANCO = 'Supabase não configurado. Defina SUPABASE_SERVICE_ROLE_KEY para gravar dados.'

function falha<T = null>(message: string): Resultado<T> {
  return { ok: false, message }
}

function sucesso<T>(data: T, message?: string): Resultado<T> {
  return { ok: true, data, message }
}

/** Revalida todas as telas do módulo: qualquer mudança aparece em todas. */
function revalidar() {
  revalidatePath('/tasks', 'layout')
}

type Contexto = { colab: Colaborador; supabase: SupabaseClient }

async function autenticar(): Promise<Contexto | { erro: string }> {
  const colab = await getColaborador()
  if (!colab) return { erro: 'Sua sessão expirou. Entre novamente.' }
  const supabase = getSupabaseAdminClient()
  if (!supabase) return { erro: SEM_BANCO }
  return { colab, supabase }
}

/** O espaço, se a pessoa pode vê-lo. */
async function espacoVisivel(
  colab: Colaborador,
  espacoId: string,
): Promise<(Espaco & EspacoAcesso) | null> {
  const espacos = await getEspacosVisiveis(colab)
  return espacos.find((e) => e.id === espacoId) ?? null
}

interface ListaBasica {
  id: string
  espaco_id: string
  pasta_id: string | null
  nome: string
  criado_por: string | null
}

/** A lista e o espaço dela, se a pessoa pode vê-los. */
async function listaVisivel(
  ctx: Contexto,
  listaId: string,
): Promise<{ lista: ListaBasica; espaco: Espaco & EspacoAcesso } | null> {
  const { data } = await ctx.supabase
    .from('tarefas_listas')
    .select('id, espaco_id, pasta_id, nome, criado_por')
    .eq('id', listaId)
    .maybeSingle()
  if (!data) return null

  const espaco = await espacoVisivel(ctx.colab, data.espaco_id)
  if (!espaco) return null

  return { lista: data as ListaBasica, espaco }
}

/** A tarefa (da view), se a pessoa pode ver o espaço dela. */
async function tarefaVisivel(ctx: Contexto, tarefaId: string): Promise<Tarefa | null> {
  const tarefa = await getTarefa(tarefaId)
  if (!tarefa) return null
  const espaco = await espacoVisivel(ctx.colab, tarefa.espaco_id)
  return espaco ? tarefa : null
}

async function registrarAtividade(
  supabase: SupabaseClient,
  tarefaId: string,
  autor: string,
  tipo: string,
  detalhe: Record<string, unknown> = {},
) {
  await supabase.from('tarefas_atividades').insert({ tarefa_id: tarefaId, autor, tipo, detalhe })
}

// ---------------------------------------------------------------------------
//  Storage — anexos precisam sair do bucket quando o dono some
// ---------------------------------------------------------------------------

async function caminhosDeAnexos(supabase: SupabaseClient, tarefaIds: string[]): Promise<string[]> {
  if (tarefaIds.length === 0) return []
  const { data } = await supabase.from('tarefas_anexos').select('caminho').in('tarefa_id', tarefaIds)
  return (data ?? []).map((a) => String(a.caminho))
}

async function removerObjetos(supabase: SupabaseClient, caminhos: string[]) {
  if (caminhos.length === 0) return
  // Em lotes: a API aceita no máximo algumas centenas por chamada.
  for (let i = 0; i < caminhos.length; i += 100) {
    await supabase.storage.from(BUCKET_ANEXOS).remove(caminhos.slice(i, i + 100))
  }
}

/** Ids de todas as tarefas (e subtarefas) sob um filtro da view. */
async function idsDeTarefas(
  supabase: SupabaseClient,
  coluna: 'espaco_id' | 'pasta_id' | 'lista_id',
  valor: string,
): Promise<string[]> {
  const { data } = await supabase.from('v_tarefas').select('id').eq(coluna, valor)
  return (data ?? []).map((t) => String(t.id))
}

// ---------------------------------------------------------------------------
//  ESPAÇOS
// ---------------------------------------------------------------------------

export async function criarEspaco(input: unknown): Promise<Resultado<{ id: string }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = espacoSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const { nome, cor, privado, membros } = parsed.data

  const { data: maxRow } = await ctx.supabase
    .from('tarefas_espacos')
    .select('posicao')
    .order('posicao', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await ctx.supabase
    .from('tarefas_espacos')
    .insert({
      nome,
      cor,
      privado,
      posicao: (maxRow?.posicao ?? -1) + 1,
      criado_por: ctx.colab.email,
    })
    .select('id')
    .single()

  if (error || !data) return falha(`Erro ao criar o espaço: ${error?.message ?? 'sem retorno'}`)

  if (privado && membros.length > 0) {
    await ctx.supabase
      .from('tarefas_espaco_membros')
      .insert(membros.map((email) => ({ espaco_id: data.id, email })))
  }

  revalidar()
  return sucesso({ id: String(data.id) }, `Espaço "${nome}" criado.`)
}

export async function atualizarEspaco(input: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = espacoSchema.required({ id: true }).safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const { id, nome, cor, privado, membros } = parsed.data

  const espaco = await espacoVisivel(ctx.colab, id)
  if (!espaco) return falha('Espaço não encontrado.')
  if (!podeAdministrarEspaco(ctx.colab, espaco)) {
    return falha('Só administradores ou quem criou o espaço podem alterá-lo.')
  }

  const { error } = await ctx.supabase
    .from('tarefas_espacos')
    .update({ nome, cor, privado })
    .eq('id', id)
  if (error) return falha(`Erro ao salvar: ${error.message}`)

  // Membros só fazem sentido em espaço privado; a lista é substituída.
  await ctx.supabase.from('tarefas_espaco_membros').delete().eq('espaco_id', id)
  if (privado && membros.length > 0) {
    await ctx.supabase
      .from('tarefas_espaco_membros')
      .insert(membros.map((email) => ({ espaco_id: id, email })))
  }

  revalidar()
  return sucesso(null, 'Espaço atualizado.')
}

export async function excluirEspaco(input: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(input)
  if (!parsed.success) return falha('Identificador inválido.')

  const espaco = await espacoVisivel(ctx.colab, parsed.data)
  if (!espaco) return falha('Espaço não encontrado.')
  if (!podeAdministrarEspaco(ctx.colab, espaco)) {
    return falha('Só administradores ou quem criou o espaço podem excluí-lo.')
  }

  const ids = await idsDeTarefas(ctx.supabase, 'espaco_id', espaco.id)
  await removerObjetos(ctx.supabase, await caminhosDeAnexos(ctx.supabase, ids))

  const { error } = await ctx.supabase.from('tarefas_espacos').delete().eq('id', espaco.id)
  if (error) return falha(`Erro ao excluir: ${error.message}`)

  revalidar()
  return sucesso(null, `Espaço "${espaco.nome}" excluído.`)
}

// ---------------------------------------------------------------------------
//  PASTAS
// ---------------------------------------------------------------------------

export async function criarPasta(input: unknown): Promise<Resultado<{ id: string }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = pastaSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const espaco = await espacoVisivel(ctx.colab, parsed.data.espaco_id)
  if (!espaco) return falha('Espaço não encontrado.')

  const { data: maxRow } = await ctx.supabase
    .from('tarefas_pastas')
    .select('posicao')
    .eq('espaco_id', espaco.id)
    .order('posicao', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await ctx.supabase
    .from('tarefas_pastas')
    .insert({
      espaco_id: espaco.id,
      nome: parsed.data.nome,
      posicao: (maxRow?.posicao ?? -1) + 1,
      criado_por: ctx.colab.email,
    })
    .select('id')
    .single()

  if (error || !data) return falha(`Erro ao criar a pasta: ${error?.message ?? 'sem retorno'}`)

  revalidar()
  return sucesso({ id: String(data.id) }, `Pasta "${parsed.data.nome}" criada.`)
}

export async function renomearPasta(input: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = pastaSchema.required({ id: true }).safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const espaco = await espacoVisivel(ctx.colab, parsed.data.espaco_id)
  if (!espaco) return falha('Espaço não encontrado.')

  const { error } = await ctx.supabase
    .from('tarefas_pastas')
    .update({ nome: parsed.data.nome })
    .eq('id', parsed.data.id)
    .eq('espaco_id', espaco.id)
  if (error) return falha(`Erro ao renomear: ${error.message}`)

  revalidar()
  return sucesso(null, 'Pasta renomeada.')
}

export async function excluirPasta(input: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(input)
  if (!parsed.success) return falha('Identificador inválido.')

  const { data: pasta } = await ctx.supabase
    .from('tarefas_pastas')
    .select('id, espaco_id, nome, criado_por')
    .eq('id', parsed.data)
    .maybeSingle()
  if (!pasta) return falha('Pasta não encontrada.')

  const espaco = await espacoVisivel(ctx.colab, pasta.espaco_id)
  if (!espaco) return falha('Pasta não encontrada.')
  if (!podeApagarItem(ctx.colab, pasta, espaco)) {
    return falha('Só administradores, quem criou a pasta ou o dono do espaço podem excluí-la.')
  }

  const ids = await idsDeTarefas(ctx.supabase, 'pasta_id', pasta.id)
  await removerObjetos(ctx.supabase, await caminhosDeAnexos(ctx.supabase, ids))

  const { error } = await ctx.supabase.from('tarefas_pastas').delete().eq('id', pasta.id)
  if (error) return falha(`Erro ao excluir: ${error.message}`)

  revalidar()
  return sucesso(null, `Pasta "${pasta.nome}" excluída, com as listas dela.`)
}

// ---------------------------------------------------------------------------
//  LISTAS
// ---------------------------------------------------------------------------

const STATUS_PADRAO = [
  { nome: 'para fazer', cor: '#8a817c', tipo: 'aberto' },
  { nome: 'em andamento', cor: '#1f6feb', tipo: 'ativo' },
  { nome: 'em revisão', cor: '#7b2cbf', tipo: 'ativo' },
  { nome: 'concluído', cor: '#008844', tipo: 'fechado' },
]

export async function criarLista(input: unknown): Promise<Resultado<{ id: string }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = listaSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const { espaco_id, pasta_id, nome, cor, descricao } = parsed.data

  const espaco = await espacoVisivel(ctx.colab, espaco_id)
  if (!espaco) return falha('Espaço não encontrado.')

  const { data: maxRow } = await ctx.supabase
    .from('tarefas_listas')
    .select('posicao')
    .eq('espaco_id', espaco.id)
    .order('posicao', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await ctx.supabase
    .from('tarefas_listas')
    .insert({
      espaco_id: espaco.id,
      pasta_id,
      nome,
      cor,
      descricao,
      posicao: (maxRow?.posicao ?? -1) + 1,
      criado_por: ctx.colab.email,
    })
    .select('id')
    .single()

  if (error || !data) {
    if (error?.code === '23503') return falha('A pasta escolhida não pertence a este espaço.')
    return falha(`Erro ao criar a lista: ${error?.message ?? 'sem retorno'}`)
  }

  // Herda os status da lista mais antiga do espaço — o time trabalha com
  // o mesmo fluxo dentro de um espaço. Sem irmã, nasce com o fluxo padrão.
  const { data: irma } = await ctx.supabase
    .from('tarefas_listas')
    .select('id')
    .eq('espaco_id', espaco.id)
    .neq('id', data.id)
    .order('posicao')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  const modelo = irma ? await getStatuses(String(irma.id)) : []
  const statuses = (modelo.length > 0 ? modelo : STATUS_PADRAO).map((s, i) => ({
    lista_id: data.id,
    nome: s.nome,
    cor: s.cor,
    tipo: s.tipo,
    posicao: i,
  }))

  await ctx.supabase.from('tarefas_status').insert(statuses)

  revalidar()
  return sucesso({ id: String(data.id) }, `Lista "${nome}" criada.`)
}

export async function atualizarLista(input: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = listaSchema.required({ id: true }).safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const alvo = await listaVisivel(ctx, parsed.data.id)
  if (!alvo) return falha('Lista não encontrada.')

  const { nome, cor, descricao } = parsed.data
  const { error } = await ctx.supabase
    .from('tarefas_listas')
    .update({ nome, cor, descricao })
    .eq('id', alvo.lista.id)
  if (error) return falha(`Erro ao salvar: ${error.message}`)

  revalidar()
  return sucesso(null, 'Lista atualizada.')
}

export async function excluirLista(input: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(input)
  if (!parsed.success) return falha('Identificador inválido.')

  const alvo = await listaVisivel(ctx, parsed.data)
  if (!alvo) return falha('Lista não encontrada.')
  if (!podeApagarItem(ctx.colab, alvo.lista, alvo.espaco)) {
    return falha('Só administradores, quem criou a lista ou o dono do espaço podem excluí-la.')
  }

  const ids = await idsDeTarefas(ctx.supabase, 'lista_id', alvo.lista.id)
  await removerObjetos(ctx.supabase, await caminhosDeAnexos(ctx.supabase, ids))

  const { error } = await ctx.supabase.from('tarefas_listas').delete().eq('id', alvo.lista.id)
  if (error) return falha(`Erro ao excluir: ${error.message}`)

  revalidar()
  return sucesso(null, `Lista "${alvo.lista.nome}" excluída, com as tarefas dela.`)
}

/**
 * Substitui o conjunto de status de uma lista.
 *
 * Ordem importa: primeiro nascem os novos (para existir destino), depois
 * os existentes são atualizados, as tarefas dos removidos são
 * realocadas, e só então os removidos somem. Nenhuma tarefa fica órfã.
 */
export async function salvarStatuses(input: unknown): Promise<Resultado<Status[]>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = statusesSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const { lista_id, statuses } = parsed.data

  const alvo = await listaVisivel(ctx, lista_id)
  if (!alvo) return falha('Lista não encontrada.')

  const existentes = await getStatuses(lista_id)
  const idsExistentes = new Set(existentes.map((s) => s.id))

  for (const s of statuses) {
    if (s.id && !idsExistentes.has(s.id)) return falha('Um dos status não pertence a esta lista.')
  }

  // 1. Novos.
  const idsFinais: string[] = []
  for (let i = 0; i < statuses.length; i++) {
    const s = statuses[i]
    if (s.id) {
      idsFinais.push(s.id)
      continue
    }
    const { data, error } = await ctx.supabase
      .from('tarefas_status')
      .insert({ lista_id, nome: s.nome, cor: s.cor, tipo: s.tipo, posicao: 1000 + i })
      .select('id')
      .single()
    if (error || !data) {
      if (error?.code === '23505') return falha(`Já existe um status chamado "${s.nome}".`)
      return falha(`Erro ao criar o status "${s.nome}": ${error?.message ?? 'sem retorno'}`)
    }
    idsFinais.push(String(data.id))
  }

  // 2. Existentes: nome, cor, tipo e ordem. Posições temporárias altas
  //    evitam colisão de nome durante a troca (o índice único é por nome,
  //    não por posição, mas a ordem final precisa ficar limpa).
  for (let i = 0; i < statuses.length; i++) {
    const s = statuses[i]
    const { error } = await ctx.supabase
      .from('tarefas_status')
      .update({ nome: s.nome, cor: s.cor, tipo: s.tipo, posicao: i })
      .eq('id', idsFinais[i])
      .eq('lista_id', lista_id)
    if (error) {
      if (error.code === '23505') return falha(`Já existe um status chamado "${s.nome}".`)
      return falha(`Erro ao salvar o status "${s.nome}": ${error.message}`)
    }
  }

  // 3. Removidos: tarefas vão para o primeiro status que sobrou.
  const removidos = existentes.filter((s) => !idsFinais.includes(s.id))
  if (removidos.length > 0) {
    const destino = idsFinais[0]
    for (const s of removidos) {
      const { error } = await ctx.supabase
        .from('tarefas')
        .update({ status_id: destino })
        .eq('status_id', s.id)
      if (error) return falha(`Erro ao realocar tarefas de "${s.nome}": ${error.message}`)
    }
    const { error } = await ctx.supabase
      .from('tarefas_status')
      .delete()
      .in('id', removidos.map((s) => s.id))
    if (error) return falha(`Erro ao remover status: ${error.message}`)
  }

  revalidar()
  return sucesso(await getStatuses(lista_id), 'Status da lista salvos.')
}

// ---------------------------------------------------------------------------
//  CAMPOS PERSONALIZADOS
// ---------------------------------------------------------------------------

export async function salvarCampo(input: unknown): Promise<Resultado<Campo>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = campoSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const { id, espaco_id, lista_id, nome, tipo, opcoes } = parsed.data

  const espaco = await espacoVisivel(ctx.colab, espaco_id)
  if (!espaco) return falha('Espaço não encontrado.')

  if (lista_id) {
    const alvo = await listaVisivel(ctx, lista_id)
    if (!alvo || alvo.espaco.id !== espaco.id) return falha('A lista não pertence a este espaço.')
  }

  const temOpcoes = tipo === 'selecao' || tipo === 'multiselecao'
  const payload = {
    espaco_id: espaco.id,
    lista_id,
    nome,
    tipo,
    opcoes: temOpcoes ? opcoes : [],
  }

  let resultado
  if (id) {
    resultado = await ctx.supabase
      .from('tarefas_campos')
      .update(payload)
      .eq('id', id)
      .eq('espaco_id', espaco.id)
      .select('*')
      .single()
  } else {
    const { data: maxRow } = await ctx.supabase
      .from('tarefas_campos')
      .select('posicao')
      .eq('espaco_id', espaco.id)
      .order('posicao', { ascending: false })
      .limit(1)
      .maybeSingle()

    resultado = await ctx.supabase
      .from('tarefas_campos')
      .insert({ ...payload, posicao: (maxRow?.posicao ?? -1) + 1 })
      .select('*')
      .single()
  }

  if (resultado.error || !resultado.data) {
    return falha(`Erro ao salvar o campo: ${resultado.error?.message ?? 'sem retorno'}`)
  }

  revalidar()
  return sucesso(
    { ...(resultado.data as Campo), opcoes: (resultado.data.opcoes as Campo['opcoes']) ?? [] },
    id ? 'Campo atualizado.' : `Campo "${nome}" criado.`,
  )
}

export async function excluirCampo(input: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(input)
  if (!parsed.success) return falha('Identificador inválido.')

  const { data: campo } = await ctx.supabase
    .from('tarefas_campos')
    .select('id, espaco_id, nome')
    .eq('id', parsed.data)
    .maybeSingle()
  if (!campo) return falha('Campo não encontrado.')

  const espaco = await espacoVisivel(ctx.colab, campo.espaco_id)
  if (!espaco) return falha('Campo não encontrado.')

  const { error } = await ctx.supabase.from('tarefas_campos').delete().eq('id', campo.id)
  if (error) return falha(`Erro ao excluir: ${error.message}`)

  // Os valores gravados nas tarefas ficam no JSON, ignorados pela tela —
  // recriar um campo com o mesmo id não acontece, então não vazam.
  revalidar()
  return sucesso(null, `Campo "${campo.nome}" excluído.`)
}

// ---------------------------------------------------------------------------
//  TAREFAS
// ---------------------------------------------------------------------------

/** Posição no fim de uma coluna do quadro. */
async function proximaPosicao(supabase: SupabaseClient, listaId: string, statusId: string) {
  const { data } = await supabase
    .from('tarefas')
    .select('posicao')
    .eq('lista_id', listaId)
    .eq('status_id', statusId)
    .order('posicao', { ascending: false })
    .limit(1)
    .maybeSingle()
  return Number(data?.posicao ?? 0) + 1024
}

/** Status inicial de uma lista: o primeiro "não iniciado", ou o primeiro. */
function statusInicial(statuses: Status[]): Status | null {
  return statuses.find((s) => s.tipo === 'aberto') ?? statuses[0] ?? null
}

export async function criarTarefa(input: unknown): Promise<Resultado<Tarefa>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = novaTarefaSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const { lista_id, titulo, pai_id, prioridade, data_vencimento, responsaveis, descricao } = parsed.data

  const alvo = await listaVisivel(ctx, lista_id)
  if (!alvo) return falha('Lista não encontrada.')

  const statuses = await getStatuses(lista_id)
  const status = parsed.data.status_id
    ? statuses.find((s) => s.id === parsed.data.status_id)
    : statusInicial(statuses)
  if (!status) return falha('Status inválido para esta lista.')

  if (pai_id) {
    const pai = await getTarefa(pai_id)
    if (!pai || pai.lista_id !== lista_id) return falha('A tarefa-mãe precisa estar na mesma lista.')
    if (pai.pai_id) return falha('Uma subtarefa não pode ter subtarefas.')
  }

  const { data, error } = await ctx.supabase
    .from('tarefas')
    .insert({
      lista_id,
      status_id: status.id,
      pai_id,
      titulo,
      descricao,
      prioridade,
      data_vencimento,
      posicao: await proximaPosicao(ctx.supabase, lista_id, status.id),
      criado_por: ctx.colab.email,
    })
    .select('id')
    .single()

  if (error || !data) return falha(`Erro ao criar a tarefa: ${error?.message ?? 'sem retorno'}`)

  const tarefaId = String(data.id)

  if (responsaveis.length > 0) {
    await ctx.supabase
      .from('tarefas_responsaveis')
      .insert(responsaveis.map((email) => ({ tarefa_id: tarefaId, email })))
  }

  await registrarAtividade(ctx.supabase, tarefaId, ctx.colab.email, 'criou', {
    lista: alvo.lista.nome,
  })

  const tarefa = await getTarefa(tarefaId)
  if (!tarefa) return falha('A tarefa foi criada, mas não pôde ser lida de volta.')

  revalidar()
  return sucesso(tarefa, pai_id ? 'Subtarefa criada.' : 'Tarefa criada.')
}

/** Atualiza um ou mais campos e registra cada mudança no histórico. */
export async function atualizarTarefa(tarefaId: unknown, patchInput: unknown): Promise<Resultado<Tarefa>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const idParsed = uuid.safeParse(tarefaId)
  if (!idParsed.success) return falha('Identificador inválido.')

  const parsed = patchTarefaSchema.safeParse(patchInput)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const atual = await tarefaVisivel(ctx, idParsed.data)
  if (!atual) return falha('Tarefa não encontrada.')

  const patch = parsed.data
  const update: Record<string, unknown> = {}
  const atividades: { tipo: string; detalhe: Record<string, unknown> }[] = []

  if (patch.titulo !== undefined && patch.titulo !== atual.titulo) {
    update.titulo = patch.titulo
    atividades.push({ tipo: 'titulo', detalhe: { de: atual.titulo, para: patch.titulo } })
  }

  if (patch.descricao !== undefined && (patch.descricao ?? '') !== (atual.descricao ?? '')) {
    update.descricao = patch.descricao?.trim() ? patch.descricao : null
    atividades.push({ tipo: 'descricao', detalhe: {} })
  }

  if (patch.status_id !== undefined && patch.status_id !== atual.status_id) {
    const statuses = await getStatuses(atual.lista_id)
    const novo = statuses.find((s) => s.id === patch.status_id)
    if (!novo) return falha('Este status não pertence à lista da tarefa.')
    update.status_id = novo.id
    // Vai para o fim da nova coluna do quadro.
    update.posicao = await proximaPosicao(ctx.supabase, atual.lista_id, novo.id)
    atividades.push({
      tipo: 'status',
      detalhe: { de: atual.status_nome, para: novo.nome, de_cor: atual.status_cor, para_cor: novo.cor },
    })
  }

  if (patch.prioridade !== undefined && patch.prioridade !== atual.prioridade) {
    update.prioridade = patch.prioridade
    atividades.push({
      tipo: 'prioridade',
      detalhe: {
        de: atual.prioridade ? PRIORIDADES[atual.prioridade].rotulo : null,
        para: patch.prioridade ? PRIORIDADES[patch.prioridade as keyof typeof PRIORIDADES].rotulo : null,
      },
    })
  }

  if (patch.data_inicio !== undefined && patch.data_inicio !== atual.data_inicio) {
    update.data_inicio = patch.data_inicio
    atividades.push({ tipo: 'data_inicio', detalhe: { de: atual.data_inicio, para: patch.data_inicio } })
  }

  if (patch.data_vencimento !== undefined && patch.data_vencimento !== atual.data_vencimento) {
    update.data_vencimento = patch.data_vencimento
    atividades.push({
      tipo: 'data_vencimento',
      detalhe: { de: atual.data_vencimento, para: patch.data_vencimento },
    })
  }

  if (patch.estimativa_minutos !== undefined && patch.estimativa_minutos !== atual.estimativa_minutos) {
    update.estimativa_minutos = patch.estimativa_minutos
    atividades.push({
      tipo: 'estimativa',
      detalhe: { de: atual.estimativa_minutos, para: patch.estimativa_minutos },
    })
  }

  if (patch.etiquetas !== undefined) {
    const antes = [...atual.etiquetas].sort().join('|')
    const depois = [...patch.etiquetas].sort().join('|')
    if (antes !== depois) {
      update.etiquetas = patch.etiquetas
      atividades.push({ tipo: 'etiquetas', detalhe: { de: atual.etiquetas, para: patch.etiquetas } })
    }
  }

  if (patch.campo !== undefined) {
    const campos = { ...atual.campos }
    if (patch.campo.valor === null || patch.campo.valor === '' ||
        (Array.isArray(patch.campo.valor) && patch.campo.valor.length === 0)) {
      delete campos[patch.campo.id]
    } else {
      campos[patch.campo.id] = patch.campo.valor
    }
    update.campos = campos
    atividades.push({
      tipo: 'campo',
      detalhe: { campo_id: patch.campo.id, de: atual.campos[patch.campo.id] ?? null, para: patch.campo.valor },
    })
  }

  if (Object.keys(update).length > 0) {
    const { error } = await ctx.supabase.from('tarefas').update(update).eq('id', atual.id)
    if (error) return falha(`Erro ao salvar: ${error.message}`)
  }

  if (patch.responsaveis !== undefined) {
    const antes = new Set(atual.responsaveis)
    const depois = new Set(patch.responsaveis)
    const entram = patch.responsaveis.filter((e) => !antes.has(e))
    const saem = atual.responsaveis.filter((e) => !depois.has(e))

    if (saem.length > 0) {
      await ctx.supabase
        .from('tarefas_responsaveis')
        .delete()
        .eq('tarefa_id', atual.id)
        .in('email', saem)
    }
    if (entram.length > 0) {
      const { error } = await ctx.supabase
        .from('tarefas_responsaveis')
        .insert(entram.map((email) => ({ tarefa_id: atual.id, email })))
      if (error) return falha(`Erro ao salvar responsáveis: ${error.message}`)
    }
    if (entram.length > 0 || saem.length > 0) {
      atividades.push({ tipo: 'responsaveis', detalhe: { entram, saem } })
      // O updated_at só muda por trigger em UPDATE na própria tabela.
      await ctx.supabase.from('tarefas').update({ updated_at: new Date().toISOString() }).eq('id', atual.id)
    }
  }

  for (const a of atividades) {
    await registrarAtividade(ctx.supabase, atual.id, ctx.colab.email, a.tipo, a.detalhe)
  }

  const tarefa = await getTarefa(atual.id)
  if (!tarefa) return falha('A tarefa foi salva, mas não pôde ser lida de volta.')

  revalidar()
  return sucesso(tarefa)
}

/** Arrastar no quadro: muda o status e/ou a posição na coluna. */
export async function moverTarefa(input: unknown): Promise<Resultado<Tarefa>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = moverTarefaSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const atual = await tarefaVisivel(ctx, parsed.data.tarefa_id)
  if (!atual) return falha('Tarefa não encontrada.')

  const statuses = await getStatuses(atual.lista_id)
  const novo = statuses.find((s) => s.id === parsed.data.status_id)
  if (!novo) return falha('Este status não pertence à lista da tarefa.')

  const posicao =
    parsed.data.posicao ?? (await proximaPosicao(ctx.supabase, atual.lista_id, novo.id))

  const { error } = await ctx.supabase
    .from('tarefas')
    .update({ status_id: novo.id, posicao })
    .eq('id', atual.id)
  if (error) return falha(`Erro ao mover: ${error.message}`)

  if (novo.id !== atual.status_id) {
    await registrarAtividade(ctx.supabase, atual.id, ctx.colab.email, 'status', {
      de: atual.status_nome,
      para: novo.nome,
      de_cor: atual.status_cor,
      para_cor: novo.cor,
    })
  }

  const tarefa = await getTarefa(atual.id)
  if (!tarefa) return falha('A tarefa foi movida, mas não pôde ser lida de volta.')

  revalidar()
  return sucesso(tarefa)
}

/** Leva a tarefa (e as subtarefas) para outra lista, mapeando o status pelo nome. */
export async function moverParaLista(input: unknown): Promise<Resultado<Tarefa>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = moverParaListaSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const atual = await tarefaVisivel(ctx, parsed.data.tarefa_id)
  if (!atual) return falha('Tarefa não encontrada.')
  if (atual.pai_id) return falha('Mova a tarefa-mãe: a subtarefa vai junto.')
  if (atual.lista_id === parsed.data.lista_id) return sucesso(atual)

  const destino = await listaVisivel(ctx, parsed.data.lista_id)
  if (!destino) return falha('Lista de destino não encontrada.')

  const statuses = await getStatuses(destino.lista.id)
  const status =
    statuses.find((s) => s.nome.toLowerCase() === atual.status_nome.toLowerCase()) ??
    statusInicial(statuses)
  if (!status) return falha('A lista de destino não tem status.')

  const { error } = await ctx.supabase.rpc('tarefas_mover_lista', {
    p_tarefa: atual.id,
    p_lista: destino.lista.id,
    p_status: status.id,
  })
  if (error) return falha(`Erro ao mover: ${error.message}`)

  await registrarAtividade(ctx.supabase, atual.id, ctx.colab.email, 'lista', {
    de: atual.lista_nome,
    para: destino.lista.nome,
  })

  const tarefa = await getTarefa(atual.id)
  if (!tarefa) return falha('A tarefa foi movida, mas não pôde ser lida de volta.')

  revalidar()
  return sucesso(tarefa, `Movida para "${destino.lista.nome}".`)
}

export async function duplicarTarefa(input: unknown): Promise<Resultado<Tarefa>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(input)
  if (!parsed.success) return falha('Identificador inválido.')

  const origem = await tarefaVisivel(ctx, parsed.data)
  if (!origem) return falha('Tarefa não encontrada.')

  const { data, error } = await ctx.supabase
    .from('tarefas')
    .insert({
      lista_id: origem.lista_id,
      status_id: origem.status_id,
      pai_id: origem.pai_id,
      titulo: `${origem.titulo} (cópia)`,
      descricao: origem.descricao,
      prioridade: origem.prioridade,
      data_inicio: origem.data_inicio,
      data_vencimento: origem.data_vencimento,
      estimativa_minutos: origem.estimativa_minutos,
      etiquetas: origem.etiquetas,
      campos: origem.campos,
      posicao: origem.posicao + 0.5,
      criado_por: ctx.colab.email,
    })
    .select('id')
    .single()
  if (error || !data) return falha(`Erro ao duplicar: ${error?.message ?? 'sem retorno'}`)

  const novoId = String(data.id)

  if (origem.responsaveis.length > 0) {
    await ctx.supabase
      .from('tarefas_responsaveis')
      .insert(origem.responsaveis.map((email) => ({ tarefa_id: novoId, email })))
  }

  const { data: itens } = await ctx.supabase
    .from('tarefas_checklist')
    .select('texto, posicao')
    .eq('tarefa_id', origem.id)
  if (itens && itens.length > 0) {
    await ctx.supabase
      .from('tarefas_checklist')
      .insert(itens.map((i) => ({ tarefa_id: novoId, texto: i.texto, posicao: i.posicao, feito: false })))
  }

  await registrarAtividade(ctx.supabase, novoId, ctx.colab.email, 'criou', {
    lista: origem.lista_nome,
    copia_de: origem.titulo,
  })

  const tarefa = await getTarefa(novoId)
  if (!tarefa) return falha('A cópia foi criada, mas não pôde ser lida de volta.')

  revalidar()
  return sucesso(tarefa, 'Tarefa duplicada.')
}

export async function excluirTarefa(input: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(input)
  if (!parsed.success) return falha('Identificador inválido.')

  const tarefa = await tarefaVisivel(ctx, parsed.data)
  if (!tarefa) return falha('Tarefa não encontrada.')

  const { data: filhas } = await ctx.supabase.from('tarefas').select('id').eq('pai_id', tarefa.id)
  const ids = [tarefa.id, ...(filhas ?? []).map((f) => String(f.id))]
  await removerObjetos(ctx.supabase, await caminhosDeAnexos(ctx.supabase, ids))

  const { error } = await ctx.supabase.from('tarefas').delete().eq('id', tarefa.id)
  if (error) return falha(`Erro ao excluir: ${error.message}`)

  revalidar()
  return sucesso(null, 'Tarefa excluída.')
}

/** Carga completa do modal. Usada pelo cliente ao abrir ?t=<id>. */
export async function carregarTarefa(input: unknown): Promise<Resultado<TarefaDetalhe>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(input)
  if (!parsed.success) return falha('Identificador inválido.')

  const detalhe = await getTarefaDetalhe(parsed.data, ctx.colab)
  if (!detalhe) return falha('Tarefa não encontrada — pode ter sido excluída.')

  return sucesso(detalhe)
}

// ---------------------------------------------------------------------------
//  CHECKLIST
// ---------------------------------------------------------------------------

async function itemVisivel(ctx: Contexto, itemId: string) {
  const { data } = await ctx.supabase
    .from('tarefas_checklist')
    .select('*')
    .eq('id', itemId)
    .maybeSingle()
  if (!data) return null
  const tarefa = await tarefaVisivel(ctx, String(data.tarefa_id))
  return tarefa ? (data as ItemChecklist) : null
}

export async function adicionarItemChecklist(input: unknown): Promise<Resultado<ItemChecklist>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = checklistItemSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const tarefa = await tarefaVisivel(ctx, parsed.data.tarefa_id)
  if (!tarefa) return falha('Tarefa não encontrada.')

  const { data: maxRow } = await ctx.supabase
    .from('tarefas_checklist')
    .select('posicao')
    .eq('tarefa_id', tarefa.id)
    .order('posicao', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await ctx.supabase
    .from('tarefas_checklist')
    .insert({ tarefa_id: tarefa.id, texto: parsed.data.texto, posicao: (maxRow?.posicao ?? -1) + 1 })
    .select('*')
    .single()
  if (error || !data) return falha(`Erro ao adicionar: ${error?.message ?? 'sem retorno'}`)

  revalidar()
  return sucesso(data as ItemChecklist)
}

export async function alternarItemChecklist(itemId: unknown, feito: unknown): Promise<Resultado<ItemChecklist>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(itemId)
  if (!parsed.success || typeof feito !== 'boolean') return falha('Dados inválidos.')

  const item = await itemVisivel(ctx, parsed.data)
  if (!item) return falha('Item não encontrado.')

  const { data, error } = await ctx.supabase
    .from('tarefas_checklist')
    .update({ feito })
    .eq('id', item.id)
    .select('*')
    .single()
  if (error || !data) return falha(`Erro ao salvar: ${error?.message ?? 'sem retorno'}`)

  revalidar()
  return sucesso(data as ItemChecklist)
}

export async function excluirItemChecklist(itemId: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(itemId)
  if (!parsed.success) return falha('Identificador inválido.')

  const item = await itemVisivel(ctx, parsed.data)
  if (!item) return falha('Item não encontrado.')

  const { error } = await ctx.supabase.from('tarefas_checklist').delete().eq('id', item.id)
  if (error) return falha(`Erro ao excluir: ${error.message}`)

  revalidar()
  return sucesso(null)
}

// ---------------------------------------------------------------------------
//  COMENTÁRIOS
// ---------------------------------------------------------------------------

export async function comentar(input: unknown): Promise<Resultado<Comentario>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = comentarioSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const tarefa = await tarefaVisivel(ctx, parsed.data.tarefa_id)
  if (!tarefa) return falha('Tarefa não encontrada.')

  const { data, error } = await ctx.supabase
    .from('tarefas_comentarios')
    .insert({ tarefa_id: tarefa.id, autor: ctx.colab.email, texto: parsed.data.texto })
    .select('*')
    .single()
  if (error || !data) return falha(`Erro ao comentar: ${error?.message ?? 'sem retorno'}`)

  await ctx.supabase.from('tarefas').update({ updated_at: new Date().toISOString() }).eq('id', tarefa.id)

  revalidar()
  return sucesso(data as Comentario)
}

export async function editarComentario(comentarioId: unknown, texto: unknown): Promise<Resultado<Comentario>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const idParsed = uuid.safeParse(comentarioId)
  const textoParsed = comentarioSchema.shape.texto.safeParse(texto)
  if (!idParsed.success || !textoParsed.success) return falha('Dados inválidos.')

  const { data: atual } = await ctx.supabase
    .from('tarefas_comentarios')
    .select('*')
    .eq('id', idParsed.data)
    .maybeSingle()
  if (!atual) return falha('Comentário não encontrado.')
  if (!podeEditarComentario(ctx.colab, String(atual.autor))) return falha('Só quem escreveu pode editar.')

  const { data, error } = await ctx.supabase
    .from('tarefas_comentarios')
    .update({ texto: textoParsed.data })
    .eq('id', atual.id)
    .select('*')
    .single()
  if (error || !data) return falha(`Erro ao salvar: ${error?.message ?? 'sem retorno'}`)

  revalidar()
  return sucesso(data as Comentario)
}

export async function excluirComentario(comentarioId: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(comentarioId)
  if (!parsed.success) return falha('Identificador inválido.')

  const { data: atual } = await ctx.supabase
    .from('tarefas_comentarios')
    .select('id, autor, tarefa_id')
    .eq('id', parsed.data)
    .maybeSingle()
  if (!atual) return falha('Comentário não encontrado.')

  const tarefa = await tarefaVisivel(ctx, String(atual.tarefa_id))
  if (!tarefa) return falha('Comentário não encontrado.')
  if (!podeApagarComentario(ctx.colab, String(atual.autor))) {
    return falha('Só quem escreveu, ou um administrador, pode excluir.')
  }

  const { error } = await ctx.supabase.from('tarefas_comentarios').delete().eq('id', atual.id)
  if (error) return falha(`Erro ao excluir: ${error.message}`)

  revalidar()
  return sucesso(null)
}

// ---------------------------------------------------------------------------
//  ANEXOS
//  O arquivo vai do navegador DIRETO para o bucket, por uma URL assinada
//  que só o servidor consegue gerar. Assim o upload não passa pela
//  Vercel (que limita o corpo a 4,5 MB) e o bucket continua sem policy.
// ---------------------------------------------------------------------------

function nomeSeguro(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
  return limpo || 'arquivo'
}

export async function pedirUploadDeAnexo(
  input: unknown,
): Promise<Resultado<{ caminho: string; token: string }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = anexoPedidoSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const tarefa = await tarefaVisivel(ctx, parsed.data.tarefa_id)
  if (!tarefa) return falha('Tarefa não encontrada.')

  const caminho = `${tarefa.espaco_id}/${tarefa.id}/${randomUUID()}-${nomeSeguro(parsed.data.nome)}`

  const { data, error } = await ctx.supabase.storage
    .from(BUCKET_ANEXOS)
    .createSignedUploadUrl(caminho)

  if (error || !data) {
    return falha(
      `Não foi possível preparar o upload: ${error?.message ?? 'sem retorno'}. ` +
        'Confira se o bucket "tarefas-anexos" existe no Supabase (migration 0006).',
    )
  }

  return sucesso({ caminho: data.path, token: data.token })
}

export async function registrarAnexo(input: unknown): Promise<Resultado<Anexo>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = anexoRegistroSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const { tarefa_id, caminho, nome, tipo_mime, tamanho } = parsed.data

  const tarefa = await tarefaVisivel(ctx, tarefa_id)
  if (!tarefa) return falha('Tarefa não encontrada.')

  // O caminho tem que ser o que ESTE servidor gerou para ESTA tarefa —
  // e o arquivo precisa existir de fato no bucket.
  if (!caminho.startsWith(`${tarefa.espaco_id}/${tarefa.id}/`)) return falha('Caminho inválido.')

  const { data: assinada, error: erroAssinatura } = await ctx.supabase.storage
    .from(BUCKET_ANEXOS)
    .createSignedUrl(caminho, 60 * 60)
  if (erroAssinatura || !assinada) return falha('O arquivo não chegou ao servidor. Tente de novo.')

  const { data, error } = await ctx.supabase
    .from('tarefas_anexos')
    .insert({ tarefa_id, caminho, nome, tipo_mime, tamanho, enviado_por: ctx.colab.email })
    .select('*')
    .single()
  if (error || !data) return falha(`Erro ao registrar o anexo: ${error?.message ?? 'sem retorno'}`)

  await registrarAtividade(ctx.supabase, tarefa.id, ctx.colab.email, 'anexo', { nome })
  await ctx.supabase.from('tarefas').update({ updated_at: new Date().toISOString() }).eq('id', tarefa.id)

  revalidar()
  return sucesso({ ...(data as Omit<Anexo, 'url'>), url: assinada.signedUrl })
}

export async function excluirAnexo(anexoId: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = uuid.safeParse(anexoId)
  if (!parsed.success) return falha('Identificador inválido.')

  const { data: anexo } = await ctx.supabase
    .from('tarefas_anexos')
    .select('*')
    .eq('id', parsed.data)
    .maybeSingle()
  if (!anexo) return falha('Anexo não encontrado.')

  const tarefa = await tarefaVisivel(ctx, String(anexo.tarefa_id))
  if (!tarefa) return falha('Anexo não encontrado.')

  await removerObjetos(ctx.supabase, [String(anexo.caminho)])

  const { error } = await ctx.supabase.from('tarefas_anexos').delete().eq('id', anexo.id)
  if (error) return falha(`Erro ao excluir: ${error.message}`)

  await registrarAtividade(ctx.supabase, tarefa.id, ctx.colab.email, 'anexo_removido', {
    nome: anexo.nome,
  })

  revalidar()
  return sucesso(null)
}
