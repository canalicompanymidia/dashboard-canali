import ICAL from 'ical.js'

import { reconhecerLink } from './links'
import type { Tarefa } from './types'

/**
 * iCalendar nos dois sentidos:
 *   • gerar a agenda assinável do Tasks (tarefas com vencimento);
 *   • ler o endereço iCal secreto do Google Calendar de uma pessoa e
 *     extrair as reuniões de um período, com recorrências expandidas.
 */

// ---------------------------------------------------------------------------
//  Geração
// ---------------------------------------------------------------------------

function escapar(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Dobra linhas a 75 octetos, como manda a RFC 5545. */
function dobrar(linha: string): string {
  const bytes = Buffer.from(linha, 'utf8')
  if (bytes.length <= 75) return linha
  const partes: string[] = []
  let i = 0
  let primeira = true
  while (i < bytes.length) {
    const max = primeira ? 75 : 74
    let fim = Math.min(i + max, bytes.length)
    // Não corta no meio de um caractere multibyte.
    while (fim < bytes.length && fim > i && (bytes[fim] & 0xc0) === 0x80) fim--
    partes.push((primeira ? '' : ' ') + bytes.subarray(i, fim).toString('utf8'))
    i = fim
    primeira = false
  }
  return partes.join('\r\n')
}

function dataCompacta(iso: string): string {
  return iso.replace(/-/g, '')
}

function proximoDia(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** A agenda .ics de uma pessoa: um evento de dia inteiro por tarefa com vencimento. */
export function gerarAgendaICS(tarefas: Tarefa[], origem: string, agora = new Date()): string {
  const stamp = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Canali Co.//Hub Canali Company Tasks//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Tasks · Hub Canali Company',
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ]

  for (const t of tarefas) {
    if (!t.data_vencimento) continue
    const url = `${origem}/tasks/t/${t.id}`
    const concluida = Boolean(t.concluida_em)
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@hubcanalicompany.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dataCompacta(t.data_vencimento)}`,
      `DTEND;VALUE=DATE:${dataCompacta(proximoDia(t.data_vencimento))}`,
      `SUMMARY:${escapar(`${concluida ? '✓ ' : ''}${t.titulo}`)}`,
      `DESCRIPTION:${escapar(`${t.status_nome} · ${t.espaco_nome} / ${t.lista_nome}\n${url}`)}`,
      `URL:${url}`,
      `CATEGORIES:${escapar(t.lista_nome)}`,
      `STATUS:${concluida ? 'COMPLETED' : 'CONFIRMED'}`,
      `LAST-MODIFIED:${t.updated_at.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
      'END:VEVENT',
    )
  }

  linhas.push('END:VCALENDAR')
  return linhas.map(dobrar).join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
//  Leitura do Google Calendar
// ---------------------------------------------------------------------------

export interface EventoAgenda {
  id: string
  titulo: string
  /** Instantes ISO (UTC). Em evento de dia inteiro, `dia_inteiro` é true e `inicio` é a meia-noite local. */
  inicio: string
  fim: string
  dia_inteiro: boolean
  /** 'AAAA-MM-DD' em São Paulo, para agrupar por dia. */
  dia: string
  local: string | null
  /** Link da sala (Meet, Zoom, Teams), se houver. */
  reuniao_url: string | null
  origem: 'google'
}

function diaEmSaoPaulo(data: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data)
}

function acharLinkDeReuniao(...textos: (string | null | undefined)[]): string | null {
  for (const texto of textos) {
    if (!texto) continue
    const urls = texto.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []
    for (const u of urls) {
      if (reconhecerLink(u).reuniao) return u
    }
  }
  return null
}

/**
 * Extrai os eventos entre `inicio` e `fim` (datas 'AAAA-MM-DD', inclusive)
 * de um arquivo .ics do Google Calendar. Recorrências são expandidas;
 * exceções (uma ocorrência movida ou cancelada) são respeitadas.
 */
export function extrairEventos(icsTexto: string, inicio: string, fim: string): EventoAgenda[] {
  const jcal = ICAL.parse(icsTexto)
  const calendario = new ICAL.Component(jcal)

  // Fusos declarados no arquivo: sem registrá-los, horários locais viram UTC.
  for (const vtz of calendario.getAllSubcomponents('vtimezone')) {
    const tz = new ICAL.Timezone(vtz)
    if (tz.tzid && !ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz, tz.tzid)
  }

  const inicioJS = new Date(`${inicio}T00:00:00-03:00`)
  const fimJS = new Date(`${fim}T23:59:59-03:00`)
  const rangeInicio = ICAL.Time.fromJSDate(inicioJS, true)
  const rangeFim = ICAL.Time.fromJSDate(fimJS, true)

  // Agrupa por UID: o evento-mestre e as exceções (RECURRENCE-ID) dele.
  const mestres = new Map<string, ICAL.Event>()
  const excecoes: ICAL.Event[] = []
  for (const ve of calendario.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(ve)
    if (ev.isRecurrenceException()) excecoes.push(ev)
    else mestres.set(ev.uid, ev)
  }
  for (const ex of excecoes) {
    const mestre = mestres.get(ex.uid)
    if (mestre) mestre.relateException(ex)
    else mestres.set(`${ex.uid}#${ex.recurrenceId.toString()}`, ex)
  }

  const eventos: EventoAgenda[] = []

  const incluir = (ev: ICAL.Event, comeco: ICAL.Time, termino: ICAL.Time) => {
    const status = String(ev.component.getFirstPropertyValue('status') ?? '').toUpperCase()
    if (status === 'CANCELLED') return
    // Dia inteiro: o ICS traz só a data; ancoramos em São Paulo para não escorregar de dia.
    const comecoJS = comeco.isDate ? new Date(`${comeco.toString()}T00:00:00-03:00`) : comeco.toJSDate()
    const terminoJS = termino.isDate ? new Date(`${termino.toString()}T00:00:00-03:00`) : termino.toJSDate()
    if (terminoJS < inicioJS || comecoJS > fimJS) return
    const local = ev.location ? String(ev.location) : null
    const conferencia = ev.component.getFirstPropertyValue('x-google-conference')
    eventos.push({
      id: `${ev.uid}:${comeco.toString()}`,
      titulo: ev.summary ? String(ev.summary) : '(sem título)',
      inicio: comecoJS.toISOString(),
      fim: terminoJS.toISOString(),
      dia_inteiro: Boolean(comeco.isDate),
      dia: diaEmSaoPaulo(comecoJS),
      local,
      reuniao_url: acharLinkDeReuniao(conferencia ? String(conferencia) : null, local, ev.description ? String(ev.description) : null),
      origem: 'google',
    })
  }

  for (const ev of mestres.values()) {
    try {
      if (ev.isRecurring()) {
        const it = ev.iterator()
        let proxima: ICAL.Time | null
        let guarda = 0
        while ((proxima = it.next()) && guarda++ < 5000) {
          if (proxima.compare(rangeFim) > 0) break
          const det = ev.getOccurrenceDetails(proxima)
          if (det.endDate.compare(rangeInicio) < 0) continue
          incluir(det.item, det.startDate, det.endDate)
        }
      } else {
        incluir(ev, ev.startDate, ev.endDate)
      }
    } catch {
      // Um evento malformado não pode derrubar a agenda inteira.
    }
  }

  eventos.sort((a, b) => a.inicio.localeCompare(b.inicio))
  return eventos
}

/** Só aceitamos o endereço iCal secreto do próprio Google Calendar. */
export function enderecoGoogleValido(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'calendar.google.com' && u.pathname.startsWith('/calendar/ical/') && u.pathname.endsWith('.ics')
  } catch {
    return false
  }
}
