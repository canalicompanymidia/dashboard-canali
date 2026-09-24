import { hojeISO } from './datas'
import type { Tarefa } from './types'

/** Blocos da Home: "Hoje", "Em atraso", "Próximo" e "Não programado". */
export type GrupoPrazo = 'atrasadas' | 'hoje' | 'proximas' | 'sem_data'

export function grupoDePrazo(tarefa: Pick<Tarefa, 'data_vencimento'>, hoje = hojeISO()): GrupoPrazo {
  if (!tarefa.data_vencimento) return 'sem_data'
  if (tarefa.data_vencimento < hoje) return 'atrasadas'
  if (tarefa.data_vencimento === hoje) return 'hoje'
  return 'proximas'
}
