'use server'

import { headers } from 'next/headers'

import { buscarColaborador } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface LoginState {
  ok: boolean
  message: string
}

/**
 * Envia o link de acesso por e-mail.
 *
 * Confere a lista de autorizados ANTES de pedir o e-mail ao Supabase. Sem
 * isso, qualquer pessoa poderia disparar mensagens em nome da Canali para
 * endereços arbitrários, gastando a cota de e-mail e servindo de vetor de
 * phishing com um remetente legítimo.
 *
 * A resposta é a MESMA nos dois casos, de propósito: confirmar "este
 * e-mail não está autorizado" entregaria de graça quem trabalha aqui.
 */
export async function enviarLinkDeAcesso(
  _prev: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()

  const RESPOSTA_NEUTRA: LoginState = {
    ok: true,
    message:
      'Se este e-mail estiver autorizado, o link de acesso chega em instantes. ' +
      'Confira também a caixa de spam.',
  }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: 'Informe um e-mail válido.' }
  }

  const colaborador = await buscarColaborador(email)
  if (!colaborador) return RESPOSTA_NEUTRA

  const supabase = await getSupabaseServerClient()
  if (!supabase) {
    return { ok: false, message: 'Supabase não configurado neste servidor.' }
  }

  const cabecalhos = await headers()
  const host = cabecalhos.get('x-forwarded-host') ?? cabecalhos.get('host') ?? ''
  const protocolo = cabecalhos.get('x-forwarded-proto') ?? 'https'
  const destino = String(formData.get('destino') ?? '')

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo:
        `${protocolo}://${host}/auth/callback` +
        (destino.startsWith('/') ? `?destino=${encodeURIComponent(destino)}` : ''),
      // A conta é criada no primeiro acesso, mas só chega aqui quem já
      // passou pela lista acima — quem manda é a lista, não o Supabase.
      shouldCreateUser: true,
    },
  })

  if (error) {
    // Limite de envio é o erro comum e tem solução prática; o resto vira
    // mensagem genérica para não vazar detalhe de infraestrutura.
    if (error.status === 429) {
      return { ok: false, message: 'Muitas tentativas. Espere um minuto e peça de novo.' }
    }
    return { ok: false, message: 'Não foi possível enviar o link agora. Tente em instantes.' }
  }

  return RESPOSTA_NEUTRA
}
