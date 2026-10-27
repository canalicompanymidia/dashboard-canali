import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Tarefa } from './types'

/**
 * Caixa de Entrada: grava avisos para quem precisa saber de algo numa
 * tarefa. Nunca avisa quem fez a ação. Falha aqui nunca derruba a ação
 * principal: no máximo, um aviso deixa de existir.
 */

export type TipoAviso = 'atribuida' | 'mencao' | 'comentario' | 'status' | 'prazo'

export const TIPOS_PARA_VOCE: TipoAviso[] = ['atribuida', 'mencao', 'comentario']
export const TIPOS_ATUALIZACOES: TipoAviso[] = ['status', 'prazo']

/** Quem acompanha a tarefa: responsáveis e quem criou. */
export function acompanhantes(tarefa: Pick<Tarefa, 'responsaveis' | 'criado_por'>): string[] {
  return [...new Set([...tarefa.responsaveis, ...(tarefa.criado_por ? [tarefa.criado_por] : [])].map((e) => e.toLowerCase()))]
}

export async function avisar(
  supabase: SupabaseClient,
  opcoes: { tarefaId: string; tipo: TipoAviso; para: string[]; autor: string; detalhe?: Record<string, unknown> },
): Promise<void> {
  const autor = opcoes.autor.toLowerCase()
  const destinos = [...new Set(opcoes.para.map((e) => e.toLowerCase()))].filter((e) => e && e !== autor)
  if (destinos.length === 0) return
  const { error } = await supabase.from('tarefas_notificacoes').insert(
    destinos.map((email) => ({
      email,
      tarefa_id: opcoes.tarefaId,
      tipo: opcoes.tipo,
      autor,
      detalhe: opcoes.detalhe ?? {},
    })),
  )
  if (error) console.error('[tasks] aviso da caixa de entrada não gravado:', error.message)
}
