'use client'

import * as React from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
} from 'lucide-react'

import { pedirUploadDeImagem } from '@/app/tasks/actions'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { descricaoParaEditor } from '@/lib/tasks/descricao'
import { BUCKET_ANEXOS } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Editor de texto da descrição: negrito, itálico, sublinhado, listas,
 * links e imagens no meio do texto (colar, arrastar ou pelo botão). As
 * imagens sobem direto para o bucket privado por URL assinada e não
 * viram anexo. O HTML é limpo de novo no servidor antes de gravar.
 */

export type DestinoImagem = { tarefa_id: string } | { lista_id: string } | null

const LADO_MAX = 1600
const LIMITE_SEM_REDUZIR = 1.5 * 1024 * 1024

/** Reduz fotos grandes (lado máx. 1600 px, JPEG). GIF e imagens pequenas vão como estão. */
async function prepararImagem(arquivo: File): Promise<Blob> {
  if (arquivo.type === 'image/gif') return arquivo
  const bitmap = await createImageBitmap(arquivo).catch(() => null)
  if (!bitmap) return arquivo
  const maior = Math.max(bitmap.width, bitmap.height)
  if (maior <= LADO_MAX && arquivo.size <= LIMITE_SEM_REDUZIR) {
    bitmap.close()
    return arquivo
  }
  const escala = Math.min(1, LADO_MAX / maior)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  const ctx = canvas.getContext('2d')
  if (!ctx) return arquivo
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolver) => canvas.toBlob((b) => resolver(b ?? arquivo), 'image/jpeg', 0.88))
}

async function enviarImagem(arquivo: File, destino: Exclude<DestinoImagem, null>): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(arquivo.type)) {
    throw new Error('Use uma imagem JPG, PNG, WebP ou GIF.')
  }
  const blob = await prepararImagem(arquivo)
  const tipo = blob.type || arquivo.type
  const pedido = await pedirUploadDeImagem({ ...destino, tipo_mime: tipo, tamanho: blob.size })
  if (!pedido.ok) throw new Error(pedido.message)
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error('Supabase não configurado no navegador.')
  const { error } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .uploadToSignedUrl(pedido.data.caminho, pedido.data.token, blob, { contentType: tipo })
  if (error) throw new Error(`Falha ao enviar a imagem: ${error.message}`)
  return pedido.data.src
}

/** HTML do editor, ou null quando não há nada escrito. */
function valorDe(editor: Editor): string | null {
  if (editor.isEmpty) return null
  return editor.getHTML()
}

export function EditorTexto({
  valor,
  onChange,
  onBlur,
  destinoImagem,
  placeholder = 'Escreva aqui…',
  className,
  minHeight = 'min-h-24',
  rotulo = 'Descrição',
}: {
  valor: string | null
  onChange?: (html: string | null) => void
  onBlur?: (html: string | null) => void
  /** Onde as imagens coladas ficam guardadas. null = sem imagens (ex.: lista ainda não escolhida). */
  destinoImagem: DestinoImagem
  placeholder?: string
  className?: string
  minHeight?: string
  rotulo?: string
}) {
  const [enviando, setEnviando] = React.useState(0)
  const [erro, setErro] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const destinoRef = React.useRef(destinoImagem)
  destinoRef.current = destinoImagem
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange
  const onBlurRef = React.useRef(onBlur)
  onBlurRef.current = onBlur

  const inserirArquivos = React.useCallback(async (editor: Editor, arquivos: File[], pos?: number) => {
    const destino = destinoRef.current
    const imagens = arquivos.filter((f) => f.type.startsWith('image/'))
    if (imagens.length === 0) return false
    if (!destino) {
      setErro('Escolha a lista antes de colar imagens.')
      return true
    }
    setErro(null)
    for (const arquivo of imagens) {
      setEnviando((n) => n + 1)
      try {
        const src = await enviarImagem(arquivo, destino)
        const conteudo = { type: 'image', attrs: { src, alt: arquivo.name.replace(/\.[^.]+$/, '') } }
        if (typeof pos === 'number') editor.chain().focus().insertContentAt(pos, conteudo).run()
        else editor.chain().focus().insertContent(conteudo).run()
        onChangeRef.current?.(valorDe(editor))
        // A imagem chegou depois do "sair do campo": salva de novo.
        if (!editor.isFocused) onBlurRef.current?.(valorDe(editor))
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para enviar a imagem.')
      } finally {
        setEnviando((n) => n - 1)
      }
    }
    return true
  }, [])

  const editor = useEditor({
    immediatelyRender: false,
    // A barra de ferramentas mostra o que está ativo na seleção: redesenha a cada mudança.
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: descricaoParaEditor(valor),
    editorProps: {
      attributes: {
        class: cn('texto-rico px-2 py-1.5 text-sm leading-relaxed outline-none', minHeight),
        'aria-label': rotulo,
      },
      handlePaste: (view, event) => {
        const arquivos = Array.from(event.clipboardData?.files ?? [])
        if (!arquivos.some((f) => f.type.startsWith('image/')) || !editorRef.current) return false
        event.preventDefault()
        void inserirArquivos(editorRef.current, arquivos)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !editorRef.current) return false
        const arquivos = Array.from((event as DragEvent).dataTransfer?.files ?? [])
        if (!arquivos.some((f) => f.type.startsWith('image/'))) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos
        void inserirArquivos(editorRef.current, arquivos, pos)
        return true
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current?.(valorDe(editor)),
    onBlur: ({ editor }) => onBlurRef.current?.(valorDe(editor)),
  })
  const editorRef = React.useRef<Editor | null>(null)
  editorRef.current = editor

  // Valor novo vindo de fora (outra tarefa, recarga): só troca se não estiver editando.
  React.useEffect(() => {
    if (!editor || editor.isFocused) return
    const novo = descricaoParaEditor(valor)
    if (novo !== editor.getHTML() && !(novo === '' && editor.isEmpty)) editor.commands.setContent(novo, { emitUpdate: false })
  }, [editor, valor])

  return (
    <div className={cn('rounded-lg border border-transparent transition-colors focus-within:border-ring hover:border-border', className)}>
      <BarraDeFerramentas
        editor={editor}
        podeImagem={destinoImagem !== null}
        enviando={enviando > 0}
        onImagem={() => inputRef.current?.click()}
      />
      <EditorContent editor={editor} />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (editor && arquivos.length) void inserirArquivos(editor, arquivos)
        }}
      />
      {erro ? <p className="px-2 pb-1.5 text-[11px] text-destructive">{erro}</p> : null}
    </div>
  )
}

function BarraDeFerramentas({
  editor,
  podeImagem,
  enviando,
  onImagem,
}: {
  editor: Editor | null
  podeImagem: boolean
  enviando: boolean
  onImagem: () => void
}) {
  const estado = editor
    ? {
        negrito: editor.isActive('bold'),
        italico: editor.isActive('italic'),
        sublinhado: editor.isActive('underline'),
        riscado: editor.isActive('strike'),
        titulo: editor.isActive('heading', { level: 2 }),
        lista: editor.isActive('bulletList'),
        numerada: editor.isActive('orderedList'),
        citacao: editor.isActive('blockquote'),
        link: editor.isActive('link'),
      }
    : null
  if (!editor || !estado) return <div className="h-8 border-b border-border/60" />

  const botao = (ativo: boolean, rotulo: string, icone: React.ReactNode, acao: () => void, desabilitado = false) => (
    <button
      type="button"
      // mousedown: não tira o foco (e a seleção) do texto.
      onMouseDown={(e) => {
        e.preventDefault()
        if (!desabilitado) acao()
      }}
      disabled={desabilitado}
      aria-label={rotulo}
      aria-pressed={ativo}
      title={rotulo}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40',
        ativo && 'bg-accent text-foreground',
      )}
    >
      {icone}
    </button>
  )

  function link() {
    if (!editor) return
    const atual = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Endereço do link (deixe vazio para remover):', atual ?? 'https://')
    if (url === null) return
    const limpo = url.trim()
    if (!limpo || limpo === 'https://') return void editor.chain().focus().extendMarkRange('link').unsetLink().run()
    const seguro = /^(https?:\/\/|mailto:)/i.test(limpo) ? limpo : `https://${limpo}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: seguro }).run()
  }

  const c = 'size-3.5'
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-1 py-0.5" role="toolbar" aria-label="Formatação">
      {botao(estado.negrito, 'Negrito (Ctrl+B)', <Bold className={c} />, () => editor.chain().focus().toggleBold().run())}
      {botao(estado.italico, 'Itálico (Ctrl+I)', <Italic className={c} />, () => editor.chain().focus().toggleItalic().run())}
      {botao(estado.sublinhado, 'Sublinhado (Ctrl+U)', <UnderlineIcon className={c} />, () => editor.chain().focus().toggleUnderline().run())}
      {botao(estado.riscado, 'Riscado', <Strikethrough className={c} />, () => editor.chain().focus().toggleStrike().run())}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      {botao(estado.titulo, 'Título', <Heading2 className={c} />, () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {botao(estado.lista, 'Lista com marcadores', <List className={c} />, () => editor.chain().focus().toggleBulletList().run())}
      {botao(estado.numerada, 'Lista numerada', <ListOrdered className={c} />, () => editor.chain().focus().toggleOrderedList().run())}
      {botao(estado.citacao, 'Citação', <Quote className={c} />, () => editor.chain().focus().toggleBlockquote().run())}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      {botao(estado.link, 'Link', <Link2 className={c} />, link)}
      {botao(
        false,
        podeImagem ? 'Inserir imagem (ou cole/arraste no texto)' : 'Escolha a lista para poder inserir imagens',
        enviando ? <Loader2 className={cn(c, 'animate-spin')} /> : <ImagePlus className={c} />,
        onImagem,
        !podeImagem || enviando,
      )}
      {enviando ? <span className="ml-1 text-[11px] text-muted-foreground">Enviando imagem…</span> : null}
    </div>
  )
}
