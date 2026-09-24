import {
  BookOpen,
  Boxes,
  Briefcase,
  Database,
  FileText,
  Film,
  Folder,
  GraduationCap,
  Image,
  Layers,
  Link as LinkIcon,
  ListChecks,
  Megaphone,
  Palette,
  PenLine,
  Presentation,
  Rocket,
  Settings,
  Sparkles,
  Users,
  Video,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/**
 * Registro de ícones disponíveis para categorias e documentos.
 *
 * Um mapa explícito em vez de import dinâmico: o nome do ícone vem do banco,
 * e resolver dinamicamente arrastaria a biblioteca inteira para o bundle.
 */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  BookOpen,
  Boxes,
  Briefcase,
  Database,
  FileText,
  Film,
  Folder,
  GraduationCap,
  Image,
  Layers,
  Link: LinkIcon,
  ListChecks,
  Megaphone,
  Palette,
  PenLine,
  Presentation,
  Rocket,
  Settings,
  Sparkles,
  Users,
  Video,
  Wallet,
}

export function resolveIcon(name: string | null | undefined): LucideIcon {
  return ICON_REGISTRY[name ?? ''] ?? Folder
}

export const ICON_OPTIONS = Object.keys(ICON_REGISTRY).sort()

/** Metadados por origem do documento — rótulo e cor do chip. */
export const PROVIDER_META: Record<string, { label: string; className: string }> = {
  google_drive: {
    label: 'Google Drive',
    className: 'border border-border bg-muted text-muted-foreground',
  },
  clickup: {
    label: 'ClickUp',
    className: 'border border-border bg-muted text-muted-foreground',
  },
  vturb: {
    label: 'Vturb',
    className: 'border border-border bg-muted text-muted-foreground',
  },
  curseduca: {
    label: 'Curseduca',
    className: 'border border-border bg-muted text-muted-foreground',
  },
  notion: {
    label: 'Notion',
    className: 'border border-border bg-muted text-muted-foreground',
  },
  link: {
    label: 'Link',
    className: 'border border-border bg-muted text-muted-foreground',
  },
}

export function getProviderMeta(provider: string | null | undefined) {
  return PROVIDER_META[provider ?? 'link'] ?? PROVIDER_META.link
}

export const PROVIDER_OPTIONS = Object.entries(PROVIDER_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}))
