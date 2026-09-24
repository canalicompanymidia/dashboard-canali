'use client'

import * as React from 'react'
import { Calendar, Check, Flag, Plus, Search, UserRound, X } from 'lucide-react'

import { Avatar, PrioridadeFlag, StatusDot, StatusPill, corTexto } from '@/components/tasks/pecas'
import { useTasks } from '@/components/tasks/provider'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatarDataCurta, hojeISO, somarDias } from '@/lib/tasks/datas'
import {
  PALETA,
  PRIORIDADES,
  PRIORIDADES_ORDEM,
  type Campo,
  type Prioridade,
  type Status,
  type ValorCampo,
} from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Seletores em popover — os mesmos no modal, na lista e no quadro.
 * Cada um recebe um `children` opcional como gatilho; sem ele, desenha
 * o gatilho padrão (o valor atual).
 */

const ITEM =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] outline-none hover:bg-accent focus-visible:bg-accent'

// ---------------------------------------------------------------------------
//  Status
// ---------------------------------------------------------------------------

export function StatusPicker({
  statuses,
  valor,
  onChange,
  children,
  disabled,
}: {
  statuses: Status[]
  valor: string
  onChange: (status: Status) => void
  children?: React.ReactNode
  disabled?: boolean
}) {
  const [aberto, setAberto] = React.useState(false)
  const atual = statuses.find((s) => s.id === valor)

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild disabled={disabled}>
        {children ?? (
          <button type="button" className="inline-flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            {atual ? <StatusPill nome={atual.nome} cor={atual.cor} tamanho="md" /> : <span className="text-xs">—</span>}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Status
        </p>
        {statuses.map((s) => (
          <button
            key={s.id}
            type="button"
            className={cn(ITEM, s.id === valor && 'bg-accent/60')}
            onClick={() => {
              setAberto(false)
              if (s.id !== valor) onChange(s)
            }}
          >
            <StatusDot cor={s.cor} tipo={s.tipo} />
            <span className="flex-1 truncate">{s.nome}</span>
            {s.id === valor ? <Check className="size-3.5 text-muted-foreground" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
//  Prioridade
// ---------------------------------------------------------------------------

export function PrioridadePicker({
  valor,
  onChange,
  children,
}: {
  valor: Prioridade | null
  onChange: (p: Prioridade | null) => void
  children?: React.ReactNode
}) {
  const [aberto, setAberto] = React.useState(false)

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-1.5 text-sm outline-none hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <PrioridadeFlag prioridade={valor} comRotulo />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-48">
        {PRIORIDADES_ORDEM.map((p) => (
          <button
            key={p}
            type="button"
            className={cn(ITEM, p === valor && 'bg-accent/60')}
            onClick={() => {
              setAberto(false)
              onChange(p)
            }}
          >
            <Flag className="size-3.5" style={{ color: PRIORIDADES[p].cor, fill: PRIORIDADES[p].cor }} />
            <span className="flex-1">{PRIORIDADES[p].rotulo}</span>
            {p === valor ? <Check className="size-3.5 text-muted-foreground" /> : null}
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          className={cn(ITEM, 'text-muted-foreground')}
          onClick={() => {
            setAberto(false)
            onChange(null)
          }}
        >
          <X className="size-3.5" />
          Limpar
        </button>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
//  Pessoas
// ---------------------------------------------------------------------------

export function PessoasPicker({
  valor,
  onChange,
  children,
  titulo = 'Responsáveis',
  unica = false,
}: {
  valor: string[]
  onChange: (emails: string[]) => void
  children?: React.ReactNode
  titulo?: string
  /** Só uma pessoa por vez (campos personalizados de "pessoa" única). */
  unica?: boolean
}) {
  const { pessoas, colab, nomeDe } = useTasks()
  const [aberto, setAberto] = React.useState(false)
  const [busca, setBusca] = React.useState('')

  const filtradas = React.useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = q
      ? pessoas.filter((p) => (p.nome ?? '').toLowerCase().includes(q) || p.email.includes(q))
      : pessoas
    // Você primeiro, depois os já selecionados, depois o resto.
    return [...lista].sort((a, b) => {
      const pa = (a.email === colab.email ? 0 : valor.includes(a.email) ? 1 : 2)
      const pb = (b.email === colab.email ? 0 : valor.includes(b.email) ? 1 : 2)
      return pa - pb || (a.nome ?? a.email).localeCompare(b.nome ?? b.email, 'pt-BR')
    })
  }, [pessoas, busca, colab.email, valor])

  function alternar(email: string) {
    if (unica) {
      onChange(valor.includes(email) ? [] : [email])
      setAberto(false)
      return
    }
    onChange(valor.includes(email) ? valor.filter((e) => e !== email) : [...valor, email])
  }

  return (
    <Popover
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o)
        if (!o) setBusca('')
      }}
    >
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-transparent px-1 text-sm outline-none hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {valor.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-input">
                  <UserRound className="size-3.5" />
                </span>
                <span className="text-xs">Atribuir</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex -space-x-1.5">
                  {valor.slice(0, 4).map((e) => (
                    <Avatar key={e} email={e} tamanho="sm" />
                  ))}
                </span>
                {valor.length === 1 ? (
                  <span className="max-w-32 truncate text-xs">{nomeDe(valor[0])}</span>
                ) : valor.length > 4 ? (
                  <span className="text-xs text-muted-foreground">+{valor.length - 4}</span>
                ) : null}
              </span>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={`Buscar ${titulo.toLowerCase()}...`}
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5">
          {filtradas.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Ninguém encontrado.</p>
          ) : (
            filtradas.map((p) => {
              const marcado = valor.includes(p.email)
              return (
                <button
                  key={p.email}
                  type="button"
                  className={cn(ITEM, marcado && 'bg-accent/60')}
                  onClick={() => alternar(p.email)}
                >
                  <Avatar email={p.email} tamanho="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {p.nome || p.email}
                      {p.email === colab.email ? (
                        <span className="ml-1 text-[11px] text-muted-foreground">(você)</span>
                      ) : null}
                    </span>
                    {p.nome ? (
                      <span className="block truncate text-[11px] text-muted-foreground">{p.email}</span>
                    ) : null}
                  </span>
                  {marcado ? <Check className="size-3.5 text-muted-foreground" /> : null}
                </button>
              )
            })
          )}
        </div>
        {!unica && valor.length > 0 ? (
          <div className="border-t border-border p-1.5">
            <button type="button" className={cn(ITEM, 'text-muted-foreground')} onClick={() => onChange([])}>
              <X className="size-3.5" />
              Remover todos
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
//  Data
// ---------------------------------------------------------------------------

export function DataPicker({
  valor,
  onChange,
  children,
  rotulo = 'Data',
  vazio = 'Definir data',
}: {
  valor: string | null
  onChange: (iso: string | null) => void
  children?: React.ReactNode
  rotulo?: string
  vazio?: string
}) {
  const [aberto, setAberto] = React.useState(false)
  const hoje = hojeISO()
  const atalhos: { rotulo: string; iso: string }[] = [
    { rotulo: 'Hoje', iso: hoje },
    { rotulo: 'Amanhã', iso: somarDias(hoje, 1) },
    { rotulo: 'Em 3 dias', iso: somarDias(hoje, 3) },
    { rotulo: 'Próxima semana', iso: somarDias(hoje, 7) },
  ]

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-1.5 text-sm outline-none hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
              !valor && 'text-muted-foreground',
            )}
          >
            <Calendar className="size-3.5" />
            <span className="text-xs">{valor ? formatarDataCurta(valor, hoje) : vazio}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2">
        <p className="px-1 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {rotulo}
        </p>
        <input
          type="date"
          value={valor ?? ''}
          onChange={(e) => {
            onChange(e.target.value || null)
          }}
          className="h-9 w-full rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
        />
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          {atalhos.map((a) => (
            <button
              key={a.iso}
              type="button"
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
              onClick={() => {
                onChange(a.iso)
                setAberto(false)
              }}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        {valor ? (
          <button
            type="button"
            className="mt-1.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => {
              onChange(null)
              setAberto(false)
            }}
          >
            <X className="size-3.5" />
            Limpar data
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
//  Etiquetas
// ---------------------------------------------------------------------------

export function EtiquetasEditor({
  valor,
  onChange,
}: {
  valor: string[]
  onChange: (etiquetas: string[]) => void
}) {
  const [texto, setTexto] = React.useState('')

  function adicionar() {
    const t = texto.trim().replace(/,+$/, '')
    if (!t) return
    if (!valor.includes(t)) onChange([...valor, t])
    setTexto('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {valor.map((e) => (
        <span
          key={e}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-muted/60 pr-1 pl-2 text-[11px] font-medium"
        >
          {e}
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => onChange(valor.filter((x) => x !== e))}
            aria-label={`Remover etiqueta ${e}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            adicionar()
          }
          if (e.key === 'Backspace' && !texto && valor.length > 0) {
            onChange(valor.slice(0, -1))
          }
        }}
        onBlur={adicionar}
        placeholder={valor.length === 0 ? 'Adicionar etiqueta' : '+'}
        className="h-6 min-w-24 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Cor
// ---------------------------------------------------------------------------

export function CorPicker({
  valor,
  onChange,
  permitirNenhuma = false,
}: {
  valor: string | null
  onChange: (cor: string | null) => void
  permitirNenhuma?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {permitirNenhuma ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            'flex size-6 items-center justify-center rounded-full border border-dashed border-input text-muted-foreground',
            valor === null && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
          )}
          aria-label="Sem cor"
          title="Sem cor"
        >
          <X className="size-3" />
        </button>
      ) : null}
      {PALETA.map((cor) => (
        <button
          key={cor}
          type="button"
          onClick={() => onChange(cor)}
          className={cn(
            'flex size-6 items-center justify-center rounded-full',
            valor === cor && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
          )}
          style={{ backgroundColor: cor }}
          aria-label={`Cor ${cor}`}
          title={cor}
        >
          {valor === cor ? <Check className="size-3.5" style={{ color: corTexto(cor) }} /> : null}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Campos personalizados
// ---------------------------------------------------------------------------

function textoDoValor(valor: ValorCampo): string {
  if (valor === null || valor === undefined) return ''
  if (Array.isArray(valor)) return valor.join(', ')
  return String(valor)
}

/** Editor de um campo personalizado, conforme o tipo. Salva ao confirmar. */
export function CampoEditor({
  campo,
  valor,
  onChange,
}: {
  campo: Campo
  valor: ValorCampo
  onChange: (valor: ValorCampo) => void
}) {
  const [texto, setTexto] = React.useState(textoDoValor(valor))

  React.useEffect(() => {
    setTexto(textoDoValor(valor))
  }, [valor])

  const inputBase =
    'h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-border focus-visible:border-ring focus-visible:bg-card'

  switch (campo.tipo) {
    case 'checkbox':
      return (
        <label className="inline-flex h-8 cursor-pointer items-center gap-2 px-2 text-sm">
          <input
            type="checkbox"
            checked={valor === true}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 accent-current"
          />
          <span className="text-muted-foreground">{valor === true ? 'Sim' : 'Não'}</span>
        </label>
      )

    case 'data':
      return (
        <DataPicker
          valor={typeof valor === 'string' && valor ? valor : null}
          onChange={(iso) => onChange(iso)}
          rotulo={campo.nome}
        />
      )

    case 'pessoa':
      return (
        <PessoasPicker
          valor={Array.isArray(valor) ? valor : typeof valor === 'string' && valor ? [valor] : []}
          onChange={(emails) => onChange(emails)}
          titulo={campo.nome}
        />
      )

    case 'selecao': {
      const atual = campo.opcoes.find((o) => o.id === valor)
      return (
        <OpcoesPicker
          opcoes={campo.opcoes}
          selecionadas={atual ? [atual.id] : []}
          unica
          onChange={(ids) => onChange(ids[0] ?? null)}
          rotulo={campo.nome}
        />
      )
    }

    case 'multiselecao':
      return (
        <OpcoesPicker
          opcoes={campo.opcoes}
          selecionadas={Array.isArray(valor) ? valor : []}
          onChange={(ids) => onChange(ids)}
          rotulo={campo.nome}
        />
      )

    case 'numero':
      return (
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            const t = texto.trim().replace(',', '.')
            if (!t) return onChange(null)
            const n = Number(t)
            if (Number.isFinite(n)) onChange(n)
            else setTexto(textoDoValor(valor))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          placeholder="—"
          className={cn(inputBase, 'tabular')}
        />
      )

    case 'url':
      return (
        <div className="flex items-center gap-1">
          <input
            type="url"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => onChange(texto.trim() || null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            placeholder="https://"
            className={inputBase}
          />
          {typeof valor === 'string' && /^https?:\/\//i.test(valor) ? (
            <a
              href={valor}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs text-info underline-offset-2 hover:underline"
            >
              abrir
            </a>
          ) : null}
        </div>
      )

    default:
      return (
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => onChange(texto.trim() || null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          placeholder="—"
          className={inputBase}
        />
      )
  }
}

/** Seletor das opções coloridas de lista suspensa / etiquetas. */
export function OpcoesPicker({
  opcoes,
  selecionadas,
  onChange,
  unica = false,
  rotulo,
}: {
  opcoes: Campo['opcoes']
  selecionadas: string[]
  onChange: (ids: string[]) => void
  unica?: boolean
  rotulo: string
}) {
  const [aberto, setAberto] = React.useState(false)
  const escolhidas = opcoes.filter((o) => selecionadas.includes(o.id))

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border border-transparent px-1.5 py-1 text-left text-sm outline-none hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {escolhidas.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Plus className="size-3" />
              Selecionar
            </span>
          ) : (
            escolhidas.map((o) => (
              <span
                key={o.id}
                className="inline-flex h-5 max-w-full items-center gap-1.5 truncate rounded-full border px-2 text-[11px] font-medium"
                style={{ borderColor: `${o.cor}66`, backgroundColor: `${o.cor}22` }}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: o.cor }} />
                <span className="truncate">{o.nome}</span>
              </span>
            ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {rotulo}
        </p>
        <div className="max-h-64 overflow-y-auto">
          {opcoes.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Este campo ainda não tem opções. Adicione nas configurações da lista.
            </p>
          ) : (
            opcoes.map((o) => {
              const marcada = selecionadas.includes(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  className={cn(ITEM, marcada && 'bg-accent/60')}
                  onClick={() => {
                    if (unica) {
                      onChange(marcada ? [] : [o.id])
                      setAberto(false)
                    } else {
                      onChange(marcada ? selecionadas.filter((id) => id !== o.id) : [...selecionadas, o.id])
                    }
                  }}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: o.cor }} />
                  <span className="flex-1 truncate">{o.nome}</span>
                  {marcada ? <Check className="size-3.5 text-muted-foreground" /> : null}
                </button>
              )
            })
          )}
        </div>
        {selecionadas.length > 0 ? (
          <>
            <div className="my-1 h-px bg-border" />
            <button type="button" className={cn(ITEM, 'text-muted-foreground')} onClick={() => onChange([])}>
              <X className="size-3.5" />
              Limpar
            </button>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

