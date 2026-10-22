/**
 * Descrição das tarefas em texto rico (HTML gerado pelo editor).
 * Descrições antigas — escritas antes do editor ou importadas do
 * ClickUp — são texto puro; estas funções tratam os dois formatos.
 * Puro, sem dependências: vale no servidor e no navegador.
 */

/** Imagens da descrição apontam sempre para esta rota do Hub, nunca para o Storage direto. */
export const PREFIXO_IMAGEM = '/api/tasks/imagem?c='

/** Caminho no bucket de uma imagem de descrição: descricao/<espaço>/<uuid>.<ext>. */
export const CAMINHO_IMAGEM = /^descricao\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/

export function srcDaImagem(caminho: string): string {
  return `${PREFIXO_IMAGEM}${encodeURIComponent(caminho)}`
}

/** true quando o texto já é HTML do editor (começa com uma tag). */
export function ehHtml(texto: string | null | undefined): boolean {
  return Boolean(texto && texto.trimStart().startsWith('<'))
}

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Texto puro → HTML: linha em branco separa parágrafos, quebra simples vira <br>. */
export function textoParaHtml(texto: string): string {
  return texto
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapar(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** O que o editor deve abrir: HTML como está; texto puro convertido. */
export function descricaoParaEditor(valor: string | null | undefined): string {
  if (!valor) return ''
  return ehHtml(valor) ? valor : textoParaHtml(valor)
}
