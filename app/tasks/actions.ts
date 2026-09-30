'use server'

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getColaborador, type Colaborador } from '@/lib/auth'
import { decryptSecret, encryptSecret, isVaultEncryptionConfigured } from '@/lib/crypto'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import {
  baixarIcsGoogle,
  esquecerAvatar,
  getPreferenciasBrutas,
  getReunioesGoogle,
  getStatuses,
  getTarefa,
  getTarefaDetalhe,
} from '@/lib/tasks/data'
import { enderecoGoogleValido, extrairEventos, type EventoAgenda } from '@/lib/tasks/ics'
import { diferencaDias, hojeISO, somarDias } from '@/lib/tasks/datas'
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
  avatarPedidoSchema,
  avatarRegistroSchema,
  campoSchema,
  checklistItemSchema,
  comentarioSchema,
  equipeSchema,
  espacoSchema,
  favoritoSchema,
  gestorSchema,
  listaSchema,
  moverParaListaSchema,
  moverTarefaSchema,
  novaTarefaSchema,
  pastaSchema,
  patchTarefaSchema,
  perfilSchema,
  pessoaAdminSchema,
  primeiraMensagem,
  statusesSchema,
  uuid,
  periodoSchema,
} from '@/lib/tasks/schemas'
import type {
  Anexo,
  Atividade,
  Campo,
  Comentario,
  Equipe,
  Espaco,
  ItemChecklist,
  PreferenciasTasks,
  Resultado,
  Status,
  Tarefa,
  TarefaAtualizada,
  TarefaDetalhe,
} from '@/lib/tasks/types'
import { BUCKET_ANEXOS, BUCKET_AVATARES, PRIORIDADES } from '@/lib/tasks/types'

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

/**
 * Revalida as telas do módulo. Só nas ações de ESTRUTURA (espaços,
 * pastas, listas, status, campos, exclusão e mudança de lista): a chamada
 * faz o Next devolver a tela nova junto com a resposta. Nas ações
 * frequentes (status, datas, comentários...) ela não entra: o navegador
 * atualiza a própria cópia com o que a ação devolve.
 */
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

/**
 * Espaço privado: só consulta a lista de membros quando precisa. Admin,
 * dono e espaço público passam sem ir ao banco.
 */
async function podeVer(
  ctx: Contexto,
  espaco: { id: string; privado: boolean; criado_por: string | null },
): Promise<boolean> {
  if (!espaco.privado || ctx.colab.papel === 'admin' || espaco.criado_por === ctx.colab.email) return true
  const { data } = await ctx.supabase
    .from('tarefas_espaco_membros')
    .select('email')
    .eq('espaco_id', espaco.id)
    .eq('email', ctx.colab.email)
    .maybeSingle()
  return Boolean(data)
}

/** O espaço, se a pessoa pode vê-lo. Uma consulta; duas se for privado. */
async function espacoVisivel(ctx: Contexto, espacoId: string): Promise<(Espaco & EspacoAcesso) | null> {
  const { data } = await ctx.supabase.from('tarefas_espacos').select('*').eq('id', espacoId).maybeSingle()
  if (!data) return null
  const espaco = data as Espaco
  if (!(await podeVer(ctx, espaco))) return null
  return { ...espaco, membros: espaco.privado ? [ctx.colab.email] : [] }
}

interface ListaBasica {
  id: string
  espaco_id: string
  pasta_id: string | null
  nome: string
  criado_por: string | null
}

/** A lista e o espaço dela numa consulta só, se a pessoa pode vê-los. */
async function listaVisivel(
  ctx: Contexto,
  listaId: string,
): Promise<{ lista: ListaBasica; espaco: Espaco & EspacoAcesso } | null> {
  const { data } = await ctx.supabase
    .from('tarefas_listas')
    .select('id, espaco_id, pasta_id, nome, criado_por, espaco:tarefas_espacos!inner(*)')
    .eq('id', listaId)
    .maybeSingle()
  if (!data) return null

  const bruto = data as unknown as ListaBasica & { espaco: Espaco | Espaco[] }
  const espaco = Array.isArray(bruto.espaco) ? bruto.espaco[0] : bruto.espaco
  if (!espaco || !(await podeVer(ctx, espaco))) return null

  return {
    lista: { id: bruto.id, espaco_id: bruto.espaco_id, pasta_id: bruto.pasta_id, nome: bruto.nome, criado_por: bruto.criado_por },
    espaco: { ...espaco, membros: espaco.privado ? [ctx.colab.email] : [] },
  }
}

/** A tarefa (da view), se a pessoa pode ver o espaço dela. Espaço público não custa consulta extra. */
async function tarefaVisivel(ctx: Contexto, tarefaId: string): Promise<Tarefa | null> {
  const tarefa = await getTarefa(tarefaId)
  if (!tarefa) return null
  if (!tarefa.espaco_privado || ctx.colab.papel === 'admin') return tarefa
  const espaco = await espacoVisivel(ctx, tarefa.espaco_id)
  return espaco ? tarefa : null
}

/** Grava várias linhas de histórico de uma vez e devolve o que gravou. */
async function registrarAtividades(
  supabase: SupabaseClient,
  tarefaId: string,
  autor: string,
  itens: { tipo: string; detalhe: Record<string, unknown> }[],
): Promise<Atividade[]> {
  if (itens.length === 0) return []
  const { data } = await supabase
    .from('tarefas_atividades')
    .insert(itens.map((i) => ({ tarefa_id: tarefaId, autor, tipo: i.tipo, detalhe: i.detalhe })))
    .select('*')
  return (data ?? []) as Atividade[]
}

async function registrarAtividade(
  supabase: SupabaseClient,
  tarefaId: string,
  autor: string,
  tipo: string,
  detalhe: Record<string, unknown> = {},
) {
  await registrarAtividades(supabase, tarefaId, autor, [{ tipo, detalhe }])
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

  const { nome, cor, privado, membros, visualizacao_padrao } = parsed.data

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
      visualizacao_padrao,
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

  const { id, nome, cor, privado, membros, visualizacao_padrao } = parsed.data

  const espaco = await espacoVisivel(ctx, id)
  if (!espaco) return falha('Espaço não encontrado.')
  if (!podeAdministrarEspaco(ctx.colab, espaco)) {
    return falha('Só administradores ou quem criou o espaço podem alterá-lo.')
  }

  const { error } = await ctx.supabase
    .from('tarefas_espacos')
    .update({ nome, cor, privado, visualizacao_padrao })
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

  const espaco = await espacoVisivel(ctx, parsed.data)
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

  const espaco = await espacoVisivel(ctx, parsed.data.espaco_id)
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

  const espaco = await espacoVisivel(ctx, parsed.data.espaco_id)
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

  const espaco = await espacoVisivel(ctx, pasta.espaco_id)
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

  const { espaco_id, pasta_id, nome, cor, descricao, visualizacao_padrao } = parsed.data

  const espaco = await espacoVisivel(ctx, espaco_id)
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
      visualizacao_padrao,
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

  const { nome, cor, descricao, visualizacao_padrao } = parsed.data
  const { error } = await ctx.supabase
    .from('tarefas_listas')
    .update({ nome, cor, descricao, visualizacao_padrao })
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

  const espaco = await espacoVisivel(ctx, espaco_id)
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

  const espaco = await espacoVisivel(ctx, campo.espaco_id)
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

  return sucesso(tarefa, pai_id ? 'Subtarefa criada.' : 'Tarefa criada.')
}

function rotuloPrioridade(p: Tarefa['prioridade']): string | null {
  return p ? PRIORIDADES[p].rotulo : null
}

/**
 * Atualiza um ou mais campos e registra cada mudança no histórico.
 *
 * Poucas idas ao banco de propósito: lê a tarefa, grava, relê, anota o
 * histórico. O status é validado pela própria chave composta da tabela
 * (um status de outra lista é recusado pelo banco), e o histórico é
 * escrito comparando o antes e o depois, numa inserção só.
 */
export async function atualizarTarefa(tarefaId: unknown, patchInput: unknown): Promise<Resultado<TarefaAtualizada>> {
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

  if (patch.titulo !== undefined && patch.titulo !== atual.titulo) update.titulo = patch.titulo
  if (patch.descricao !== undefined && (patch.descricao ?? '') !== (atual.descricao ?? '')) {
    update.descricao = patch.descricao?.trim() ? patch.descricao : null
  }
  if (patch.status_id !== undefined && patch.status_id !== atual.status_id) {
    update.status_id = patch.status_id
    // Vai para o fim da nova coluna do quadro.
    update.posicao = await proximaPosicao(ctx.supabase, atual.lista_id, patch.status_id)
  }
  if (patch.prioridade !== undefined && patch.prioridade !== atual.prioridade) update.prioridade = patch.prioridade
  if (patch.data_inicio !== undefined && patch.data_inicio !== atual.data_inicio) update.data_inicio = patch.data_inicio
  if (patch.data_vencimento !== undefined && patch.data_vencimento !== atual.data_vencimento) {
    update.data_vencimento = patch.data_vencimento
  }
  if (patch.estimativa_minutos !== undefined && patch.estimativa_minutos !== atual.estimativa_minutos) {
    update.estimativa_minutos = patch.estimativa_minutos
  }
  if (patch.etiquetas !== undefined) {
    const antes = [...atual.etiquetas].sort().join('|')
    const depois = [...patch.etiquetas].sort().join('|')
    if (antes !== depois) update.etiquetas = patch.etiquetas
  }
  if (patch.campo !== undefined) {
    const campos = { ...atual.campos }
    const v = patch.campo.valor
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete campos[patch.campo.id]
    else campos[patch.campo.id] = v
    update.campos = campos
  }
  if (patch.reuniao_url !== undefined && (patch.reuniao_url ?? null) !== (atual.reuniao_url ?? null)) {
    update.reuniao_url = patch.reuniao_url || null
  }
  if (patch.links !== undefined && JSON.stringify(patch.links) !== JSON.stringify(atual.links)) {
    update.links = patch.links
  }

  // Responsáveis vivem em outra tabela: ajusta primeiro, e a atualização
  // da tarefa logo abaixo já carimba o updated_at.
  let entram: string[] = []
  let saem: string[] = []
  if (patch.responsaveis !== undefined) {
    const antes = new Set(atual.responsaveis)
    const depois = new Set(patch.responsaveis)
    entram = patch.responsaveis.filter((e) => !antes.has(e))
    saem = atual.responsaveis.filter((e) => !depois.has(e))

    if (saem.length > 0) {
      await ctx.supabase.from('tarefas_responsaveis').delete().eq('tarefa_id', atual.id).in('email', saem)
    }
    if (entram.length > 0) {
      const { error } = await ctx.supabase
        .from('tarefas_responsaveis')
        .insert(entram.map((email) => ({ tarefa_id: atual.id, email })))
      if (error) return falha(`Erro ao salvar responsáveis: ${error.message}`)
    }
    if ((entram.length > 0 || saem.length > 0) && Object.keys(update).length === 0) {
      update.updated_at = new Date().toISOString()
    }
  }

  if (Object.keys(update).length > 0) {
    const { error } = await ctx.supabase.from('tarefas').update(update).eq('id', atual.id)
    if (error) {
      if (error.code === '23503') return falha('Este status não pertence à lista da tarefa.')
      return falha(`Erro ao salvar: ${error.message}`)
    }
  }

  const tarefa = await getTarefa(atual.id)
  if (!tarefa) return falha('A tarefa foi salva, mas não pôde ser lida de volta.')

  const itens: { tipo: string; detalhe: Record<string, unknown> }[] = []
  if (update.titulo !== undefined) itens.push({ tipo: 'titulo', detalhe: { de: atual.titulo, para: tarefa.titulo } })
  if (update.descricao !== undefined) itens.push({ tipo: 'descricao', detalhe: {} })
  if (update.status_id !== undefined) {
    itens.push({
      tipo: 'status',
      detalhe: { de: atual.status_nome, para: tarefa.status_nome, de_cor: atual.status_cor, para_cor: tarefa.status_cor },
    })
  }
  if (update.prioridade !== undefined) {
    itens.push({ tipo: 'prioridade', detalhe: { de: rotuloPrioridade(atual.prioridade), para: rotuloPrioridade(tarefa.prioridade) } })
  }
  if (update.data_inicio !== undefined) itens.push({ tipo: 'data_inicio', detalhe: { de: atual.data_inicio, para: tarefa.data_inicio } })
  if (update.data_vencimento !== undefined) {
    itens.push({ tipo: 'data_vencimento', detalhe: { de: atual.data_vencimento, para: tarefa.data_vencimento } })
  }
  if (update.estimativa_minutos !== undefined) {
    itens.push({ tipo: 'estimativa', detalhe: { de: atual.estimativa_minutos, para: tarefa.estimativa_minutos } })
  }
  if (update.etiquetas !== undefined) itens.push({ tipo: 'etiquetas', detalhe: { de: atual.etiquetas, para: tarefa.etiquetas } })
  if (update.reuniao_url !== undefined) itens.push({ tipo: 'reuniao', detalhe: { de: atual.reuniao_url, para: tarefa.reuniao_url } })
  if (update.links !== undefined) itens.push({ tipo: 'links', detalhe: { de: atual.links.length, para: tarefa.links.length } })
  if (update.campos !== undefined && patch.campo) {
    itens.push({ tipo: 'campo', detalhe: { campo_id: patch.campo.id, de: atual.campos[patch.campo.id] ?? null, para: patch.campo.valor } })
  }
  if (entram.length > 0 || saem.length > 0) itens.push({ tipo: 'responsaveis', detalhe: { entram, saem } })

  const atividades = await registrarAtividades(ctx.supabase, atual.id, ctx.colab.email, itens)

  return sucesso({ tarefa, atividades })
}

/** Arrastar no quadro: muda o status e/ou a posição na coluna. */
export async function moverTarefa(input: unknown): Promise<Resultado<TarefaAtualizada>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = moverTarefaSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const atual = await tarefaVisivel(ctx, parsed.data.tarefa_id)
  if (!atual) return falha('Tarefa não encontrada.')

  const posicao =
    parsed.data.posicao ?? (await proximaPosicao(ctx.supabase, atual.lista_id, parsed.data.status_id))

  const { error } = await ctx.supabase
    .from('tarefas')
    .update({ status_id: parsed.data.status_id, posicao })
    .eq('id', atual.id)
  if (error) {
    if (error.code === '23503') return falha('Este status não pertence à lista da tarefa.')
    return falha(`Erro ao mover: ${error.message}`)
  }

  const tarefa = await getTarefa(atual.id)
  if (!tarefa) return falha('A tarefa foi movida, mas não pôde ser lida de volta.')

  const atividades =
    tarefa.status_id !== atual.status_id
      ? await registrarAtividades(ctx.supabase, atual.id, ctx.colab.email, [
          {
            tipo: 'status',
            detalhe: { de: atual.status_nome, para: tarefa.status_nome, de_cor: atual.status_cor, para_cor: tarefa.status_cor },
          },
        ])
      : []

  return sucesso({ tarefa, atividades })
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

  return sucesso(null)
}

// ---------------------------------------------------------------------------
//  PREFERÊNCIAS — agenda assinável e Google Calendar
// ---------------------------------------------------------------------------

function agendaUrl(origem: string, token: string | null): string | null {
  return token ? `${origem}/api/tasks/agenda/${token}.ics` : null
}

async function origemDaRequisicao(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const protocolo = h.get('x-forwarded-proto') ?? 'https'
  return `${protocolo}://${host}`
}

/** As preferências da pessoa logada; cria o endereço da agenda na primeira vez. */
export async function obterPreferencias(): Promise<Resultado<PreferenciasTasks>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  let pref = await getPreferenciasBrutas(ctx.colab.email)
  if (!pref?.agenda_token) {
    const token = randomBytes(24).toString('base64url')
    const { data, error } = await ctx.supabase
      .from('tarefas_preferencias')
      .upsert({ email: ctx.colab.email, agenda_token: token }, { onConflict: 'email' })
      .select('*')
      .single()
    if (error || !data) return falha(`Erro ao preparar a agenda: ${error?.message ?? 'sem retorno'}`)
    pref = data as typeof pref
  }

  return sucesso({
    agenda_url: agendaUrl(await origemDaRequisicao(), pref?.agenda_token ?? null),
    google_calendar_conectado: Boolean(pref?.google_ics_cifrado),
  })
}

/** Troca o segredo da agenda: o endereço antigo para de funcionar na hora. */
export async function renovarAgenda(): Promise<Resultado<PreferenciasTasks>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const token = randomBytes(24).toString('base64url')
  const { data, error } = await ctx.supabase
    .from('tarefas_preferencias')
    .upsert({ email: ctx.colab.email, agenda_token: token }, { onConflict: 'email' })
    .select('*')
    .single()
  if (error || !data) return falha(`Erro ao renovar: ${error?.message ?? 'sem retorno'}`)

  return sucesso(
    { agenda_url: agendaUrl(await origemDaRequisicao(), token), google_calendar_conectado: Boolean(data.google_ics_cifrado) },
    'Endereço novo gerado. O antigo deixou de funcionar.',
  )
}

/**
 * Guarda (cifrado) o endereço iCal secreto do Google Calendar da pessoa,
 * depois de confirmar que ele responde. null remove a conexão.
 */
export async function salvarGoogleIcs(input: unknown): Promise<Resultado<{ conectado: boolean; eventos30d: number }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  if (input === null || input === '') {
    const { error } = await ctx.supabase
      .from('tarefas_preferencias')
      .upsert({ email: ctx.colab.email, google_ics_cifrado: null }, { onConflict: 'email' })
    if (error) return falha(`Erro ao desconectar: ${error.message}`)
    return sucesso({ conectado: false, eventos30d: 0 }, 'Google Calendar desconectado.')
  }

  const url = typeof input === 'string' ? input.trim() : ''
  if (!enderecoGoogleValido(url)) {
    return falha(
      'Este não parece ser o endereço secreto iCal do Google Calendar. Ele começa com https://calendar.google.com/calendar/ical/ e termina em .ics.',
    )
  }
  if (!isVaultEncryptionConfigured()) {
    return falha('O Hub precisa de VAULT_ENCRYPTION_KEY configurada para guardar este endereço com segurança.')
  }

  const texto = await baixarIcsGoogle(url, false)
  if (!texto) return falha('O Google não respondeu a esse endereço. Confira se copiou o link inteiro.')

  let eventos30d = 0
  try {
    const hoje = hojeISO()
    eventos30d = extrairEventos(texto, hoje, somarDias(hoje, 30)).length
  } catch {
    return falha('O arquivo do Google veio num formato que não consegui ler.')
  }

  const { error } = await ctx.supabase
    .from('tarefas_preferencias')
    .upsert({ email: ctx.colab.email, google_ics_cifrado: encryptSecret(url) }, { onConflict: 'email' })
  if (error) return falha(`Erro ao salvar: ${error.message}`)

  // Confirma que o que foi guardado abre de volta.
  const pref = await getPreferenciasBrutas(ctx.colab.email)
  if (decryptSecret(pref?.google_ics_cifrado) !== url) return falha('Falha ao conferir o endereço guardado.')

  revalidatePath('/tasks')
  return sucesso({ conectado: true, eventos30d }, `Google Calendar conectado: ${eventos30d} evento(s) nos próximos 30 dias.`)
}

/** Reuniões do Google Calendar da pessoa logada, para a Agenda do Início. */
export async function reunioesGoogle(input: unknown): Promise<Resultado<{ conectado: boolean; eventos: EventoAgenda[] }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = periodoSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))
  const { inicio, fim } = parsed.data
  if (diferencaDias(inicio, fim) > 62) return falha('Período grande demais.')

  const pref = await getPreferenciasBrutas(ctx.colab.email)
  if (!pref?.google_ics_cifrado) return sucesso({ conectado: false, eventos: [] })

  return sucesso({ conectado: true, eventos: await getReunioesGoogle(ctx.colab.email, inicio, fim) })
}

// ---------------------------------------------------------------------------
//  FAVORITOS — espaços e listas fixados na barra lateral
// ---------------------------------------------------------------------------

/** Fixa ou solta um espaço/lista. Devolve como ficou. */
export async function alternarFavorito(input: unknown): Promise<Resultado<{ favorito: boolean }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = favoritoSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))
  const { tipo, item_id } = parsed.data

  const visivel = tipo === 'espaco' ? await espacoVisivel(ctx, item_id) : await listaVisivel(ctx, item_id)
  if (!visivel) return falha('Item não encontrado.')

  const chave = { email: ctx.colab.email, tipo, item_id }
  const { data: existe } = await ctx.supabase.from('tarefas_favoritos').select('item_id').match(chave).maybeSingle()

  if (existe) {
    const { error } = await ctx.supabase.from('tarefas_favoritos').delete().match(chave)
    if (error) return falha(`Erro ao remover dos favoritos: ${error.message}`)
    revalidar()
    return sucesso({ favorito: false })
  }

  const { error } = await ctx.supabase.from('tarefas_favoritos').insert(chave)
  if (error) return falha(`Erro ao favoritar: ${error.message}`)
  revalidar()
  return sucesso({ favorito: true })
}

// ---------------------------------------------------------------------------
//  PERFIL — o que a própria pessoa edita: nome, cargo e foto
// ---------------------------------------------------------------------------

/** Pasta da pessoa no bucket de fotos: derivada do e-mail, sem expô-lo no caminho. */
function pastaDeAvatar(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 24)
}

export async function salvarPerfil(input: unknown): Promise<Resultado<{ nome: string; cargo: string | null }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = perfilSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))
  const { nome, cargo } = parsed.data

  const { error: erroNome } = await ctx.supabase
    .from('colaboradores_autorizados')
    .update({ nome })
    .ilike('email', ctx.colab.email)
  if (erroNome) return falha(`Erro ao salvar o nome: ${erroNome.message}`)

  const { error: erroPerfil } = await ctx.supabase
    .from('colaboradores_perfis')
    .upsert({ email: ctx.colab.email, cargo: cargo || null }, { onConflict: 'email' })
  if (erroPerfil) return falha(`Erro ao salvar o perfil: ${erroPerfil.message}`)

  revalidatePath('/', 'layout')
  return sucesso({ nome, cargo: cargo || null }, 'Perfil salvo.')
}

/** URL assinada para o navegador subir a foto direto no bucket privado. */
export async function pedirUploadDeAvatar(input: unknown): Promise<Resultado<{ caminho: string; token: string }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = avatarPedidoSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))

  const ext = parsed.data.tipo_mime === 'image/png' ? 'png' : parsed.data.tipo_mime === 'image/webp' ? 'webp' : 'jpg'
  const caminho = `${pastaDeAvatar(ctx.colab.email)}/${randomUUID()}.${ext}`

  const { data, error } = await ctx.supabase.storage.from(BUCKET_AVATARES).createSignedUploadUrl(caminho)
  if (error || !data) {
    return falha(
      `Não foi possível preparar o envio: ${error?.message ?? 'sem retorno'}. ` +
        'Confira se o bucket "avatares" existe no Supabase (migration 0009).',
    )
  }
  return sucesso({ caminho: data.path, token: data.token })
}

/** Depois do upload: confere que a foto chegou, troca no perfil e apaga a anterior. */
export async function registrarAvatar(input: unknown): Promise<Resultado<{ avatar_url: string }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const parsed = avatarRegistroSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))
  const { caminho } = parsed.data

  // Só a pasta desta pessoa — o caminho tem que ser um que ESTE servidor gerou para ela.
  if (!caminho.startsWith(`${pastaDeAvatar(ctx.colab.email)}/`)) return falha('Caminho inválido.')

  const { data: assinada, error: erroAssinatura } = await ctx.supabase.storage
    .from(BUCKET_AVATARES)
    .createSignedUrl(caminho, 24 * 60 * 60)
  if (erroAssinatura || !assinada) return falha('A foto não chegou ao servidor. Tente de novo.')

  const { data: atual } = await ctx.supabase
    .from('colaboradores_perfis')
    .select('avatar_path')
    .eq('email', ctx.colab.email)
    .maybeSingle()

  const { error } = await ctx.supabase
    .from('colaboradores_perfis')
    .upsert({ email: ctx.colab.email, avatar_path: caminho }, { onConflict: 'email' })
  if (error) return falha(`Erro ao salvar a foto: ${error.message}`)

  const anterior = (atual?.avatar_path as string | null) ?? null
  if (anterior && anterior !== caminho) {
    await ctx.supabase.storage.from(BUCKET_AVATARES).remove([anterior])
    esquecerAvatar(anterior)
  }

  revalidatePath('/', 'layout')
  return sucesso({ avatar_url: assinada.signedUrl }, 'Foto atualizada.')
}

export async function removerAvatar(): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)

  const { data: atual } = await ctx.supabase
    .from('colaboradores_perfis')
    .select('avatar_path')
    .eq('email', ctx.colab.email)
    .maybeSingle()
  const caminho = (atual?.avatar_path as string | null) ?? null
  if (!caminho) return sucesso(null)

  const { error } = await ctx.supabase
    .from('colaboradores_perfis')
    .update({ avatar_path: null })
    .eq('email', ctx.colab.email)
  if (error) return falha(`Erro ao remover a foto: ${error.message}`)

  await ctx.supabase.storage.from(BUCKET_AVATARES).remove([caminho])
  esquecerAvatar(caminho)
  revalidatePath('/', 'layout')
  return sucesso(null, 'Foto removida.')
}

// ---------------------------------------------------------------------------
//  EQUIPES E ORGANOGRAMA — só administradores mudam
// ---------------------------------------------------------------------------

function somenteAdmin(ctx: Contexto): string | null {
  return ctx.colab.papel === 'admin' ? null : 'Só administradores podem alterar equipes e o organograma.'
}

/** true se a pessoa existe e está ativa na lista de acesso. */
async function pessoaAtiva(ctx: Contexto, email: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from('colaboradores_autorizados')
    .select('ativo')
    .ilike('email', email)
    .maybeSingle()
  return Boolean(data?.ativo)
}

/**
 * Um gestor não pode ser a própria pessoa nem alguém abaixo dela: sobe
 * a cadeia a partir do gestor proposto e, se chegar na pessoa, é ciclo.
 */
async function gestorValido(ctx: Contexto, email: string, gestor: string | null): Promise<string | null> {
  if (!gestor) return null
  if (gestor === email) return 'Uma pessoa não pode ser gestora de si mesma.'
  if (!(await pessoaAtiva(ctx, gestor))) return 'Gestor não encontrado entre os colaboradores ativos.'
  const { data } = await ctx.supabase.from('colaboradores_perfis').select('email, gestor_email')
  const mapa = new Map<string, string | null>()
  for (const p of (data ?? []) as { email: string; gestor_email: string | null }[]) mapa.set(p.email, p.gestor_email)
  let atual: string | null = gestor
  for (let passos = 0; atual && passos < 200; passos++) {
    if (atual === email) return 'Isso criaria um ciclo: essa pessoa já está abaixo dela no organograma.'
    atual = mapa.get(atual) ?? null
  }
  return null
}

async function trocarEquipesDe(ctx: Contexto, email: string, equipes: string[]): Promise<string | null> {
  const { error: erroApaga } = await ctx.supabase.from('equipe_membros').delete().eq('email', email)
  if (erroApaga) return erroApaga.message
  if (equipes.length === 0) return null
  const { error } = await ctx.supabase
    .from('equipe_membros')
    .insert([...new Set(equipes)].map((equipe_id) => ({ equipe_id, email })))
  return error ? error.message : null
}

/** Cria ou atualiza uma equipe, com líder e membros. */
export async function salvarEquipe(input: unknown): Promise<Resultado<Equipe>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  const bloqueio = somenteAdmin(ctx)
  if (bloqueio) return falha(bloqueio)

  const parsed = equipeSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))
  const { id, nome, cor, descricao, lider_email, membros } = parsed.data

  const linha = { nome, cor, descricao, lider_email }
  const consulta = id
    ? ctx.supabase.from('equipes').update(linha).eq('id', id).select('*').single()
    : ctx.supabase.from('equipes').insert({ ...linha, criado_por: ctx.colab.email }).select('*').single()
  const { data, error } = await consulta
  if (error || !data) {
    if (error?.code === '23505') return falha('Já existe uma equipe com esse nome.')
    return falha(`Erro ao salvar a equipe: ${error?.message ?? 'sem retorno'}`)
  }

  const { error: erroApaga } = await ctx.supabase.from('equipe_membros').delete().eq('equipe_id', data.id)
  if (erroApaga) return falha(`Erro ao atualizar os membros: ${erroApaga.message}`)
  const lista = [...new Set(membros)]
  if (lista.length > 0) {
    const { error: erroMembros } = await ctx.supabase
      .from('equipe_membros')
      .insert(lista.map((email) => ({ equipe_id: data.id, email })))
    if (erroMembros) return falha(`Erro ao atualizar os membros: ${erroMembros.message}`)
  }

  revalidatePath('/tasks', 'layout')
  return sucesso({ ...(data as Omit<Equipe, 'membros'>), membros: lista.sort() }, id ? 'Equipe salva.' : 'Equipe criada.')
}

export async function excluirEquipe(equipeId: unknown): Promise<Resultado> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  const bloqueio = somenteAdmin(ctx)
  if (bloqueio) return falha(bloqueio)

  const parsed = uuid.safeParse(equipeId)
  if (!parsed.success) return falha('Equipe inválida.')

  const { error } = await ctx.supabase.from('equipes').delete().eq('id', parsed.data)
  if (error) return falha(`Erro ao excluir: ${error.message}`)
  revalidatePath('/tasks', 'layout')
  return sucesso(null, 'Equipe excluída.')
}

/** Define (ou tira) o gestor direto de alguém — o que desenha o organograma. */
export async function definirGestor(input: unknown): Promise<Resultado<{ email: string; gestor_email: string | null }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  const bloqueio = somenteAdmin(ctx)
  if (bloqueio) return falha(bloqueio)

  const parsed = gestorSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))
  const { email, gestor_email } = parsed.data

  if (!(await pessoaAtiva(ctx, email))) return falha('Pessoa não encontrada.')
  const problema = await gestorValido(ctx, email, gestor_email)
  if (problema) return falha(problema)

  const { error } = await ctx.supabase
    .from('colaboradores_perfis')
    .upsert({ email, gestor_email }, { onConflict: 'email' })
  if (error) return falha(`Erro ao salvar: ${error.message}`)

  revalidatePath('/tasks', 'layout')
  return sucesso({ email, gestor_email })
}

/** Cargo, gestor e equipes de uma pessoa, editados pelo administrador. */
export async function salvarPessoaAdmin(input: unknown): Promise<Resultado<{ email: string; cargo: string | null; gestor_email: string | null; equipes: string[] }>> {
  const ctx = await autenticar()
  if ('erro' in ctx) return falha(ctx.erro)
  const bloqueio = somenteAdmin(ctx)
  if (bloqueio) return falha(bloqueio)

  const parsed = pessoaAdminSchema.safeParse(input)
  if (!parsed.success) return falha(primeiraMensagem(parsed.error))
  const { email, cargo, gestor_email, equipes } = parsed.data

  if (!(await pessoaAtiva(ctx, email))) return falha('Pessoa não encontrada.')
  const problema = await gestorValido(ctx, email, gestor_email)
  if (problema) return falha(problema)

  const { error } = await ctx.supabase
    .from('colaboradores_perfis')
    .upsert({ email, cargo: cargo || null, gestor_email }, { onConflict: 'email' })
  if (error) return falha(`Erro ao salvar: ${error.message}`)

  const erroEquipes = await trocarEquipesDe(ctx, email, equipes)
  if (erroEquipes) return falha(`Erro ao atualizar as equipes: ${erroEquipes}`)

  revalidatePath('/tasks', 'layout')
  return sucesso({ email, cargo: cargo || null, gestor_email, equipes: [...new Set(equipes)] }, 'Pessoa atualizada.')
}
