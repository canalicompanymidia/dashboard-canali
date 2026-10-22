import 'server-only'

import sanitizeHtml from 'sanitize-html'

import { ehHtml, PREFIXO_IMAGEM } from './descricao'

/**
 * Limpa o HTML da descrição antes de gravar. O editor só produz estas
 * tags, mas a Server Action é um endpoint: qualquer um poderia mandar
 * <script>, um onerror ou uma imagem de rastreamento. Só sobra o que o
 * editor sabe desenhar; imagens só da rota interna do Hub; links só
 * http(s) e mailto, abrindo em nova aba.
 */
export function sanitizarDescricao(valor: string | null | undefined): string | null {
  if (!valor || !valor.trim()) return null
  // Texto puro (descrições antigas) segue como está: é sempre exibido escapado.
  if (!ehHtml(valor)) return valor

  const limpo = sanitizeHtml(valor, {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'hr', 'a', 'img',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      ol: ['start'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer nofollow' }),
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !String(frame.attribs.src ?? '').startsWith(PREFIXO_IMAGEM),
  })

  // Sobrou só casca vazia (<p></p>)? Então não há descrição.
  const temConteudo = /<img\b/i.test(limpo) || limpo.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
  return temConteudo ? limpo : null
}
