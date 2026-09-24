import 'server-only'

import type {
  ClickupComment,
  ClickupFolder,
  ClickupList,
  ClickupSpace,
  ClickupStatus,
  ClickupTask,
  ClickupTeam,
} from './tipos'

/**
 * Cliente mínimo da API v2 do ClickUp.
 *
 * O token pessoal vem do formulário do admin a cada chamada e nunca é
 * gravado. O ClickUp limita a 100 requisições por minuto por token: um
 * 429 vira `ClickupErro` com `aguardar` em segundos, e é o navegador
 * que espera e tenta de novo — assim nenhuma função do servidor fica
 * parada esperando o relógio.
 */

const BASE = 'https://api.clickup.com/api/v2'
const TEMPO_LIMITE_MS = 25_000

export class ClickupErro extends Error {
  status: number
  /** Segundos a esperar antes de tentar de novo (só no 429). */
  aguardar?: number

  constructor(message: string, status: number, aguardar?: number) {
    super(message)
    this.name = 'ClickupErro'
    this.status = status
    this.aguardar = aguardar
  }
}

type Parametros = Record<string, string | number | boolean | undefined>

async function chamar<T>(token: string, caminho: string, params: Parametros = {}): Promise<T> {
  const url = new URL(BASE + caminho)
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined) url.searchParams.set(chave, String(valor))
  }

  const controlador = new AbortController()
  const timer = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS)

  try {
    const res = await fetch(url, {
      headers: { Authorization: token, Accept: 'application/json' },
      signal: controlador.signal,
      cache: 'no-store',
    })

    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after'))
      const reset = Number(res.headers.get('x-ratelimit-reset'))
      let aguardar = 20
      if (retry > 0) aguardar = retry
      else if (reset > 0) aguardar = Math.max(5, reset - Math.floor(Date.now() / 1000))
      throw new ClickupErro('Limite de requisições do ClickUp atingido.', 429, Math.min(aguardar, 90))
    }

    if (res.status === 401) {
      throw new ClickupErro(
        'O ClickUp recusou o token. Confira se copiou o token inteiro (ele começa com "pk_").',
        401,
      )
    }

    if (!res.ok) {
      const texto = await res.text().catch(() => '')
      throw new ClickupErro(
        `O ClickUp respondeu ${res.status}${texto ? `: ${texto.slice(0, 200)}` : ''}`,
        res.status,
      )
    }

    return (await res.json()) as T
  } catch (e) {
    if (e instanceof ClickupErro) throw e
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ClickupErro('O ClickUp demorou demais para responder. Tente de novo.', 504)
    }
    throw new ClickupErro(`Falha ao falar com o ClickUp: ${e instanceof Error ? e.message : String(e)}`, 0)
  } finally {
    clearTimeout(timer)
  }
}

export interface OpcoesDeTarefas {
  /** Só tarefas criadas a partir deste instante (ms). */
  desdeMs: number
  incluirFechadas: boolean
}

export const clickup = {
  equipes: (token: string) =>
    chamar<{ teams?: ClickupTeam[] }>(token, '/team').then((r) => r.teams ?? []),

  espacos: (token: string, teamId: string) =>
    chamar<{ spaces?: ClickupSpace[] }>(token, `/team/${teamId}/space`, { archived: false }).then(
      (r) => r.spaces ?? [],
    ),

  pastas: (token: string, spaceId: string) =>
    chamar<{ folders?: ClickupFolder[] }>(token, `/space/${spaceId}/folder`, { archived: false }).then(
      (r) => r.folders ?? [],
    ),

  listasSoltas: (token: string, spaceId: string) =>
    chamar<{ lists?: ClickupList[] }>(token, `/space/${spaceId}/list`, { archived: false }).then(
      (r) => r.lists ?? [],
    ),

  statusesDaLista: (token: string, listId: string) =>
    chamar<{ statuses?: ClickupStatus[] }>(token, `/list/${listId}`).then((r) => r.statuses ?? []),

  /** Uma página (até 100) de tarefas da lista, subtarefas incluídas. */
  tarefas: (token: string, listId: string, pagina: number, opcoes: OpcoesDeTarefas) =>
    chamar<{ tasks?: ClickupTask[]; last_page?: boolean }>(token, `/list/${listId}/task`, {
      page: pagina,
      subtasks: true,
      include_closed: opcoes.incluirFechadas,
      // "maior que": tira 1 ms para incluir o próprio instante do corte.
      date_created_gt: opcoes.desdeMs > 0 ? opcoes.desdeMs - 1 : undefined,
      order_by: 'created',
      reverse: false,
    }).then((r) => ({ tarefas: r.tasks ?? [], ultimaPagina: r.last_page !== false })),

  comentarios: (token: string, taskId: string) =>
    chamar<{ comments?: ClickupComment[] }>(token, `/task/${taskId}/comment`).then(
      (r) => r.comments ?? [],
    ),
}
