'use server'

import { redirect } from 'next/navigation'

import { getColaborador } from '@/lib/auth'
import { validarSenha } from '@/lib/senha'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface SenhaState {
  ok: boolean
  message: string
}

/**
 * Grava a senha escolhida.
 *
 * Só funciona com uma sessão válida — que vem do link de convite ou de
 * redefinição, ambos de uso único e com validade de uma hora. Sem sessão,
 * a atualização é recusada pelo próprio Supabase.
 */
export async function definirSenha(
  _prev: SenhaState | null,
  formData: FormData,
): Promise<SenhaState> {
  const senha = String(formData.get('senha') ?? '')
  const confirmacao = String(formData.get('confirmacao') ?? '')

  if (senha !== confirmacao) {
    return { ok: false, message: 'As duas senhas não são iguais.' }
  }

  // A mesma regra do formulário, revalidada aqui. A do navegador é
  // conforto; esta é a que um cliente não contorna.
  const regra = validarSenha(senha)
  if (!regra.ok) return { ok: false, message: regra.message }

  const colaborador = await getColaborador()
  if (!colaborador) {
    return {
      ok: false,
      message: 'Sua sessão expirou. Peça um novo link na tela de entrada.',
    }
  }

  const supabase = await getSupabaseServerClient()
  if (!supabase) return { ok: false, message: 'Supabase não configurado neste servidor.' }

  const { error } = await supabase.auth.updateUser({ password: senha })

  if (error) {
    // O Supabase tem a própria política de senha, configurada no painel.
    // Repassar a mensagem dele evita "erro desconhecido" quando as duas
    // regras não estiverem alinhadas.
    return { ok: false, message: `Não foi possível salvar a senha: ${error.message}` }
  }

  redirect('/?senha=ok')
}
