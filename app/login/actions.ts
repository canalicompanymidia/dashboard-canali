'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { buscarColaborador, marcarAcesso } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface LoginState {
  ok: boolean
  message: string
}

/** Base da URL desta instalação, para montar os links de retorno. */
async function origem(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const protocolo = h.get('x-forwarded-proto') ?? 'https'
  return `${protocolo}://${host}`
}

/**
 * Entrada com e-mail e senha.
 *
 * A mensagem de erro é a MESMA para e-mail inexistente, senha errada e
 * e-mail fora da lista. Distinguir os casos transformaria a tela de login
 * num verificador de quem trabalha aqui.
 */
export async function entrarComSenha(
  _prev: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const senha = String(formData.get('senha') ?? '')
  const destinoBruto = String(formData.get('destino') ?? '')

  if (!email || !senha) {
    return { ok: false, message: 'Informe e-mail e senha.' }
  }

  const GENERICO: LoginState = { ok: false, message: 'E-mail ou senha incorretos.' }

  const supabase = await getSupabaseServerClient()
  if (!supabase) return { ok: false, message: 'Supabase não configurado neste servidor.' }

  // A lista vem antes da senha: alguém removido do time não deve nem
  // chegar a ter a senha conferida.
  const colaborador = await buscarColaborador(email)
  if (!colaborador) return GENERICO

  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (error) {
    // 429 é o limite de tentativas do próprio Supabase. Vale dizer, porque
    // a pessoa precisa saber que é só esperar.
    if (error.status === 429) {
      return { ok: false, message: 'Muitas tentativas. Espere um minuto e tente de novo.' }
    }
    return GENERICO
  }

  await marcarAcesso(email)

  const destino = destinoBruto.startsWith('/') && !destinoBruto.startsWith('//') ? destinoBruto : '/'
  redirect(destino)
}

/**
 * Envia o link de redefinição de senha.
 *
 * Confere a lista antes de pedir o e-mail ao Supabase: sem isso, qualquer
 * pessoa dispararia mensagens em nome da Canali para endereços
 * arbitrários — cota de e-mail queimada e um belo vetor de phishing com
 * remetente legítimo.
 *
 * Resposta idêntica nos dois casos, pelo mesmo motivo do login.
 */
export async function pedirRedefinicao(
  _prev: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  const NEUTRA: LoginState = {
    ok: true,
    message:
      'Se este e-mail estiver autorizado, o link para criar uma nova senha chega em instantes. ' +
      'Confira também a caixa de spam.',
  }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: 'Informe um e-mail válido.' }
  }

  const colaborador = await buscarColaborador(email)
  if (!colaborador) return NEUTRA

  const supabase = await getSupabaseServerClient()
  if (!supabase) return { ok: false, message: 'Supabase não configurado neste servidor.' }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origem()}/auth/callback?destino=%2Fdefinir-senha`,
  })

  if (error && error.status === 429) {
    return { ok: false, message: 'Muitas tentativas. Espere um minuto e tente de novo.' }
  }

  return NEUTRA
}
