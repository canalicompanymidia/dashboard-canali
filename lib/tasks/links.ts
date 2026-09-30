/**
 * Reconhecimento de links: o tipo de serviço por trás de uma URL, para
 * mostrar cartão com nome e cor em vez de um endereço cru. Puro, sem
 * rede; vale no servidor e no navegador.
 */

export type TipoLink =
  | 'meet'
  | 'zoom'
  | 'teams'
  | 'drive'
  | 'docs'
  | 'sheets'
  | 'slides'
  | 'forms'
  | 'youtube'
  | 'figma'
  | 'canva'
  | 'notion'
  | 'clickup'
  | 'instagram'
  | 'whatsapp'
  | 'link'

export interface LinkTarefa {
  url: string
  titulo: string
}

export interface LinkReconhecido {
  tipo: TipoLink
  rotulo: string
  cor: string
  /** true para Meet, Zoom e Teams: são salas de reunião. */
  reuniao: boolean
}

const REGRAS: { tipo: TipoLink; teste: RegExp; rotulo: string; cor: string; reuniao?: boolean }[] = [
  { tipo: 'meet', teste: /(^|\.)meet\.google\.com$/, rotulo: 'Google Meet', cor: '#00897b', reuniao: true },
  { tipo: 'zoom', teste: /(^|\.)zoom\.(us|com)$/, rotulo: 'Zoom', cor: '#2d8cff', reuniao: true },
  { tipo: 'teams', teste: /(^|\.)teams\.(microsoft|live)\.com$/, rotulo: 'Teams', cor: '#5059c9', reuniao: true },
  { tipo: 'docs', teste: /^docs\.google\.com$/, rotulo: 'Google Docs', cor: '#4285f4' },
  { tipo: 'drive', teste: /^drive\.google\.com$/, rotulo: 'Google Drive', cor: '#fbbc04' },
  { tipo: 'youtube', teste: /(^|\.)(youtube\.com|youtu\.be)$/, rotulo: 'YouTube', cor: '#ff0000' },
  { tipo: 'figma', teste: /(^|\.)figma\.com$/, rotulo: 'Figma', cor: '#a259ff' },
  { tipo: 'canva', teste: /(^|\.)canva\.com$/, rotulo: 'Canva', cor: '#00c4cc' },
  { tipo: 'notion', teste: /(^|\.)notion\.(so|site)$/, rotulo: 'Notion', cor: '#37352f' },
  { tipo: 'clickup', teste: /(^|\.)clickup\.com$/, rotulo: 'ClickUp', cor: '#7b68ee' },
  { tipo: 'instagram', teste: /(^|\.)instagram\.com$/, rotulo: 'Instagram', cor: '#e1306c' },
  { tipo: 'whatsapp', teste: /(^|\.)(wa\.me|whatsapp\.com)$/, rotulo: 'WhatsApp', cor: '#25d366' },
]

export function reconhecerLink(url: string): LinkReconhecido {
  let host = ''
  let caminho = ''
  try {
    const u = new URL(url)
    host = u.hostname.toLowerCase()
    caminho = u.pathname
  } catch {
    return { tipo: 'link', rotulo: 'Link', cor: '#62676f', reuniao: false }
  }

  // docs.google.com serve Docs, Planilhas, Apresentações e Formulários.
  if (host === 'docs.google.com') {
    if (caminho.startsWith('/spreadsheets')) return { tipo: 'sheets', rotulo: 'Google Planilhas', cor: '#0f9d58', reuniao: false }
    if (caminho.startsWith('/presentation')) return { tipo: 'slides', rotulo: 'Google Apresentações', cor: '#f4b400', reuniao: false }
    if (caminho.startsWith('/forms')) return { tipo: 'forms', rotulo: 'Google Formulários', cor: '#7248b9', reuniao: false }
  }

  for (const r of REGRAS) {
    if (r.teste.test(host)) return { tipo: r.tipo, rotulo: r.rotulo, cor: r.cor, reuniao: Boolean(r.reuniao) }
  }
  return { tipo: 'link', rotulo: host.replace(/^www\./, '') || 'Link', cor: '#62676f', reuniao: false }
}

/** Só http(s), para nunca virar um href de javascript: ou data:. */
export function urlSegura(texto: string): string | null {
  const t = texto.trim()
  if (!/^https?:\/\//i.test(t)) return null
  try {
    return new URL(t).toString()
  } catch {
    return null
  }
}

/** Título curto quando a pessoa não digita um: o domínio, sem "www.". */
export function tituloPadrao(url: string): string {
  const r = reconhecerLink(url)
  if (r.tipo !== 'link') return r.rotulo
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Link'
  }
}
