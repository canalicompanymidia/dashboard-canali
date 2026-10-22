import 'server-only'

/**
 * Envio de e-mail transacional pela API do Resend (sem SDK: um POST).
 *
 *   RESEND_API_KEY   chave da API (Resend › API Keys)
 *   RESEND_FROM      remetente num domínio verificado no Resend,
 *                    ex.: "Hub Canali Company <tarefas@hubcanalicompany.app>"
 *
 * Sem as duas variáveis, nada é enviado e nada quebra: o Hub segue
 * normal e só registra o aviso no log do servidor.
 */

export function emailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM)
}

export interface Email {
  para: string
  assunto: string
  html: string
  texto: string
}

export async function enviarEmail(email: Email): Promise<{ ok: boolean; erro?: string }> {
  const chave = process.env.RESEND_API_KEY
  const remetente = process.env.RESEND_FROM
  if (!chave || !remetente) return { ok: false, erro: 'RESEND_API_KEY/RESEND_FROM não configurados.' }

  const controlador = new AbortController()
  const timer = setTimeout(() => controlador.abort(), 10_000)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remetente, to: [email.para], subject: email.assunto, html: email.html, text: email.texto }),
      signal: controlador.signal,
    })
    if (!res.ok) return { ok: false, erro: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'falha de rede' }
  } finally {
    clearTimeout(timer)
  }
}
