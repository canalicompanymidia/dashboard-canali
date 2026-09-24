import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { requireSupabaseAdminClient } from '@/lib/supabase/server'
import type { Campo, OpcaoCampo, ValorCampo } from '@/lib/tasks/types'

import { clickup, type OpcoesDeTarefas } from './api'
import {
  corHex,
  criadaEm,
  emailLimpo,
  instanteISO,
  mapearTarefa,
  mapearTipoCampo,
  mapearTipoStatus,
  normalizarNome,
  opcoesFaltantes,
  truncar,
  valorDoCampo,
} from './mapear'
import type { ClickupCustomField, ClickupStatus, ClickupTask } from './tipos'

/**
 * Importação do ClickUp para o Tasks.
 *
 * Roda em passos pequenos — uma página de uma lista por chamada — para
 * caber no tempo de uma função da Vercel e no limite de requisições do
 * ClickUp. Tudo é chaveado pelo id de origem (`clickup_id`): rodar de
 * novo atualiza em vez de duplicar.
 *
 * Espaço, pasta e lista só são criados no Hub quando pelo menos uma
 * tarefa passa no corte de data. Pasta antiga sem tarefa recente não
 * vira casca vazia.
 */

export interface ArvoreClickup {
  workspace: { id: string; nome: string }
  espacos: {
    id: string
    nome: string
    privado: boolean
    pastas: { id: string; nome: string; listas: ListaClickup[] }[]
    listas: ListaClickup[]
  }[]
}

export interface ListaClickup {
  id: string
  nome: string
  tarefas: number | null
}

export interface AlvoLista {
  espaco: { id: string; nome: string; privado: boolean }
  pasta: { id: string; nome: string } | null
  lista: { id: string; nome: string }
}

export interface ResultadoPagina {
  importadas: number
  ignoradas: number
  ultimaPagina: boolean
  listaHubId: string | null
}

// ---------------------------------------------------------------------------
//  Conexão: a árvore do workspace
// ---------------------------------------------------------------------------

export async function conectar(token: string): Promise<ArvoreClickup> {
  const equipes = await clickup.equipes(token)
  const equipe = equipes[0]
  if (!equipe) throw new Error('Este token não tem acesso a nenhum workspace do ClickUp.')

  const espacos = await clickup.espacos(token, equipe.id)
  const arvore: ArvoreClickup = { workspace: { id: equipe.id, nome: equipe.name }, espacos: [] }

  for (const espaco of espacos) {
    if (espaco.archived) continue
    const [pastas, soltas] = await Promise.all([
      clickup.pastas(token, espaco.id),
      clickup.listasSoltas(token, espaco.id),
    ])
    arvore.espacos.push({
      id: espaco.id,
      nome: normalizarNome(espaco.name),
      privado: Boolean(espaco.private),
      pastas: pastas
        .filter((p) => !p.archived)
        .map((p) => ({
          id: p.id,
          nome: normalizarNome(p.name),
          listas: (p.lists ?? [])
            .filter((l) => !l.archived)
            .map((l) => ({ id: l.id, nome: normalizarNome(l.name), tarefas: contagem(l.task_count) })),
        })),
      listas: soltas
        .filter((l) => !l.archived)
        .map((l) => ({ id: l.id, nome: normalizarNome(l.name), tarefas: contagem(l.task_count) })),
    })
  }

  return arvore
}

function contagem(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
//  Hierarquia no Hub
// ---------------------------------------------------------------------------

/** Igualdade sem diferenciar maiúsculas, com os curingas do ilike escapados. */
function ilikeExato(texto: string): string {
  return texto.replace(/[%_\\]/g, (c) => `\\${c}`)
}

async function proximaPosicao(supabase: SupabaseClient, tabela: string, filtro?: [string, string]) {
  let q = supabase.from(tabela).select('posicao').order('posicao', { ascending: false }).limit(1)
  if (filtro) q = q.eq(filtro[0], filtro[1])
  const { data } = await q.maybeSingle()
  return Number(data?.posicao ?? -1) + 1
}

async function garantirEspaco(supabase: SupabaseClient, alvo: AlvoLista['espaco']): Promise<string> {
  const porId = await supabase.from('tarefas_espacos').select('id').eq('clickup_id', alvo.id).maybeSingle()
  if (porId.data) return String(porId.data.id)

  const porNome = await supabase
    .from('tarefas_espacos')
    .select('id')
    .is('clickup_id', null)
    .ilike('nome', ilikeExato(alvo.nome))
    .limit(1)
    .maybeSingle()
  if (porNome.data) {
    await supabase.from('tarefas_espacos').update({ clickup_id: alvo.id }).eq('id', porNome.data.id)
    return String(porNome.data.id)
  }

  const { data, error } = await supabase
    .from('tarefas_espacos')
    .insert({
      nome: alvo.nome,
      cor: '#62676f',
      privado: alvo.privado,
      posicao: await proximaPosicao(supabase, 'tarefas_espacos'),
      clickup_id: alvo.id,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Não deu para criar o espaço "${alvo.nome}": ${error?.message}`)
  return String(data.id)
}

async function garantirPasta(
  supabase: SupabaseClient,
  espacoId: string,
  alvo: NonNullable<AlvoLista['pasta']>,
): Promise<string> {
  const porId = await supabase.from('tarefas_pastas').select('id').eq('clickup_id', alvo.id).maybeSingle()
  if (porId.data) return String(porId.data.id)

  const porNome = await supabase
    .from('tarefas_pastas')
    .select('id')
    .eq('espaco_id', espacoId)
    .is('clickup_id', null)
    .ilike('nome', ilikeExato(alvo.nome))
    .limit(1)
    .maybeSingle()
  if (porNome.data) {
    await supabase.from('tarefas_pastas').update({ clickup_id: alvo.id }).eq('id', porNome.data.id)
    return String(porNome.data.id)
  }

  const { data, error } = await supabase
    .from('tarefas_pastas')
    .insert({
      espaco_id: espacoId,
      nome: alvo.nome,
      posicao: await proximaPosicao(supabase, 'tarefas_pastas', ['espaco_id', espacoId]),
      clickup_id: alvo.id,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Não deu para criar a pasta "${alvo.nome}": ${error?.message}`)
  return String(data.id)
}

async function garantirLista(
  supabase: SupabaseClient,
  espacoId: string,
  pastaId: string | null,
  alvo: AlvoLista['lista'],
): Promise<string> {
  const porId = await supabase.from('tarefas_listas').select('id').eq('clickup_id', alvo.id).maybeSingle()
  if (porId.data) return String(porId.data.id)

  let q = supabase
    .from('tarefas_listas')
    .select('id')
    .eq('espaco_id', espacoId)
    .is('clickup_id', null)
    .ilike('nome', ilikeExato(alvo.nome))
  q = pastaId ? q.eq('pasta_id', pastaId) : q.is('pasta_id', null)
  const porNome = await q.limit(1).maybeSingle()
  if (porNome.data) {
    await supabase.from('tarefas_listas').update({ clickup_id: alvo.id }).eq('id', porNome.data.id)
    return String(porNome.data.id)
  }

  const { data, error } = await supabase
    .from('tarefas_listas')
    .insert({
      espaco_id: espacoId,
      pasta_id: pastaId,
      nome: alvo.nome,
      posicao: await proximaPosicao(supabase, 'tarefas_listas', ['espaco_id', espacoId]),
      clickup_id: alvo.id,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Não deu para criar a lista "${alvo.nome}": ${error?.message}`)
  return String(data.id)
}

async function buscarListaHub(supabase: SupabaseClient, clickupListId: string): Promise<string | null> {
  const { data } = await supabase.from('tarefas_listas').select('id').eq('clickup_id', clickupListId).maybeSingle()
  return data ? String(data.id) : null
}

// ---------------------------------------------------------------------------
//  Status e campos
// ---------------------------------------------------------------------------

/** Garante que todo status usado exista na lista do Hub. Devolve nome (minúsculo) → id. */
async function garantirStatuses(
  supabase: SupabaseClient,
  listaId: string,
  daLista: ClickupStatus[],
  tarefas: ClickupTask[],
): Promise<Map<string, string>> {
  const { data: existentes } = await supabase
    .from('tarefas_status')
    .select('id, nome, posicao')
    .eq('lista_id', listaId)
    .order('posicao')
  const mapa = new Map<string, string>()
  for (const s of existentes ?? []) mapa.set(String(s.nome).toLowerCase(), String(s.id))

  const necessarios = new Map<string, { nome: string; cor: string; tipo: string; ordem: number }>()
  daLista.forEach((s, i) => {
    const nome = String(s.status ?? '').trim().slice(0, 40)
    if (nome) necessarios.set(nome.toLowerCase(), { nome, cor: corHex(s.color), tipo: mapearTipoStatus(s.type), ordem: s.orderindex ?? i })
  })
  for (const t of tarefas) {
    const nome = String(t.status?.status ?? '').trim().slice(0, 40)
    if (nome && !necessarios.has(nome.toLowerCase())) {
      necessarios.set(nome.toLowerCase(), {
        nome,
        cor: corHex(t.status?.color),
        tipo: mapearTipoStatus(t.status?.type),
        ordem: 900 + necessarios.size,
      })
    }
  }
  if (!necessarios.has('para fazer') && !mapa.has('para fazer') && necessarios.size === 0) {
    necessarios.set('para fazer', { nome: 'para fazer', cor: '#8a817c', tipo: 'aberto', ordem: 0 })
  }

  const faltam = [...necessarios.values()].filter((s) => !mapa.has(s.nome.toLowerCase()))
  if (faltam.length > 0) {
    let base = (existentes?.length ?? 0)
    const { data, error } = await supabase
      .from('tarefas_status')
      .insert(faltam.map((s) => ({ lista_id: listaId, nome: s.nome, cor: s.cor, tipo: s.tipo, posicao: base++ })))
      .select('id, nome')
    if (error) throw new Error(`Não deu para criar os status da lista: ${error.message}`)
    for (const s of data ?? []) mapa.set(String(s.nome).toLowerCase(), String(s.id))
  }

  return mapa
}

interface CampoHub {
  id: string
  tipo: Campo['tipo']
  opcoes: OpcaoCampo[]
}

function temValor(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** Garante os campos (e opções) usados pelas tarefas da página. ClickUp id → campo do Hub. */
async function garantirCampos(
  supabase: SupabaseClient,
  espacoId: string,
  tarefas: ClickupTask[],
): Promise<Map<string, CampoHub>> {
  const usados = new Map<string, ClickupCustomField>()
  for (const t of tarefas) {
    for (const cf of t.custom_fields ?? []) {
      if (!temValor(cf.value) || usados.has(cf.id)) continue
      if (!mapearTipoCampo(cf.type)) continue
      usados.set(cf.id, cf)
    }
  }
  const resultado = new Map<string, CampoHub>()
  if (usados.size === 0) return resultado

  const { data: existentes } = await supabase
    .from('tarefas_campos')
    .select('id, nome, tipo, opcoes, lista_id, clickup_id')
    .eq('espaco_id', espacoId)
  const porClickup = new Map<string, CampoHub>()
  const porNome = new Map<string, CampoHub & { clickup_id: string | null }>()
  for (const c of existentes ?? []) {
    const campo: CampoHub & { clickup_id: string | null } = {
      id: String(c.id),
      tipo: c.tipo,
      opcoes: Array.isArray(c.opcoes) ? (c.opcoes as OpcaoCampo[]) : [],
      clickup_id: c.clickup_id ? String(c.clickup_id) : null,
    }
    if (campo.clickup_id) porClickup.set(campo.clickup_id, campo)
    else if (!c.lista_id) porNome.set(String(c.nome).toLowerCase(), campo)
  }

  let posicao = existentes?.length ?? 0

  for (const cf of usados.values()) {
    const tipo = mapearTipoCampo(cf.type)!
    let campo = porClickup.get(cf.id) ?? null

    if (!campo) {
      const nome = truncar(cf.name, 60) ?? 'Campo'
      const semelhante = porNome.get(nome.toLowerCase())
      if (semelhante && semelhante.tipo === tipo) {
        await supabase.from('tarefas_campos').update({ clickup_id: cf.id }).eq('id', semelhante.id)
        campo = semelhante
      } else {
        const { data, error } = await supabase
          .from('tarefas_campos')
          .insert({
            espaco_id: espacoId,
            lista_id: null,
            nome: semelhante ? `${nome} (ClickUp)` : nome,
            tipo,
            opcoes: tipo === 'selecao' || tipo === 'multiselecao' ? opcoesFaltantes(cf, []) : [],
            posicao: posicao++,
            clickup_id: cf.id,
          })
          .select('id, tipo, opcoes')
          .single()
        if (error || !data) throw new Error(`Não deu para criar o campo "${nome}": ${error?.message}`)
        campo = { id: String(data.id), tipo: data.tipo, opcoes: (data.opcoes as OpcaoCampo[]) ?? [] }
      }
    }

    if (campo.tipo === 'selecao' || campo.tipo === 'multiselecao') {
      const novas = opcoesFaltantes(cf, campo.opcoes)
      if (novas.length > 0) {
        campo = { ...campo, opcoes: [...campo.opcoes, ...novas] }
        await supabase.from('tarefas_campos').update({ opcoes: campo.opcoes }).eq('id', campo.id)
      }
    }

    resultado.set(cf.id, campo)
  }

  return resultado
}

// ---------------------------------------------------------------------------
//  Uma página de uma lista
// ---------------------------------------------------------------------------

export async function importarPagina(
  token: string,
  alvo: AlvoLista,
  pagina: number,
  opcoes: OpcoesDeTarefas,
): Promise<ResultadoPagina> {
  const supabase = requireSupabaseAdminClient()

  const { tarefas, ultimaPagina } = await clickup.tarefas(token, alvo.lista.id, pagina, opcoes)
  const validas = tarefas.filter((t) => criadaEm(t) >= opcoes.desdeMs && !t.archived)
  const ignoradas = tarefas.length - validas.length

  if (validas.length === 0) {
    return { importadas: 0, ignoradas, ultimaPagina, listaHubId: await buscarListaHub(supabase, alvo.lista.id) }
  }

  const espacoId = await garantirEspaco(supabase, alvo.espaco)
  const pastaId = alvo.pasta ? await garantirPasta(supabase, espacoId, alvo.pasta) : null
  const listaId = await garantirLista(supabase, espacoId, pastaId, alvo.lista)

  // Os status da lista só precisam ser lidos uma vez; as demais páginas
  // se garantem pelos status que as próprias tarefas carregam.
  const statusesDaLista = pagina === 0 ? await clickup.statusesDaLista(token, alvo.lista.id) : []
  const statusPorNome = await garantirStatuses(supabase, listaId, statusesDaLista, validas)
  const campos = await garantirCampos(supabase, espacoId, validas)

  const linhas = validas.map((t) => {
    const m = mapearTarefa(t)
    const valores: Record<string, ValorCampo> = {}
    for (const cf of t.custom_fields ?? []) {
      const campo = campos.get(cf.id)
      if (!campo || !temValor(cf.value)) continue
      const v = valorDoCampo(cf, campo.tipo, campo.opcoes)
      if (v !== null) valores[campo.id] = v
    }
    return {
      clickup_id: m.clickup_id,
      clickup_pai_id: m.clickup_pai_id,
      lista_id: listaId,
      status_id: statusPorNome.get(m.statusNome.toLowerCase()) ?? [...statusPorNome.values()][0],
      titulo: m.titulo,
      descricao: m.descricao,
      prioridade: m.prioridade,
      data_inicio: m.data_inicio,
      data_vencimento: m.data_vencimento,
      estimativa_minutos: m.estimativa_minutos,
      etiquetas: m.etiquetas,
      campos: valores,
      posicao: m.posicao,
      criado_por: m.criado_por,
      concluida_em: m.concluida_em,
      ...(m.created_at ? { created_at: m.created_at } : {}),
      _responsaveis: m.responsaveis,
      _checklist: m.checklist,
    }
  })

  const { data: gravadas, error } = await supabase
    .from('tarefas')
    .upsert(
      linhas.map(({ _responsaveis, _checklist, ...linha }) => {
        void _responsaveis
        void _checklist
        return linha
      }),
      { onConflict: 'clickup_id' },
    )
    .select('id, clickup_id')
  if (error) throw new Error(`Não deu para gravar as tarefas: ${error.message}`)

  const idPorClickup = new Map<string, string>()
  for (const g of gravadas ?? []) idPorClickup.set(String(g.clickup_id), String(g.id))
  const ids = [...idPorClickup.values()]

  // Responsáveis e checklist: substituídos pelo que está no ClickUp.
  const responsaveis: { tarefa_id: string; email: string }[] = []
  const checklist: { tarefa_id: string; clickup_id: string; texto: string; feito: boolean; posicao: number }[] = []
  for (const linha of linhas) {
    const id = idPorClickup.get(linha.clickup_id)
    if (!id) continue
    for (const email of linha._responsaveis) responsaveis.push({ tarefa_id: id, email })
    for (const item of linha._checklist) checklist.push({ tarefa_id: id, ...item })
  }

  if (ids.length > 0) {
    await supabase.from('tarefas_responsaveis').delete().in('tarefa_id', ids)
    if (responsaveis.length > 0) {
      const { error: e } = await supabase.from('tarefas_responsaveis').insert(responsaveis)
      if (e) throw new Error(`Não deu para gravar os responsáveis: ${e.message}`)
    }
    await supabase.from('tarefas_checklist').delete().in('tarefa_id', ids)
    if (checklist.length > 0) {
      const { error: e } = await supabase.from('tarefas_checklist').insert(checklist)
      if (e) throw new Error(`Não deu para gravar os checklists: ${e.message}`)
    }
  }

  return { importadas: ids.length, ignoradas, ultimaPagina, listaHubId: listaId }
}

/** Depois de todas as páginas: liga subtarefas às mães. */
export async function finalizarLista(listaHubId: string): Promise<number> {
  const supabase = requireSupabaseAdminClient()
  const { data, error } = await supabase.rpc('tarefas_vincular_subtarefas', { p_lista: listaHubId })
  if (error) throw new Error(`Não deu para ligar as subtarefas: ${error.message}`)
  return Number(data ?? 0)
}

// ---------------------------------------------------------------------------
//  Comentários — um pedido por tarefa, em lotes pequenos
// ---------------------------------------------------------------------------

export async function importarComentarios(
  token: string,
  lote: number,
): Promise<{ processadas: number; comentarios: number; restantes: number }> {
  const supabase = requireSupabaseAdminClient()

  const { data: pendentes, count } = await supabase
    .from('tarefas')
    .select('id, clickup_id', { count: 'exact' })
    .not('clickup_id', 'is', null)
    .is('clickup_comentarios_em', null)
    .order('created_at')
    .limit(lote)

  let processadas = 0
  let comentarios = 0

  for (const t of pendentes ?? []) {
    // Um 429 no meio do lote sobe como ClickupErro; o que já foi marcado
    // fica marcado, e a próxima chamada continua de onde parou.
    const lista = await clickup.comentarios(token, String(t.clickup_id))
    const linhas = lista
      .map((c) => ({
        clickup_id: c.id,
        tarefa_id: String(t.id),
        autor: emailLimpo(c.user?.email) ?? truncar(c.user?.username, 80) ?? 'ClickUp',
        texto: truncar(c.comment_text, 5000),
        created_at: instanteISO(c.date) ?? new Date().toISOString(),
      }))
      .filter((l) => l.texto)
    if (linhas.length > 0) {
      const { error } = await supabase.from('tarefas_comentarios').upsert(linhas, { onConflict: 'clickup_id' })
      if (error) throw new Error(`Não deu para gravar comentários: ${error.message}`)
      comentarios += linhas.length
    }
    await supabase.from('tarefas').update({ clickup_comentarios_em: new Date().toISOString() }).eq('id', t.id)
    processadas++
  }

  return { processadas, comentarios, restantes: Math.max(0, (count ?? 0) - processadas) }
}
