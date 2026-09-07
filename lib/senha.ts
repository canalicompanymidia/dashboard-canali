/**
 * Regra de senha do Hub.
 *
 * Sem 'server-only' de propósito: a MESMA função valida no formulário
 * (feedback enquanto a pessoa digita) e no servidor (a barreira que vale).
 * Duas implementações separadas divergiriam, e a do servidor é a única
 * que um cliente não consegue contornar.
 *
 * ATENÇÃO: esta validação protege o formulário do Hub, não a API de auth
 * do Supabase, que aceita chamada direta. A mesma política precisa estar
 * ligada em Authentication > Policies no painel do Supabase — está
 * documentado no README.
 */

export const SENHA_MIN = 8

// bcrypt ignora tudo além de 72 bytes. Sem o corte, uma senha longa seria
// truncada em silêncio e a pessoa acharia que tem mais proteção do que tem.
export const SENHA_MAX = 72

export interface RequisitoSenha {
  id: string
  rotulo: string
  atende: (senha: string) => boolean
}

export const REQUISITOS: RequisitoSenha[] = [
  {
    id: 'tamanho',
    rotulo: `Pelo menos ${SENHA_MIN} caracteres`,
    atende: (s) => s.length >= SENHA_MIN,
  },
  { id: 'minuscula', rotulo: 'Uma letra minúscula', atende: (s) => /[a-z]/.test(s) },
  { id: 'maiuscula', rotulo: 'Uma letra maiúscula', atende: (s) => /[A-Z]/.test(s) },
  { id: 'numero', rotulo: 'Um número', atende: (s) => /\d/.test(s) },
  {
    id: 'especial',
    rotulo: 'Um símbolo (!@#$%&*…)',
    // Exatamente a lista que o Supabase aceita como símbolo:
    //   !@#$%^&*()_+-=[]{};'\:"|<>?,./`~
    //
    // Definir por exclusão (qualquer coisa que não fosse letra ou número)
    // era mais permissivo e criava uma armadilha: "Senhaç1A" passava aqui
    // porque `ç` não é [A-Za-z], e o Supabase recusava na hora de salvar.
    // A pessoa via cinco itens verdes e levava erro assim mesmo.
    atende: (s) => /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/.test(s),
  },
]

export interface ResultadoSenha {
  ok: boolean
  faltando: string[]
  message: string
}

/** Valida a senha contra todos os requisitos. */
export function validarSenha(senha: string): ResultadoSenha {
  if (senha.length > SENHA_MAX) {
    return {
      ok: false,
      faltando: [],
      message: `A senha deve ter no máximo ${SENHA_MAX} caracteres.`,
    }
  }

  const faltando = REQUISITOS.filter((r) => !r.atende(senha)).map((r) => r.rotulo)

  if (faltando.length === 0) return { ok: true, faltando: [], message: '' }

  return {
    ok: false,
    faltando,
    message: `A senha precisa de: ${faltando.join(', ').toLowerCase()}.`,
  }
}

/** Quantos requisitos a senha já cumpre — alimenta a barra do formulário. */
export function forcaSenha(senha: string): number {
  if (!senha) return 0
  return REQUISITOS.filter((r) => r.atende(senha)).length
}
