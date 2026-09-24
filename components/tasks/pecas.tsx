'use client'

import * as React from 'react'
import { Check, Flag, type LucideIcon } from 'lucide-react'

import { useTasks } from '@/components/tasks/provider'
import { formatarDataCurta, hojeISO } from '@/lib/tasks/datas'
import {
  PRIORIDADES,
  type Campo,
  type OpcaoCampo,
  type Prioridade,
  type StatusTipo,
  type ValorCampo,
} from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Peças visuais pequenas, reutilizadas em todas as telas do módulo:
 * pílula de status, bandeira de prioridade, avatar, data, chips.
 */

// ---------------------------------------------------------------------------
//  Cores
// ---------------------------------------------------------------------------

/** Texto preto ou branco, o que contrastar melhor com o fundo dado. */
export function corTexto(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  // Luminância relativa aproximada (sRGB linearizada de forma simples).
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.6 ? '#0a0b0d' : '#ffffff'
}

const CORES_PESSOA = [
  '#1f6feb', '#7b2cbf', '#008844', '#bf55ec', '#e5484d', '#ff7800',
  '#1090e0', '#3db88b', '#f8ae00', '#1f3864', '#9b59b6', '#ef233c',
]

/** Cor estável para uma pessoa, derivada do e-mail. */
export function corDaPessoa(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return CORES_PESSOA[h % CORES_PESSOA.length]
}

/** "Bruna Dumbrovsky Casaes" → "BC"; "fabi@x.com" → "FA". */
export function iniciais(nomeOuEmail: string): string {
  const texto = nomeOuEmail.trim()
  if (!texto) return '?'
  if (texto.includes('@') && !texto.includes(' ')) {
    return texto.slice(0, 2).toUpperCase()
  }
  const partes = texto.split(/\s+/).filter(Boolean)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

// ---------------------------------------------------------------------------
//  Status
// ---------------------------------------------------------------------------

export function StatusPill({
  nome,
  cor,
  tamanho = 'sm',
  className,
}: {
  nome: string
  cor: string
  tamanho?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-[4px] font-semibold tracking-[0.06em] uppercase',
        tamanho === 'xs' && 'h-[18px] px-1.5 text-[10px]',
        tamanho === 'sm' && 'h-5 px-2 text-[10.5px]',
        tamanho === 'md' && 'h-7 px-2.5 text-[11.5px]',
        className,
      )}
      style={{ backgroundColor: cor, color: corTexto(cor) }}
      title={nome}
    >
      {nome}
    </span>
  )
}

/** Bolinha do status. Concluído/encerrado vira um check preenchido. */
export function StatusDot({
  cor,
  tipo,
  className,
}: {
  cor: string
  tipo: StatusTipo
  className?: string
}) {
  const fechado = tipo === 'concluido' || tipo === 'fechado'
  return (
    <span
      className={cn(
        'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border-2',
        className,
      )}
      style={{
        borderColor: cor,
        backgroundColor: fechado ? cor : 'transparent',
        color: corTexto(cor),
      }}
      aria-hidden
    >
      {fechado ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
//  Prioridade
// ---------------------------------------------------------------------------

export function PrioridadeFlag({
  prioridade,
  comRotulo = false,
  className,
}: {
  prioridade: Prioridade | null
  comRotulo?: boolean
  className?: string
}) {
  if (!prioridade) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-muted-foreground/60', className)}>
        <Flag className="size-3.5" />
        {comRotulo ? <span className="text-xs">Sem prioridade</span> : null}
      </span>
    )
  }
  const p = PRIORIDADES[prioridade]
  return (
    <span className={cn('inline-flex items-center gap-1', className)} title={`Prioridade ${p.rotulo}`}>
      <Flag className="size-3.5" style={{ color: p.cor, fill: p.cor }} />
      {comRotulo ? <span className="text-xs">{p.rotulo}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
//  Pessoas
// ---------------------------------------------------------------------------

export function Avatar({
  email,
  tamanho = 'sm',
  className,
}: {
  email: string
  tamanho?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { nomeDe } = useTasks()
  const nome = nomeDe(email)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-card select-none',
        tamanho === 'xs' && 'size-5 text-[9px]',
        tamanho === 'sm' && 'size-6 text-[10px]',
        tamanho === 'md' && 'size-7 text-[11px]',
        tamanho === 'lg' && 'size-9 text-[13px]',
        className,
      )}
      style={{ backgroundColor: corDaPessoa(email) }}
      title={nome === email ? email : `${nome} · ${email}`}
    >
      {iniciais(nome)}
    </span>
  )
}

/** Avatares sobrepostos, com "+N" quando passa do limite. */
export function Avatares({
  emails,
  max = 3,
  tamanho = 'sm',
  className,
}: {
  emails: string[]
  max?: number
  tamanho?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  if (emails.length === 0) return null
  const visiveis = emails.slice(0, max)
  const resto = emails.length - visiveis.length
  return (
    <span className={cn('inline-flex items-center -space-x-1.5', className)}>
      {visiveis.map((email) => (
        <Avatar key={email} email={email} tamanho={tamanho} />
      ))}
      {resto > 0 ? (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-2 ring-card',
            tamanho === 'xs' && 'size-5 text-[9px]',
            tamanho === 'sm' && 'size-6 text-[10px]',
            tamanho === 'md' && 'size-7 text-[11px]',
          )}
        >
          +{resto}
        </span>
      ) : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
//  Datas
// ---------------------------------------------------------------------------

/** Data de vencimento: vermelha quando passou, âmbar quando é hoje. */
export function DataChip({
  iso,
  concluida = false,
  className,
}: {
  iso: string | null
  concluida?: boolean
  className?: string
}) {
  if (!iso) return null
  const hoje = hojeISO()
  const atrasada = !concluida && iso < hoje
  const ehHoje = !concluida && iso === hoje
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs tabular whitespace-nowrap',
        atrasada && 'font-medium text-negative',
        ehHoje && 'font-medium text-warning-foreground dark:text-warning',
        !atrasada && !ehHoje && 'text-muted-foreground',
        concluida && 'line-through opacity-70',
        className,
      )}
      title={iso}
    >
      {formatarDataCurta(iso, hoje)}
    </span>
  )
}

// ---------------------------------------------------------------------------
//  Chips
// ---------------------------------------------------------------------------

export function EtiquetaChip({ texto, className }: { texto: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-40 items-center truncate rounded-full border border-border bg-muted/60 px-2 text-[11px] font-medium',
        className,
      )}
    >
      {texto}
    </span>
  )
}

export function OpcaoChip({
  opcao,
  tamanho = 'sm',
  className,
}: {
  opcao: OpcaoCampo
  tamanho?: 'xs' | 'sm'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-44 items-center gap-1.5 truncate rounded-full border px-2 font-medium',
        tamanho === 'xs' ? 'h-[18px] text-[10.5px]' : 'h-5 text-[11px]',
        className,
      )}
      style={{
        borderColor: `${opcao.cor}66`,
        backgroundColor: `${opcao.cor}22`,
      }}
      title={opcao.nome}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: opcao.cor }} />
      <span className="truncate">{opcao.nome}</span>
    </span>
  )
}

/** Valores de lista suspensa / etiquetas de campos, para os cards do quadro. */
export function ChipsDeCampos({
  campos,
  valores,
  max = 3,
}: {
  campos: Campo[]
  valores: Record<string, ValorCampo>
  max?: number
}) {
  const chips: { chave: string; opcao: OpcaoCampo }[] = []
  for (const campo of campos) {
    if (campo.tipo !== 'selecao' && campo.tipo !== 'multiselecao') continue
    const valor = valores[campo.id]
    const ids = Array.isArray(valor) ? valor : typeof valor === 'string' ? [valor] : []
    for (const id of ids) {
      const opcao = campo.opcoes.find((o) => o.id === id)
      if (opcao) chips.push({ chave: `${campo.id}:${id}`, opcao })
    }
  }
  if (chips.length === 0) return null
  const visiveis = chips.slice(0, max)
  const resto = chips.length - visiveis.length
  return (
    <span className="flex flex-wrap items-center gap-1">
      {visiveis.map((c) => (
        <OpcaoChip key={c.chave} opcao={c.opcao} tamanho="xs" />
      ))}
      {resto > 0 ? <span className="text-[10px] text-muted-foreground">+{resto}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
//  Estruturas de página
// ---------------------------------------------------------------------------

export function Vazio({
  icone: Icone,
  titulo,
  texto,
  children,
  className,
}: {
  icone: LucideIcon
  titulo: string
  texto?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center',
        className,
      )}
    >
      <Icone className="size-7 text-muted-foreground/50" />
      <p className="mt-3 text-sm font-medium">{titulo}</p>
      {texto ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{texto}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}

/** Quadradinho colorido com a inicial — a "marca" de um espaço. */
export function MarcaEspaco({
  nome,
  cor,
  tamanho = 'sm',
  className,
}: {
  nome: string
  cor: string
  tamanho?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-semibold select-none',
        tamanho === 'sm' && 'size-5 text-[10px]',
        tamanho === 'md' && 'size-7 text-xs',
        tamanho === 'lg' && 'size-10 rounded-lg text-base',
        className,
      )}
      style={{ backgroundColor: cor, color: corTexto(cor) }}
      aria-hidden
    >
      {nome.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/** Barra de progresso fina, com "feitas/total". */
export function Progresso({
  feitas,
  total,
  className,
}: {
  feitas: number
  total: number
  className?: string
}) {
  const pct = total > 0 ? Math.round((feitas / total) * 100) : 0
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('block h-full rounded-full', pct >= 100 ? 'bg-positive' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="text-xs text-muted-foreground tabular">
        {feitas}/{total}
      </span>
    </span>
  )
}
