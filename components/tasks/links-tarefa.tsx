'use client'

import * as React from 'react'
import { Check, Copy, ExternalLink, Link2, Pencil, Plus, Video, X } from 'lucide-react'

import { iniciais } from '@/components/tasks/pecas'
import { Button } from '@/components/ui/button'
import { reconhecerLink, tituloPadrao, urlSegura, type LinkTarefa } from '@/lib/tasks/links'
import { cn } from '@/lib/utils'

/**
 * Reunião e links da tarefa. Nível 1 das integrações: nada de OAuth —
 * a pessoa cola o endereço (Meet, Zoom, Drive, Figma...) e o Hub mostra
 * um cartão reconhecendo o serviço, com "Entrar" quando é uma sala.
 */

const CAMPO =
  'h-7 rounded-md border border-input bg-card px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring'

const ICONE =
  'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground'

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = React.useState(false)
  return (
    <button
      type="button"
      className={ICONE}
      title={rotulo}
      aria-label={rotulo}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1500)
        } catch {
          // Sem clipboard (http, permissão): nada a fazer.
        }
      }}
    >
      {copiado ? <Check className="size-3.5 text-positive" /> : <Copy className="size-3.5" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
//  Reunião
// ---------------------------------------------------------------------------

export function ReuniaoDaTarefa({
  url,
  onChange,
}: {
  url: string | null
  onChange: (url: string | null) => Promise<unknown>
}) {
  const [editando, setEditando] = React.useState(false)
  const [texto, setTexto] = React.useState('')
  const [erro, setErro] = React.useState<string | null>(null)

  function abrirEdicao(inicial = '') {
    setTexto(inicial)
    setErro(null)
    setEditando(true)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const u = urlSegura(texto)
    if (!u) return setErro('Cole um endereço completo, começando com https://')
    setEditando(false)
    await onChange(u)
  }

  if (editando) {
    return (
      <form onSubmit={salvar} className="space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditando(false)}
            placeholder="https://meet.google.com/abc-defg-hij"
            className={cn(CAMPO, 'w-full max-w-xs')}
            aria-label="Link da reunião"
            inputMode="url"
          />
          <Button type="submit" size="sm" className="h-7">
            Salvar
          </Button>
          <button type="button" onClick={() => setEditando(false)} className="text-xs text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Serve Meet, Zoom, Teams ou qualquer sala. No Meet novo, copie o endereço da barra do navegador e cole aqui.
        </p>
        {erro ? <p className="text-[11px] text-destructive">{erro}</p> : null}
      </form>
    )
  }

  if (url) {
    const r = reconhecerLink(url)
    return (
      <div className="flex flex-wrap items-center gap-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-white shadow-xs hover:opacity-90"
          style={{ backgroundColor: r.cor }}
        >
          <Video className="size-3.5" />
          Entrar{r.reuniao ? ` · ${r.rotulo}` : ''}
        </a>
        <BotaoCopiar texto={url} rotulo="Copiar link da reunião" />
        <button type="button" className={ICONE} title="Trocar link" aria-label="Trocar link" onClick={() => abrirEdicao(url)}>
          <Pencil className="size-3.5" />
        </button>
        <button type="button" className={ICONE} title="Remover reunião" aria-label="Remover reunião" onClick={() => void onChange(null)}>
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => abrirEdicao()}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-1.5 text-xs text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground"
      >
        <Video className="size-3.5" />
        Colar link da reunião
      </button>
      <span className="text-xs text-muted-foreground/60">ou</span>
      <a
        href="https://meet.google.com/new"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => abrirEdicao()}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium hover:bg-accent"
        title="Abre um Meet novo em outra aba; depois cole o endereço aqui"
      >
        <Plus className="size-3.5" />
        Criar Meet
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Links
// ---------------------------------------------------------------------------

export const MAX_LINKS = 30

export function LinksDaTarefa({
  links,
  onChange,
}: {
  links: LinkTarefa[]
  onChange: (links: LinkTarefa[]) => Promise<unknown>
}) {
  const [adicionando, setAdicionando] = React.useState(false)
  const [url, setUrl] = React.useState('')
  const [titulo, setTitulo] = React.useState('')
  const [erro, setErro] = React.useState<string | null>(null)

  const sugestao = React.useMemo(() => (urlSegura(url) ? tituloPadrao(url) : ''), [url])

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    const u = urlSegura(url)
    if (!u) return setErro('Cole um endereço completo, começando com https://')
    if (links.length >= MAX_LINKS) return setErro(`No máximo ${MAX_LINKS} links por tarefa.`)
    if (links.some((l) => l.url === u)) return setErro('Este link já está na tarefa.')
    const novo: LinkTarefa = { url: u, titulo: (titulo.trim() || tituloPadrao(u)).slice(0, 120) }
    setUrl('')
    setTitulo('')
    setErro(null)
    setAdicionando(false)
    await onChange([...links, novo])
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Links{links.length > 0 ? ` · ${links.length}` : ''}
        </h3>
        {!adicionando ? (
          <button
            type="button"
            onClick={() => setAdicionando(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Adicionar link
          </button>
        ) : null}
      </div>

      {links.length === 0 && !adicionando ? (
        <button
          type="button"
          onClick={() => setAdicionando(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground hover:text-foreground"
        >
          <Link2 className="size-4" />
          Drive, Docs, Figma, Canva, Notion, Zoom... cole o endereço e vira um cartão
        </button>
      ) : null}

      {links.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {links.map((l) => {
            const r = reconhecerLink(l.url)
            let host = ''
            try {
              host = new URL(l.url).hostname.replace(/^www\./, '')
            } catch {
              host = l.url
            }
            return (
              <li key={l.url} className="group flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                  style={{ backgroundColor: r.cor }}
                  aria-hidden
                >
                  {r.reuniao ? <Video className="size-4" /> : iniciais(r.rotulo)}
                </span>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1" title={l.url}>
                  <p className="truncate text-[13px] font-medium group-hover:underline">{l.titulo}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {r.rotulo}
                    {r.rotulo.toLowerCase() !== host ? ` · ${host}` : ''}
                  </p>
                </a>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className={ICONE} title="Abrir" aria-label={`Abrir ${l.titulo}`}>
                    <ExternalLink className="size-3.5" />
                  </a>
                  <BotaoCopiar texto={l.url} rotulo="Copiar link" />
                  <button
                    type="button"
                    className={cn(ICONE, 'hover:text-destructive')}
                    title="Remover"
                    aria-label={`Remover ${l.titulo}`}
                    onClick={() => void onChange(links.filter((x) => x.url !== l.url))}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {adicionando ? (
        <form onSubmit={adicionar} className="mt-2 space-y-1.5 rounded-lg border border-border bg-muted/30 p-2">
          <div className="grid gap-1.5 sm:grid-cols-[1fr_12rem_auto]">
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdicionando(false)}
              placeholder="https://drive.google.com/..."
              className={CAMPO}
              aria-label="Endereço"
              inputMode="url"
            />
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={sugestao || 'Título (opcional)'}
              className={CAMPO}
              aria-label="Título"
              maxLength={120}
            />
            <div className="flex items-center gap-1">
              <Button type="submit" size="sm" className="h-7">
                Adicionar
              </Button>
              <button type="button" onClick={() => setAdicionando(false)} className="px-1 text-xs text-muted-foreground hover:text-foreground">
                Cancelar
              </button>
            </div>
          </div>
          {erro ? <p className="text-[11px] text-destructive">{erro}</p> : null}
        </form>
      ) : null}
    </section>
  )
}
