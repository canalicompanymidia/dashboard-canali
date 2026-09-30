import { VISUALIZACAO_PADRAO_GERAL, type Visualizacao } from './types'

/**
 * Qual visualização uma lista abre. A ordem de decisão:
 *   1. ?view=… na URL (a aba que a pessoa acabou de clicar);
 *   2. a última aba que ESTA pessoa usou nesta lista (cookie deste navegador);
 *   3. o padrão configurado na lista;
 *   4. o padrão configurado no espaço;
 *   5. Quadro, o padrão geral do Tasks.
 *
 * Vale no servidor (lê o cookie) e no navegador (grava o cookie).
 */

export const COOKIE_VIEWS = 'tasks_views'
const MAX_LEMBRADAS = 60

export function ehVisualizacao(v: unknown): v is Visualizacao {
  return v === 'lista' || v === 'quadro' || v === 'calendario'
}

/** Lê o cookie { listaId: view }. Tolerante a lixo. */
export function lerViewsLembradas(bruto: string | undefined | null): Record<string, Visualizacao> {
  if (!bruto) return {}
  try {
    const obj: unknown = JSON.parse(decodeURIComponent(bruto))
    if (!obj || typeof obj !== 'object') return {}
    const saida: Record<string, Visualizacao> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (ehVisualizacao(v) && /^[0-9a-f-]{36}$/i.test(k)) saida[k] = v
    }
    return saida
  } catch {
    return {}
  }
}

export function resolverVisualizacao(opcoes: {
  param?: string | null
  lembrada?: Visualizacao | null
  lista?: Visualizacao | null
  espaco?: Visualizacao | null
}): Visualizacao {
  if (ehVisualizacao(opcoes.param)) return opcoes.param
  if (ehVisualizacao(opcoes.lembrada)) return opcoes.lembrada
  if (ehVisualizacao(opcoes.lista)) return opcoes.lista
  if (ehVisualizacao(opcoes.espaco)) return opcoes.espaco
  return VISUALIZACAO_PADRAO_GERAL
}

/** No navegador: guarda a aba escolhida para esta lista (um ano). */
export function lembrarVisualizacao(listaId: string, view: Visualizacao) {
  if (typeof document === 'undefined') return
  try {
    const atual = lerViewsLembradas(lerCookie(COOKIE_VIEWS))
    delete atual[listaId]
    const entradas = [...Object.entries(atual), [listaId, view] as const].slice(-MAX_LEMBRADAS)
    const valor = encodeURIComponent(JSON.stringify(Object.fromEntries(entradas)))
    const seguro = location.protocol === 'https:' ? '; secure' : ''
    document.cookie = `${COOKIE_VIEWS}=${valor}; path=/tasks; max-age=31536000; samesite=lax${seguro}`
  } catch {
    // Sem cookie a escolha vale só até a próxima navegação.
  }
}

function lerCookie(nome: string): string | undefined {
  const par = document.cookie.split('; ').find((c) => c.startsWith(`${nome}=`))
  return par ? par.slice(nome.length + 1) : undefined
}
