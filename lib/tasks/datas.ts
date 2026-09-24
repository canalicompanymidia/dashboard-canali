import { BUSINESS_TIMEZONE } from '@/lib/utils'

/**
 * Datas do módulo Tasks.
 *
 * Vencimento e início são DATAS (sem hora) no banco, no formato
 * 'AAAA-MM-DD'. "Hoje" é sempre o dia em São Paulo, no servidor e no
 * navegador, para uma tarefa não virar atrasada às 21h porque o
 * computador de alguém está em outro fuso.
 */

/** 'AAAA-MM-DD' de hoje, no fuso do negócio. */
export function hojeISO(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora)
}

/** Soma dias a uma data 'AAAA-MM-DD' sem passar por fuso horário. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const data = new Date(Date.UTC(a, m - 1, d + dias))
  return data.toISOString().slice(0, 10)
}

/** Diferença em dias entre duas datas ISO (b - a). */
export function diferencaDias(a: string, b: string): number {
  const [aa, am, ad] = a.split('-').map(Number)
  const [ba, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ba, bm - 1, bd) - Date.UTC(aa, am - 1, ad)) / 86_400_000)
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const DIAS_SEMANA_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Dia da semana (0 = domingo) de uma data ISO. */
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

/**
 * Data curta para listas e cards: "Hoje", "Amanhã", "Ontem", "23 set" ou
 * "23 set 25" quando é de outro ano.
 */
export function formatarDataCurta(iso: string | null | undefined, hoje = hojeISO()): string {
  if (!iso) return ''
  const diff = diferencaDias(hoje, iso)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  if (diff === -1) return 'Ontem'
  const [a, m, d] = iso.split('-').map(Number)
  const mes = MESES_CURTOS[m - 1]
  return a === Number(hoje.slice(0, 4)) ? `${d} ${mes}` : `${d} ${mes} ${String(a).slice(2)}`
}

/** "23 de setembro de 2026" */
export function formatarDataLonga(iso: string | null | undefined): string {
  if (!iso) return ''
  const [a, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(a, m - 1, d)))
}

/** "há 5 min", "há 3 h", "ontem", "12 set" — para o histórico. */
export function formatarRelativo(isoDateTime: string, agora: Date = new Date()): string {
  const data = new Date(isoDateTime)
  const segundos = Math.round((agora.getTime() - data.getTime()) / 1000)
  if (segundos < 60) return 'agora'
  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.round(horas / 24)
  if (dias === 1) return 'ontem'
  if (dias < 7) return `há ${dias} dias`
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone: BUSINESS_TIMEZONE,
  })
    .format(data)
    .replace('.', '')
}

/** "12 set às 08:10" */
export function formatarDataHora(isoDateTime: string): string {
  const data = new Date(isoDateTime)
  const dia = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone: BUSINESS_TIMEZONE,
  })
    .format(data)
    .replace('.', '')
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIMEZONE,
  }).format(data)
  return `${dia} às ${hora}`
}

/** Estimativa em minutos → "2h 30min", "45min". */
export function formatarEstimativa(minutos: number | null | undefined): string {
  if (!minutos) return ''
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h && m) return `${h}h ${m}min`
  if (h) return `${h}h`
  return `${m}min`
}

/**
 * "2h30", "1,5h", "90min", "90" → minutos. Aceita o que o time digitar.
 * Devolve null para texto que não é tempo.
 */
export function interpretarEstimativa(texto: string): number | null {
  const t = texto.trim().toLowerCase().replace(',', '.')
  if (!t) return null
  const hm = t.match(/^(\d+)\s*h\s*(\d+)\s*(min|m)?$/)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2])
  const h = t.match(/^(\d+(?:\.\d+)?)\s*h$/)
  if (h) return Math.round(Number(h[1]) * 60)
  const m = t.match(/^(\d+)\s*(min|m)$/)
  if (m) return Number(m[1])
  const n = t.match(/^(\d+)$/)
  if (n) return Number(n[1])
  return null
}
