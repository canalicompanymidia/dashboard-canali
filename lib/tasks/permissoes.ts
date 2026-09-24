import type { Pessoa } from './types'

/**
 * Regras de acesso do módulo Tasks — puras, sem banco. As Server Actions
 * e a camada de dados chamam estas funções depois de carregar o que
 * precisam; assim a regra é uma só, escrita num lugar.
 *
 *   • Espaço público: todo colaborador vê e mexe.
 *   • Espaço privado: admins e os membros listados.
 *   • Apagar espaço, ou mudar quem o vê: admin ou quem criou.
 *   • Apagar pasta/lista: admin, quem criou, ou dono do espaço.
 *   • Tarefas: quem enxerga o espaço faz tudo — é ferramenta de time.
 *   • Comentário: só o autor edita; admin também apaga.
 */

export interface EspacoAcesso {
  privado: boolean
  criado_por: string | null
  membros: string[]
}

export function podeVerEspaco(colab: Pessoa, espaco: EspacoAcesso): boolean {
  if (!espaco.privado) return true
  if (colab.papel === 'admin') return true
  if (espaco.criado_por === colab.email) return true
  return espaco.membros.includes(colab.email)
}

export function podeAdministrarEspaco(colab: Pessoa, espaco: EspacoAcesso): boolean {
  return colab.papel === 'admin' || espaco.criado_por === colab.email
}

export function podeApagarItem(
  colab: Pessoa,
  item: { criado_por: string | null },
  espaco: EspacoAcesso,
): boolean {
  return (
    colab.papel === 'admin' ||
    item.criado_por === colab.email ||
    espaco.criado_por === colab.email
  )
}

export function podeEditarComentario(colab: Pessoa, autor: string): boolean {
  return autor === colab.email
}

export function podeApagarComentario(colab: Pessoa, autor: string): boolean {
  return colab.papel === 'admin' || autor === colab.email
}
