import 'server-only'

import { emailConfigurado, enviarEmail } from '@/lib/email/resend'

import { getPessoas } from './data'
import { formatarDataLonga } from './datas'
import { PRIORIDADES, type Tarefa } from './types'

/**
 * Avisa por e-mail quem acabou de virar responsável por uma tarefa.
 * Quem fez a atribuição não recebe (atribuir a si mesmo não gera e-mail),
 * e só colaboradores ativos recebem. Falha de envio nunca afeta a tarefa:
 * fica só no log do servidor.
 */
export async function avisarResponsaveis(opcoes: {
  tarefa: Tarefa
  novos: string[]
  autor: string
  origem: string
  criada: boolean
}): Promise<void> {
  const { tarefa, autor, origem, criada } = opcoes
  const destinatarios = [...new Set(opcoes.novos.map((e) => e.toLowerCase()))].filter((e) => e !== autor.toLowerCase())
  if (destinatarios.length === 0) return
  if (!emailConfigurado()) {
    console.warn('[tasks] e-mail de atribuição não enviado: configure RESEND_API_KEY e RESEND_FROM.')
    return
  }

  const pessoas = await getPessoas()
  const nomeDe = (email: string) => pessoas.find((p) => p.email === email)?.nome?.trim() || email
  const ativos = new Set(pessoas.map((p) => p.email))

  for (const email of destinatarios) {
    if (!ativos.has(email)) continue
    const conteudo = montarEmail({ tarefa, nomeDestino: nomeDe(email), nomeAutor: nomeDe(autor), origem, criada })
    const r = await enviarEmail({ para: email, ...conteudo })
    if (!r.ok) console.error(`[tasks] falha ao avisar ${email} sobre a tarefa ${tarefa.id}: ${r.erro}`)
  }
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function montarEmail(o: {
  tarefa: Tarefa
  nomeDestino: string
  nomeAutor: string
  origem: string
  criada: boolean
}): { assunto: string; html: string; texto: string } {
  const { tarefa: t } = o
  const link = `${o.origem}/tasks/t/${t.id}`
  const primeiro = o.nomeDestino.split(/\s+/)[0]
  const onde = [t.espaco_nome, t.pasta_nome, t.lista_nome].filter(Boolean).join(' › ')
  const prazo = t.data_vencimento ? formatarDataLonga(t.data_vencimento) : null
  const prioridade = t.prioridade ? PRIORIDADES[t.prioridade].rotulo : null
  const acao = o.criada ? 'criou uma tarefa para você' : 'atribuiu uma tarefa a você'

  const linhas: [string, string][] = [['Onde', onde], ['Status', t.status_nome]]
  if (prazo) linhas.push(['Prazo', prazo])
  if (prioridade) linhas.push(['Prioridade', prioridade])

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0a0b0d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e5e8">
<tr><td style="background:#0b1424;color:#ffffff;padding:16px 24px;font-size:14px;font-weight:600">Hub Canali Company · Tasks</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 6px;font-size:14px;color:#62676f">Olá, ${esc(primeiro)}! ${esc(o.nomeAutor)} ${acao}:</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${esc(t.titulo)}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px">
${linhas.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#62676f">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`).join('')}
</table>
<a href="${esc(link)}" style="display:inline-block;background:#1f6feb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">Abrir tarefa</a>
<p style="margin:20px 0 0;font-size:12px;color:#8a8f98">Se o botão não abrir, copie este endereço: ${esc(link)}</p>
</td></tr></table></td></tr></table></body></html>`

  const texto = [
    `Olá, ${primeiro}! ${o.nomeAutor} ${acao}:`,
    '',
    t.titulo,
    '',
    ...linhas.map(([k, v]) => `${k}: ${v}`),
    '',
    `Abrir tarefa: ${link}`,
  ].join('\n')

  return { assunto: `${o.criada ? 'Nova tarefa' : 'Tarefa atribuída'}: ${t.titulo}`, html, texto }
}
