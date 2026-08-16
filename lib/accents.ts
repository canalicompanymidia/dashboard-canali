import type { Accent } from './types'

/**
 * Mapa de cores de destaque.
 *
 * As classes são strings COMPLETAS de propósito: o Tailwind extrai classes
 * por análise estática do código-fonte, então algo como `bg-${accent}-500`
 * simplesmente não seria gerado no CSS final.
 */
export interface AccentTheme {
  /** Fundo tênue do card/painel. */
  surface: string
  /** Borda combinando com a superfície. */
  border: string
  /** Texto na cor do destaque. */
  text: string
  /** Preenchimento sólido (barras de progresso, pontos). */
  fill: string
  /** Gradiente para barras e faixas. */
  gradient: string
  /** Fundo do chip/badge. */
  badge: string
  /** Anel de foco/hover do card. */
  ring: string
  /** Sombra colorida no hover. */
  glow: string
  /** Fundo do ícone. */
  iconBg: string
}

export const ACCENTS: Record<Accent, AccentTheme> = {
  emerald: {
    surface: 'bg-emerald-50/70 dark:bg-emerald-500/10',
    border: 'border-emerald-200/80 dark:border-emerald-500/25',
    text: 'text-emerald-700 dark:text-emerald-300',
    fill: 'bg-emerald-500',
    gradient: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    ring: 'hover:border-emerald-300 dark:hover:border-emerald-500/45',
    glow: 'hover:shadow-emerald-500/10',
    iconBg: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  },
  sky: {
    surface: 'bg-sky-50/70 dark:bg-sky-500/10',
    border: 'border-sky-200/80 dark:border-sky-500/25',
    text: 'text-sky-700 dark:text-sky-300',
    fill: 'bg-sky-500',
    gradient: 'bg-gradient-to-r from-sky-500 to-cyan-400',
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
    ring: 'hover:border-sky-300 dark:hover:border-sky-500/45',
    glow: 'hover:shadow-sky-500/10',
    iconBg: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  },
  violet: {
    surface: 'bg-violet-50/70 dark:bg-violet-500/10',
    border: 'border-violet-200/80 dark:border-violet-500/25',
    text: 'text-violet-700 dark:text-violet-300',
    fill: 'bg-violet-500',
    gradient: 'bg-gradient-to-r from-violet-500 to-fuchsia-400',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
    ring: 'hover:border-violet-300 dark:hover:border-violet-500/45',
    glow: 'hover:shadow-violet-500/10',
    iconBg: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  },
  amber: {
    surface: 'bg-amber-50/70 dark:bg-amber-500/10',
    border: 'border-amber-200/80 dark:border-amber-500/25',
    text: 'text-amber-700 dark:text-amber-300',
    fill: 'bg-amber-500',
    gradient: 'bg-gradient-to-r from-amber-500 to-orange-400',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    ring: 'hover:border-amber-300 dark:hover:border-amber-500/45',
    glow: 'hover:shadow-amber-500/10',
    iconBg: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  },
  rose: {
    surface: 'bg-rose-50/70 dark:bg-rose-500/10',
    border: 'border-rose-200/80 dark:border-rose-500/25',
    text: 'text-rose-700 dark:text-rose-300',
    fill: 'bg-rose-500',
    gradient: 'bg-gradient-to-r from-rose-500 to-pink-400',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
    ring: 'hover:border-rose-300 dark:hover:border-rose-500/45',
    glow: 'hover:shadow-rose-500/10',
    iconBg: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  },
  slate: {
    surface: 'bg-slate-50/70 dark:bg-slate-500/10',
    border: 'border-slate-200/80 dark:border-slate-500/25',
    text: 'text-slate-700 dark:text-slate-300',
    fill: 'bg-slate-500',
    gradient: 'bg-gradient-to-r from-slate-600 to-slate-400',
    badge: 'bg-slate-100 text-slate-800 dark:bg-slate-500/15 dark:text-slate-300',
    ring: 'hover:border-slate-300 dark:hover:border-slate-500/45',
    glow: 'hover:shadow-slate-500/10',
    iconBg: 'bg-slate-500/12 text-slate-600 dark:text-slate-400',
  },
}

/** Resolve com fallback seguro — o accent vem do banco e pode vir inválido. */
export function getAccent(accent: string | null | undefined): AccentTheme {
  return ACCENTS[(accent ?? 'slate') as Accent] ?? ACCENTS.slate
}

export const ACCENT_OPTIONS: { value: Accent; label: string }[] = [
  { value: 'emerald', label: 'Verde' },
  { value: 'sky', label: 'Azul' },
  { value: 'violet', label: 'Roxo' },
  { value: 'amber', label: 'Âmbar' },
  { value: 'rose', label: 'Rosa' },
  { value: 'slate', label: 'Cinza' },
]
