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

/*
 * Design System da Canali Co.: sem gradientes coloridos. As seis opções
 * gravadas no banco continuam válidas, mas cada uma aponta para um token
 * da marca (prata, marinho e os semânticos), em cor sólida.
 */
export const ACCENTS: Record<Accent, AccentTheme> = {
  emerald: {
    surface: 'bg-positive/[0.06]',
    border: 'border-positive/30',
    text: 'text-positive',
    fill: 'bg-positive',
    gradient: 'bg-positive',
    badge: 'bg-positive/12 text-positive',
    ring: 'hover:border-positive/50',
    glow: '',
    iconBg: 'bg-positive/12 text-positive',
  },
  sky: {
    surface: 'bg-info/[0.06]',
    border: 'border-info/30',
    text: 'text-info',
    fill: 'bg-info',
    gradient: 'bg-info',
    badge: 'bg-info/12 text-info',
    ring: 'hover:border-info/50',
    glow: '',
    iconBg: 'bg-info/12 text-info',
  },
  violet: {
    surface: 'bg-prata/[0.06]',
    border: 'border-prata/30',
    text: 'text-prata',
    fill: 'bg-prata',
    gradient: 'bg-prata',
    badge: 'bg-prata/12 text-prata',
    ring: 'hover:border-prata/50',
    glow: '',
    iconBg: 'bg-prata/12 text-prata',
  },
  amber: {
    surface: 'bg-warning/[0.06]',
    border: 'border-warning/30',
    text: 'text-warning',
    fill: 'bg-warning',
    gradient: 'bg-warning',
    badge: 'bg-warning/12 text-warning',
    ring: 'hover:border-warning/50',
    glow: '',
    iconBg: 'bg-warning/12 text-warning',
  },
  rose: {
    surface: 'bg-negative/[0.06]',
    border: 'border-negative/30',
    text: 'text-negative',
    fill: 'bg-negative',
    gradient: 'bg-negative',
    badge: 'bg-negative/12 text-negative',
    ring: 'hover:border-negative/50',
    glow: '',
    iconBg: 'bg-negative/12 text-negative',
  },
  slate: {
    surface: 'bg-muted-foreground/[0.06]',
    border: 'border-muted-foreground/30',
    text: 'text-muted-foreground',
    fill: 'bg-muted-foreground',
    gradient: 'bg-muted-foreground',
    badge: 'bg-muted-foreground/12 text-muted-foreground',
    ring: 'hover:border-muted-foreground/50',
    glow: '',
    iconBg: 'bg-muted-foreground/12 text-muted-foreground',
  },
}

/** Resolve com fallback seguro — o accent vem do banco e pode vir inválido. */
export function getAccent(accent: string | null | undefined): AccentTheme {
  return ACCENTS[(accent ?? 'slate') as Accent] ?? ACCENTS.slate
}

export const ACCENT_OPTIONS: { value: Accent; label: string }[] = [
  { value: 'emerald', label: 'Verde (sucesso)' },
  { value: 'sky', label: 'Azul-marinho' },
  { value: 'violet', label: 'Prata' },
  { value: 'amber', label: 'Âmbar (atenção)' },
  { value: 'rose', label: 'Vermelho (alerta)' },
  { value: 'slate', label: 'Cinza' },
]
