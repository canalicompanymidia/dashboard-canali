import type { OpcaoCampo, Prioridade, StatusTipo, TipoCampo, ValorCampo } from '../tasks/types'
import type { ClickupCustomField, ClickupOpcao, ClickupTask } from './tipos'

/**
 * Tradução do ClickUp para o modelo do Hub. Funções puras — nada de
 * banco nem rede — para dar para testar cada regra isoladamente.
 */

const FUSO = 'America/Sao_Paulo'

/** "> Marketing." → "Marketing". O time decorava os espaços com sinais. */
export function normalizarNome(nome: string, max = 80): string {
  const limpo = nome
    .replace(/^[\s>»›\-–—•·]+/, '')
    .replace(/[\s.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (limpo || nome.trim() || 'Sem nome').slice(0, max)
}

export function truncar(texto: string | null | undefined, max: number): string | null {
  if (texto === null || texto === undefined) return null
  const t = String(texto).trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/** Milissegundos (string ou número) → 'AAAA-MM-DD' em São Paulo. */
export function dataISO(ms: string | number | null | undefined): string | null {
  if (ms === null || ms === undefined || ms === '') return null
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(n))
}

/** Milissegundos → ISO completo (timestamptz). */
export function instanteISO(ms: string | number | null | undefined): string | null {
  if (ms === null || ms === undefined || ms === '') return null
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n).toISOString()
}

export function emailLimpo(email: string | null | undefined): string | null {
  const e = String(email ?? '').trim().toLowerCase()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null
}

export function mapearPrioridade(p: ClickupTask['priority']): Prioridade | null {
  if (!p) return null
  const chave = String(p.priority ?? p.id ?? '').toLowerCase()
  switch (chave) {
    case 'urgent':
    case '1':
      return 'urgente'
    case 'high':
    case '2':
      return 'alta'
    case 'normal':
    case '3':
      return 'normal'
    case 'low':
    case '4':
      return 'baixa'
    default:
      return null
  }
}

/** open → não iniciado · custom → em andamento · done → concluído · closed → encerrado */
export function mapearTipoStatus(tipo: string | undefined): StatusTipo {
  switch ((tipo ?? '').toLowerCase()) {
    case 'open':
    case 'unstarted':
      return 'aberto'
    case 'done':
      return 'concluido'
    case 'closed':
      return 'fechado'
    default:
      return 'ativo'
  }
}

export function corHex(cor: string | null | undefined, padrao = '#8a817c'): string {
  const c = String(cor ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase()
  }
  return padrao
}

/** Tipo do ClickUp → tipo do Hub. null = não tem equivalente (fórmula, relação...). */
export function mapearTipoCampo(tipo: string): TipoCampo | null {
  switch (tipo) {
    case 'drop_down':
      return 'selecao'
    case 'labels':
      return 'multiselecao'
    case 'users':
      return 'pessoa'
    case 'date':
      return 'data'
    case 'checkbox':
      return 'checkbox'
    case 'number':
    case 'currency':
    case 'money':
    case 'rating':
    case 'emoji':
      return 'numero'
    case 'url':
      return 'url'
    case 'text':
    case 'short_text':
    case 'email':
    case 'phone':
      return 'texto'
    default:
      return null
  }
}

export function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function nomeDaOpcao(o: ClickupOpcao): string {
  return String(o.name ?? o.label ?? '').trim()
}

/**
 * Opções que o campo do ClickUp tem e o campo do Hub ainda não —
 * comparadas pelo NOME, porque os ids dos dois lados não têm relação.
 */
export function opcoesFaltantes(cf: ClickupCustomField, existentes: OpcaoCampo[]): OpcaoCampo[] {
  const nomes = new Set(existentes.map((o) => o.nome.toLowerCase()))
  const ids = new Set(existentes.map((o) => o.id))
  const novas: OpcaoCampo[] = []
  for (const o of cf.type_config?.options ?? []) {
    const nome = nomeDaOpcao(o)
    if (!nome || nomes.has(nome.toLowerCase())) continue
    let id = slug(nome) || `op-${novas.length + 1}`
    let n = 2
    while (ids.has(id)) id = `${slug(nome)}-${n++}`
    ids.add(id)
    nomes.add(nome.toLowerCase())
    novas.push({ id, nome: nome.slice(0, 60), cor: corHex(o.color) })
  }
  return novas
}

/** Localiza a opção do ClickUp que um valor representa (id, ou índice nos legados). */
function opcaoDoValor(cf: ClickupCustomField, valor: unknown): ClickupOpcao | null {
  const opcoes = cf.type_config?.options ?? []
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor === 'number' || /^\d+$/.test(String(valor))) {
    const idx = Number(valor)
    const porIndice = opcoes.find((o) => o.orderindex === idx)
    if (porIndice) return porIndice
    if (opcoes[idx]) return opcoes[idx]
  }
  return opcoes.find((o) => o.id === String(valor)) ?? null
}

function idNoHub(nomeClickup: string, opcoesHub: OpcaoCampo[]): string | null {
  const alvo = nomeClickup.trim().toLowerCase()
  return opcoesHub.find((o) => o.nome.toLowerCase() === alvo)?.id ?? null
}

/**
 * Valor de um campo do ClickUp no formato do campo do Hub. `opcoesHub`
 * precisa já conter as opções devolvidas por `opcoesFaltantes`.
 */
export function valorDoCampo(
  cf: ClickupCustomField,
  tipoHub: TipoCampo,
  opcoesHub: OpcaoCampo[],
): ValorCampo {
  const v = cf.value
  if (v === null || v === undefined || v === '') return null

  switch (tipoHub) {
    case 'selecao': {
      const o = opcaoDoValor(cf, v)
      return o ? idNoHub(nomeDaOpcao(o), opcoesHub) : null
    }
    case 'multiselecao': {
      const lista = Array.isArray(v) ? v : [v]
      const ids = lista
        .map((item) => opcaoDoValor(cf, typeof item === 'object' && item ? (item as { id?: string }).id : item))
        .filter((o): o is ClickupOpcao => Boolean(o))
        .map((o) => idNoHub(nomeDaOpcao(o), opcoesHub))
        .filter((id): id is string => Boolean(id))
      return ids.length ? Array.from(new Set(ids)) : null
    }
    case 'pessoa': {
      const lista = Array.isArray(v) ? v : [v]
      const emails = lista
        .map((u) => emailLimpo(typeof u === 'object' && u ? (u as { email?: string }).email : String(u)))
        .filter((e): e is string => Boolean(e))
      return emails.length ? Array.from(new Set(emails)) : null
    }
    case 'data':
      return dataISO(typeof v === 'string' || typeof v === 'number' ? v : null)
    case 'checkbox':
      return v === true || v === 'true' || v === 1 || v === '1'
    case 'numero': {
      const n = Number(typeof v === 'object' && v ? (v as { value?: unknown }).value : v)
      return Number.isFinite(n) ? n : null
    }
    case 'url':
    case 'texto': {
      const t = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return truncar(t, 2000)
    }
  }
}

export interface TarefaMapeada {
  clickup_id: string
  clickup_pai_id: string | null
  titulo: string
  descricao: string | null
  statusNome: string
  prioridade: Prioridade | null
  data_inicio: string | null
  data_vencimento: string | null
  estimativa_minutos: number | null
  etiquetas: string[]
  posicao: number
  criado_por: string | null
  concluida_em: string | null
  created_at: string | null
  responsaveis: string[]
  checklist: { clickup_id: string; texto: string; feito: boolean; posicao: number }[]
}

/** Tudo da tarefa que não depende de ids do Hub. */
export function mapearTarefa(t: ClickupTask): TarefaMapeada {
  const estimativaMs = Number(t.time_estimate ?? 0)
  const responsaveis = Array.from(
    new Set((t.assignees ?? []).map((u) => emailLimpo(u.email)).filter((e): e is string => Boolean(e))),
  )
  const checklist: TarefaMapeada['checklist'] = []
  let pos = 0
  for (const lista of t.checklists ?? []) {
    for (const item of lista.items ?? []) {
      const texto = truncar(item.name, 300)
      if (!texto) continue
      checklist.push({ clickup_id: item.id, texto, feito: Boolean(item.resolved), posicao: pos++ })
    }
  }
  const etiquetas = Array.from(
    new Set((t.tags ?? []).map((tag) => String(tag.name ?? '').trim().slice(0, 40)).filter(Boolean)),
  ).slice(0, 20)

  return {
    clickup_id: t.id,
    clickup_pai_id: t.parent ? String(t.parent) : null,
    titulo: truncar(t.name, 300) ?? 'Sem título',
    // text_content é o texto puro; description pode vir com marcação.
    descricao: truncar(t.text_content || t.description, 20000),
    statusNome: String(t.status?.status ?? 'para fazer').trim().slice(0, 40) || 'para fazer',
    prioridade: mapearPrioridade(t.priority),
    data_inicio: dataISO(t.start_date),
    data_vencimento: dataISO(t.due_date),
    estimativa_minutos: estimativaMs > 0 ? Math.round(estimativaMs / 60000) : null,
    etiquetas,
    posicao: Number.isFinite(Number(t.orderindex)) ? Number(t.orderindex) : 0,
    criado_por: emailLimpo(t.creator?.email),
    concluida_em: instanteISO(t.date_closed ?? t.date_done),
    created_at: instanteISO(t.date_created),
    responsaveis,
    checklist,
  }
}

/** Data de criação em ms, para o corte "só a partir de". */
export function criadaEm(t: ClickupTask): number {
  const n = Number(t.date_created ?? 0)
  return Number.isFinite(n) ? n : 0
}
