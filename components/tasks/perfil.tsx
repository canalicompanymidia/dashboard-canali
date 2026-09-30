'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, Trash2 } from 'lucide-react'

import { pedirUploadDeAvatar, registrarAvatar, removerAvatar, salvarPerfil } from '@/app/tasks/actions'
import { useAcao } from '@/components/tasks/use-acao'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { corDaPessoa, iniciais } from '@/lib/tasks/pessoas'
import { BUCKET_AVATARES, type Equipe, type Pessoa } from '@/lib/tasks/types'

/**
 * "Seu perfil": foto, nome e cargo, editados pela própria pessoa.
 * A foto é reduzida no navegador (256×256, JPEG) antes de subir para o
 * bucket privado por URL assinada — nunca passa pelo servidor do Hub.
 */

const LADO = 256
const LIMITE_ORIGINAL = 15 * 1024 * 1024

async function prepararFoto(arquivo: File): Promise<Blob> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha uma imagem (JPG, PNG ou WebP).')
  if (arquivo.size > LIMITE_ORIGINAL) throw new Error('Imagem grande demais (máx. 15 MB).')
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('Não deu para ler essa imagem.')
  })
  const lado = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = LADO
  canvas.height = LADO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Este navegador não consegue preparar a imagem.')
  ctx.imageSmoothingQuality = 'high'
  // Recorte quadrado pelo centro, depois reduz.
  ctx.drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, LADO, LADO)
  bitmap.close()
  return new Promise((resolver, rejeitar) => {
    canvas.toBlob((blob) => (blob ? resolver(blob) : rejeitar(new Error('Falha ao preparar a imagem.'))), 'image/jpeg', 0.86)
  })
}

export function PerfilCard({
  pessoa,
  equipes,
  gestorNome,
}: {
  pessoa: Pessoa
  equipes: Equipe[]
  gestorNome: string | null
}) {
  const router = useRouter()
  const { executar, pendente, erro, mensagem, limpar } = useAcao()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [nome, setNome] = React.useState(pessoa.nome ?? '')
  const [cargo, setCargo] = React.useState(pessoa.cargo ?? '')
  const [foto, setFoto] = React.useState(pessoa.avatar_url)
  const [enviando, setEnviando] = React.useState(false)
  const [erroFoto, setErroFoto] = React.useState<string | null>(null)
  const [okFoto, setOkFoto] = React.useState<string | null>(null)

  React.useEffect(() => setFoto(pessoa.avatar_url), [pessoa.avatar_url])

  async function trocarFoto(arquivo: File) {
    setErroFoto(null)
    setOkFoto(null)
    setEnviando(true)
    try {
      const blob = await prepararFoto(arquivo)
      const pedido = await pedirUploadDeAvatar({ tipo_mime: 'image/jpeg', tamanho: blob.size })
      if (!pedido.ok) throw new Error(pedido.message)
      const supabase = getSupabaseBrowserClient()
      if (!supabase) throw new Error('Supabase não configurado no navegador.')
      const { error } = await supabase.storage
        .from(BUCKET_AVATARES)
        .uploadToSignedUrl(pedido.data.caminho, pedido.data.token, blob, { contentType: 'image/jpeg' })
      if (error) throw new Error(`Falha ao enviar: ${error.message}`)
      const registro = await registrarAvatar({ caminho: pedido.data.caminho })
      if (!registro.ok) throw new Error(registro.message)
      setFoto(registro.data.avatar_url)
      setOkFoto('Foto atualizada.')
      router.refresh()
    } catch (e) {
      setErroFoto(e instanceof Error ? e.message : 'Não deu para enviar a foto.')
    } finally {
      setEnviando(false)
    }
  }

  async function remover() {
    setErroFoto(null)
    setOkFoto(null)
    setEnviando(true)
    const r = await removerAvatar()
    setEnviando(false)
    if (!r.ok) return setErroFoto(r.message)
    setFoto(null)
    setOkFoto('Foto removida.')
    router.refresh()
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const r = await executar(() => salvarPerfil({ nome, cargo: cargo.trim() || null }))
    if (r) router.refresh()
  }

  const nomeMostrado = nome.trim() || pessoa.nome || pessoa.email

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <span
            className="relative flex size-24 items-center justify-center overflow-hidden rounded-full text-2xl font-semibold text-white ring-4 ring-card shadow-md"
            style={{ backgroundColor: corDaPessoa(pessoa.email) }}
            aria-label="Sua foto"
          >
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária.
              <img src={foto} alt="" className="size-full object-cover" />
            ) : (
              iniciais(nomeMostrado)
            )}
            {enviando ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="size-6 animate-spin text-white" />
              </span>
            ) : null}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0]
              if (arquivo) void trocarFoto(arquivo)
              e.target.value = ''
            }}
          />
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={enviando}>
              <Camera className="size-3.5" />
              {foto ? 'Trocar foto' : 'Adicionar foto'}
            </Button>
            {foto ? (
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => void remover()} disabled={enviando} aria-label="Remover foto" title="Remover foto">
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
          {erroFoto ? <p className="max-w-40 text-center text-[11px] text-destructive">{erroFoto}</p> : null}
          {okFoto ? <p className="text-[11px] text-positive">{okFoto}</p> : null}
        </div>

        <form onSubmit={salvar} className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Seu perfil</h2>
            <p className="text-xs text-muted-foreground">
              É assim que o time vê você no Tasks, nos comentários e no organograma.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="perfil-nome">Nome</Label>
              <Input
                id="perfil-nome"
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value)
                  limpar()
                }}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perfil-cargo">Cargo</Label>
              <Input
                id="perfil-cargo"
                value={cargo}
                onChange={(e) => {
                  setCargo(e.target.value)
                  limpar()
                }}
                placeholder="Designer, Social media, Head de marketing…"
                maxLength={80}
              />
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">E-mail</dt>
            <dd>{pessoa.email}</dd>
            <dt className="text-muted-foreground">Gestor</dt>
            <dd>{gestorNome ?? <span className="text-muted-foreground">— definido pelo administrador em Equipes</span>}</dd>
            <dt className="text-muted-foreground">Equipes</dt>
            <dd>
              {equipes.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {equipes.map((e) => (
                    <span key={e.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: e.cor }} />
                      {e.nome}
                      {e.lider_email === pessoa.email ? <span className="text-muted-foreground">· líder</span> : null}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-muted-foreground">nenhuma ainda</span>
              )}
            </dd>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={pendente || !nome.trim()}>
              {pendente ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Salvar perfil
            </Button>
            {erro ? <span className="text-xs text-destructive">{erro}</span> : null}
            {mensagem ? <span className="text-xs text-positive">{mensagem}</span> : null}
          </div>
        </form>
      </div>
    </section>
  )
}
