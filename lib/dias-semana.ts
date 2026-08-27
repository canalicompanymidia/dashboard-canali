/**
 * Dia da semana de uma ação recorrente.
 *
 * O banco guarda o código curto e sem acento ('SAB', não 'SÁB'): é estável,
 * cabe num CHECK simples e não depende de collation. Todo texto exibido sai
 * daqui, então trocar "Toda Quinta" por outro formato é mexer em um lugar só.
 */

export const DIAS_SEMANA = [
  { codigo: 'SEG', curto: 'SEG', nome: 'Segunda-feira', recorrente: 'Toda Segunda' },
  { codigo: 'TER', curto: 'TER', nome: 'Terça-feira', recorrente: 'Toda Terça' },
  { codigo: 'QUA', curto: 'QUA', nome: 'Quarta-feira', recorrente: 'Toda Quarta' },
  { codigo: 'QUI', curto: 'QUI', nome: 'Quinta-feira', recorrente: 'Toda Quinta' },
  { codigo: 'SEX', curto: 'SEX', nome: 'Sexta-feira', recorrente: 'Toda Sexta' },
  // Sábado e domingo não são "-feira" e mudam de gênero: "Todo", não "Toda".
  { codigo: 'SAB', curto: 'SÁB', nome: 'Sábado', recorrente: 'Todo Sábado' },
  { codigo: 'DOM', curto: 'DOM', nome: 'Domingo', recorrente: 'Todo Domingo' },
] as const

export type DiaSemana = (typeof DIAS_SEMANA)[number]['codigo']

/** Os códigos aceitos, na ordem da semana. Espelha o CHECK do banco. */
export const DIAS_SEMANA_CODIGOS = DIAS_SEMANA.map((dia) => dia.codigo) as readonly DiaSemana[]

const POR_CODIGO = new Map(DIAS_SEMANA.map((dia) => [dia.codigo, dia]))

export function getDiaSemana(codigo: string | null | undefined) {
  if (!codigo) return null
  return POR_CODIGO.get(codigo.toUpperCase() as DiaSemana) ?? null
}

/** "Toda Quinta" / "Todo Sábado" — o texto da tag no card. */
export function labelRecorrente(codigo: string | null | undefined): string | null {
  return getDiaSemana(codigo)?.recorrente ?? null
}

/** "Quinta-feira" — o nome por extenso, usado no modal e no admin. */
export function labelDiaSemana(codigo: string | null | undefined): string | null {
  return getDiaSemana(codigo)?.nome ?? null
}
