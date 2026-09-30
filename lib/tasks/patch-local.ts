import type { Prioridade, Status, Tarefa, ValorCampo } from './types'

/** Os campos que o modal e as linhas editam sem esperar o servidor. */
export interface PatchLocal {
  titulo?: string
  descricao?: string | null
  status_id?: string
  prioridade?: Prioridade | null
  data_inicio?: string | null
  data_vencimento?: string | null
  estimativa_minutos?: number | null
  etiquetas?: string[]
  responsaveis?: string[]
  reuniao_url?: string | null
  links?: { url: string; titulo: string }[]
  campo?: { id: string; valor: ValorCampo }
}

/**
 * Aplica uma mudança à cópia local da tarefa, do jeito que o servidor
 * vai aplicar. É o que faz o clique responder na hora: a tela muda com
 * este resultado e o servidor confirma por trás. Se ele recusar, quem
 * chamou volta para a tarefa anterior.
 */
export function aplicarPatchLocal(tarefa: Tarefa, patch: PatchLocal, statuses: Status[] = []): Tarefa {
  const nova: Tarefa = { ...tarefa, updated_at: new Date().toISOString() }

  if (patch.titulo !== undefined) nova.titulo = patch.titulo
  if (patch.descricao !== undefined) nova.descricao = patch.descricao
  if (patch.prioridade !== undefined) nova.prioridade = patch.prioridade
  if (patch.data_inicio !== undefined) nova.data_inicio = patch.data_inicio
  if (patch.data_vencimento !== undefined) nova.data_vencimento = patch.data_vencimento
  if (patch.estimativa_minutos !== undefined) nova.estimativa_minutos = patch.estimativa_minutos
  if (patch.etiquetas !== undefined) nova.etiquetas = patch.etiquetas
  if (patch.responsaveis !== undefined) nova.responsaveis = patch.responsaveis
  if (patch.reuniao_url !== undefined) nova.reuniao_url = patch.reuniao_url
  if (patch.links !== undefined) nova.links = patch.links

  if (patch.status_id !== undefined) {
    const s = statuses.find((x) => x.id === patch.status_id)
    if (s) {
      nova.status_id = s.id
      nova.status_nome = s.nome
      nova.status_cor = s.cor
      nova.status_tipo = s.tipo
      nova.status_posicao = s.posicao
      const encerra = s.tipo === 'concluido' || s.tipo === 'fechado'
      nova.concluida_em = encerra ? (tarefa.concluida_em ?? new Date().toISOString()) : null
    }
  }

  if (patch.campo !== undefined) {
    const campos = { ...tarefa.campos }
    const v = patch.campo.valor
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete campos[patch.campo.id]
    else campos[patch.campo.id] = v
    nova.campos = campos
  }

  return nova
}
