import 'server-only'

import type { Colaborador } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

import { hojeISO } from './datas'
import { podeVerEspaco } from './permissoes'
import { BUCKET_ANEXOS } from './types'
import type {
  Anexo,
  Atividade,
  Campo,
  Comentario,
  Espaco,
  EspacoComArvore,
  ItemChecklist,
  Lista,
  ListaContexto,
  Pasta,
  PastaComListas,
  Pessoa,
  Status,
  Tarefa,
  TarefaDetalhe,
} from './types'

/**
 * Camada de leitura do módulo Tasks.
 *
 * Tudo aqui usa a service_role, porque as tabelas de tarefas não têm
 * policy nenhuma — a chave pública não as enxerga, nem logada. A
 * autorização é feita AQUI, por função, com o colaborador que a página
 * já validou: quem chama sempre passa quem está pedindo, e as funções
 * filtram pelos espaços que essa pessoa pode ver.
 *
 * Como o resto do Hub, degrada com elegância: sem banco (ou sem a
 * migration 0006) devolve vazio, e a tela explica o que falta.
 */

/** Quanto tempo uma URL assinada de anexo vale, em segundos. */
const VALIDADE_URL_ANEXO = 60 * 60

function db() {
  return getSupabaseAdminClient()
}

/** true quando a migration 0006 já rodou neste banco. */
export async function tasksDisponivel(): Promise<boolean> {
  const supabase = db()
  if (!supabase) return false
  const { error } = await supabase.from('tarefas_espacos').select('id').limit(1)
  return !error
}

// ---------------------------------------------------------------------------
//  Pessoas
// ---------------------------------------------------------------------------

/** Colaboradores ativos — os únicos que podem ser responsáveis por algo. */
export async function getPessoas(): Promise<Pessoa[]> {
  const supabase = db()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('colaboradores_autorizados')
    .select('email, nome, papel')
    .eq('ativo', true)
    .order('nome', { ascending: true, nullsFirst: false })

  if (error || !data) return []

  return data.map((linha) => ({
    email: String(linha.email).toLowerCase(),
    nome: (linha.nome as string | null) ?? null,
    papel: linha.papel === 'admin' ? 'admin' : 'colaborador',
  }))
}

// ---------------------------------------------------------------------------
//  Espaços, pastas e listas
// ---------------------------------------------------------------------------

async function carregarEspacos(): Promise<{ espacos: Espaco[]; membros: Map<string, string[]> }> {
  const supabase = db()
  if (!supabase) return { espacos: [], membros: new Map() }

  const [espacosRes, membrosRes] = await Promise.all([
    supabase.from('tarefas_espacos').select('*').order('posicao').order('created_at'),
    supabase.from('tarefas_espaco_membros').select('espaco_id, email'),
  ])

  const membros = new Map<string, string[]>()
  for (const linha of membrosRes.data ?? []) {
    const lista = membros.get(linha.espaco_id) ?? []
    lista.push(String(linha.email))
    membros.set(linha.espaco_id, lista)
  }

  return { espacos: (espacosRes.data ?? []) as Espaco[], membros }
}

/** Espaços que esta pessoa pode ver, já com a lista de membros. */
export async function getEspacosVisiveis(colab: Colaborador): Promise<(Espaco & { membros: string[] })[]> {
  const { espacos, membros } = await carregarEspacos()
  return espacos
    .map((espaco) => ({ ...espaco, membros: membros.get(espaco.id) ?? [] }))
    .filter((espaco) => podeVerEspaco(colab, espaco))
}

/**
 * A árvore da barra lateral: cada espaço visível com pastas e listas.
 * As listas vêm da view de resumo, que já traz as contagens.
 */
export async function getArvore(colab: Colaborador): Promise<EspacoComArvore[]> {
  const supabase = db()
  if (!supabase) return []

  const espacos = await getEspacosVisiveis(colab)
  if (espacos.length === 0) return []

  const ids = espacos.map((e) => e.id)

  const [pastasRes, listasRes] = await Promise.all([
    supabase.from('tarefas_pastas').select('*').in('espaco_id', ids).order('posicao').order('created_at'),
    supabase
      .from('v_tarefas_listas_resumo')
      .select('*')
      .in('espaco_id', ids)
      .order('posicao')
      .order('created_at'),
  ])

  const pastas = (pastasRes.data ?? []) as Pasta[]
  const listas = (listasRes.data ?? []) as Lista[]

  return espacos.map((espaco) => {
    const pastasDoEspaco: PastaComListas[] = pastas
      .filter((p) => p.espaco_id === espaco.id)
      .map((p) => ({ ...p, listas: listas.filter((l) => l.pasta_id === p.id) }))

    return {
      ...espaco,
      pastas: pastasDoEspaco,
      listas: listas.filter((l) => l.espaco_id === espaco.id && !l.pasta_id),
    }
  })
}

export async function getEspaco(id: string, colab: Colaborador): Promise<EspacoComArvore | null> {
  const arvore = await getArvore(colab)
  return arvore.find((e) => e.id === id) ?? null
}

export async function getPasta(
  id: string,
  colab: Colaborador,
): Promise<{ pasta: PastaComListas; espaco: EspacoComArvore } | null> {
  const arvore = await getArvore(colab)
  for (const espaco of arvore) {
    const pasta = espaco.pastas.find((p) => p.id === id)
    if (pasta) return { pasta, espaco }
  }
  return null
}

/** Status de uma lista, na ordem do quadro. */
export async function getStatuses(listaId: string): Promise<Status[]> {
  const supabase = db()
  if (!supabase) return []

  const { data } = await supabase
    .from('tarefas_status')
    .select('*')
    .eq('lista_id', listaId)
    .order('posicao')
    .order('created_at')

  return (data ?? []) as Status[]
}

/** Campos que valem para uma lista: os do espaço inteiro + os só dela. */
export async function getCampos(espacoId: string, listaId: string): Promise<Campo[]> {
  const supabase = db()
  if (!supabase) return []

  const { data } = await supabase
    .from('tarefas_campos')
    .select('*')
    .eq('espaco_id', espacoId)
    .or(`lista_id.is.null,lista_id.eq.${listaId}`)
    .order('posicao')
    .order('created_at')

  return (data ?? []).map(normalizarCampo)
}

function normalizarCampo(linha: Record<string, unknown>): Campo {
  return {
    ...(linha as unknown as Campo),
    opcoes: Array.isArray(linha.opcoes) ? (linha.opcoes as Campo['opcoes']) : [],
  }
}

/** A lista com tudo que a tela precisa. null = não existe ou não pode ver. */
export async function getListaContexto(id: string, colab: Colaborador): Promise<ListaContexto | null> {
  const supabase = db()
  if (!supabase) return null

  const { data: lista } = await supabase
    .from('v_tarefas_listas_resumo')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!lista) return null

  const espacos = await getEspacosVisiveis(colab)
  const espaco = espacos.find((e) => e.id === lista.espaco_id)
  if (!espaco) return null

  const [statuses, campos, pastaRes] = await Promise.all([
    getStatuses(id),
    getCampos(espaco.id, id),
    lista.pasta_id
      ? supabase.from('tarefas_pastas').select('*').eq('id', lista.pasta_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    lista: lista as Lista,
    espaco,
    pasta: (pastaRes.data as Pasta | null) ?? null,
    statuses,
    campos,
  }
}

// ---------------------------------------------------------------------------
//  Tarefas
// ---------------------------------------------------------------------------

function normalizarTarefa(linha: Record<string, unknown>): Tarefa {
  return {
    ...(linha as unknown as Tarefa),
    etiquetas: Array.isArray(linha.etiquetas) ? (linha.etiquetas as string[]) : [],
    responsaveis: Array.isArray(linha.responsaveis) ? (linha.responsaveis as string[]) : [],
    campos:
      linha.campos && typeof linha.campos === 'object'
        ? (linha.campos as Tarefa['campos'])
        : {},
    posicao: Number(linha.posicao ?? 0),
  }
}

/** Todas as tarefas de uma lista, subtarefas incluídas, na ordem do quadro. */
export async function getTarefasDaLista(listaId: string): Promise<Tarefa[]> {
  const supabase = db()
  if (!supabase) return []

  const { data } = await supabase
    .from('v_tarefas')
    .select('*')
    .eq('lista_id', listaId)
    .order('status_posicao')
    .order('posicao')
    .order('created_at')

  return (data ?? []).map(normalizarTarefa)
}

export async function getTarefa(id: string): Promise<Tarefa | null> {
  const supabase = db()
  if (!supabase) return null

  const { data } = await supabase.from('v_tarefas').select('*').eq('id', id).maybeSingle()
  return data ? normalizarTarefa(data) : null
}

/** Ids dos espaços visíveis — filtro de toda consulta que cruza espaços. */
async function idsVisiveis(colab: Colaborador): Promise<string[]> {
  const espacos = await getEspacosVisiveis(colab)
  return espacos.map((e) => e.id)
}

/** Tarefas em que a pessoa é responsável, em qualquer espaço que ela vê. */
export async function getMinhasTarefas(colab: Colaborador): Promise<Tarefa[]> {
  const supabase = db()
  if (!supabase) return []

  const ids = await idsVisiveis(colab)
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('v_tarefas')
    .select('*')
    .in('espaco_id', ids)
    .contains('responsaveis', [colab.email])
    .order('data_vencimento', { ascending: true, nullsFirst: false })
    .order('created_at')

  return (data ?? []).map(normalizarTarefa)
}

/** Tarefas que a pessoa criou e delegou a outros (ela não é responsável). */
export async function getTarefasDelegadas(colab: Colaborador): Promise<Tarefa[]> {
  const supabase = db()
  if (!supabase) return []

  const ids = await idsVisiveis(colab)
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('v_tarefas')
    .select('*')
    .in('espaco_id', ids)
    .eq('criado_por', colab.email)
    .order('data_vencimento', { ascending: true, nullsFirst: false })
    .order('created_at')

  return (data ?? [])
    .map(normalizarTarefa)
    .filter((t) => t.responsaveis.length > 0 && !t.responsaveis.includes(colab.email))
}

/** Últimas tarefas mexidas nos espaços que a pessoa vê. */
export async function getTarefasRecentes(colab: Colaborador, limite = 8): Promise<Tarefa[]> {
  const supabase = db()
  if (!supabase) return []

  const ids = await idsVisiveis(colab)
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('v_tarefas')
    .select('*')
    .in('espaco_id', ids)
    .order('updated_at', { ascending: false })
    .limit(limite)

  return (data ?? []).map(normalizarTarefa)
}

/** Tarefas com vencimento num intervalo de datas (agenda da Home). */
export async function getTarefasPorVencimento(
  colab: Colaborador,
  inicio: string,
  fim: string,
): Promise<Tarefa[]> {
  const supabase = db()
  if (!supabase) return []

  const ids = await idsVisiveis(colab)
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('v_tarefas')
    .select('*')
    .in('espaco_id', ids)
    .gte('data_vencimento', inicio)
    .lte('data_vencimento', fim)
    .order('data_vencimento')
    .order('created_at')

  return (data ?? []).map(normalizarTarefa)
}

/** Busca por título ou etiqueta, nos espaços visíveis. */
export async function buscarTarefas(colab: Colaborador, termo: string, limite = 60): Promise<Tarefa[]> {
  const supabase = db()
  if (!supabase) return []

  const q = termo.trim()
  if (!q) return []

  const ids = await idsVisiveis(colab)
  if (ids.length === 0) return []

  // Os curingas do ilike vindos da pessoa viram literais: "50%" busca "50%".
  const padrao = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`

  const { data } = await supabase
    .from('v_tarefas')
    .select('*')
    .in('espaco_id', ids)
    .ilike('titulo', padrao)
    .order('updated_at', { ascending: false })
    .limit(limite)

  return (data ?? []).map(normalizarTarefa)
}

/** Tarefas de todas as listas de um espaço — para a visão geral. */
export async function getTarefasDoEspaco(espacoId: string, limite = 12): Promise<Tarefa[]> {
  const supabase = db()
  if (!supabase) return []

  const { data } = await supabase
    .from('v_tarefas')
    .select('*')
    .eq('espaco_id', espacoId)
    .is('pai_id', null)
    .is('concluida_em', null)
    .order('updated_at', { ascending: false })
    .limit(limite)

  return (data ?? []).map(normalizarTarefa)
}

// ---------------------------------------------------------------------------
//  Detalhe da tarefa
// ---------------------------------------------------------------------------

/** URLs assinadas para os anexos. Falha de storage não derruba a tela. */
async function assinarAnexos(linhas: Omit<Anexo, 'url'>[]): Promise<Anexo[]> {
  const supabase = db()
  if (!supabase || linhas.length === 0) return linhas.map((a) => ({ ...a, url: null }))

  const { data } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .createSignedUrls(
      linhas.map((a) => a.caminho),
      VALIDADE_URL_ANEXO,
    )

  const porCaminho = new Map<string, string>()
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) porCaminho.set(item.path, item.signedUrl)
  }

  return linhas.map((a) => ({ ...a, url: porCaminho.get(a.caminho) ?? null }))
}

/**
 * Tudo do modal numa carga só. null = não existe ou a pessoa não vê o
 * espaço. Subtarefas abrem o mesmo modal: o detalhe delas vem do mesmo
 * jeito, com a tarefa-mãe no cabeçalho.
 */
export async function getTarefaDetalhe(id: string, colab: Colaborador): Promise<TarefaDetalhe | null> {
  const supabase = db()
  if (!supabase) return null

  const tarefa = await getTarefa(id)
  if (!tarefa) return null

  const espacos = await getEspacosVisiveis(colab)
  if (!espacos.some((e) => e.id === tarefa.espaco_id)) return null

  const [subtarefasRes, checklistRes, comentariosRes, atividadesRes, anexosRes, statuses, campos] =
    await Promise.all([
      supabase.from('v_tarefas').select('*').eq('pai_id', id).order('posicao').order('created_at'),
      supabase.from('tarefas_checklist').select('*').eq('tarefa_id', id).order('posicao').order('created_at'),
      supabase.from('tarefas_comentarios').select('*').eq('tarefa_id', id).order('created_at'),
      supabase.from('tarefas_atividades').select('*').eq('tarefa_id', id).order('created_at'),
      supabase.from('tarefas_anexos').select('*').eq('tarefa_id', id).order('created_at'),
      getStatuses(tarefa.lista_id),
      getCampos(tarefa.espaco_id, tarefa.lista_id),
    ])

  return {
    tarefa,
    subtarefas: (subtarefasRes.data ?? []).map(normalizarTarefa),
    checklist: (checklistRes.data ?? []) as ItemChecklist[],
    comentarios: (comentariosRes.data ?? []) as Comentario[],
    atividades: (atividadesRes.data ?? []).map((a) => ({
      ...(a as Atividade),
      detalhe: a.detalhe && typeof a.detalhe === 'object' ? a.detalhe : {},
    })),
    anexos: await assinarAnexos((anexosRes.data ?? []) as Omit<Anexo, 'url'>[]),
    statuses,
    campos,
  }
}
