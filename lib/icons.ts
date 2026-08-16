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
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  clickup: {
    label: 'ClickUp',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  },
  vturb: {
    label: 'Vturb',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  },
  curseduca: {
    label: 'Curseduca',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  notion: {
    label: 'Notion',
    className: 'bg-slate-200 text-slate-800 dark:bg-slate-500/15 dark:text-slate-300',
  },
  link: {
    label: 'Link',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  },
}

export function getProviderMeta(provider: string | null | undefined) {
  return PROVIDER_META[provider ?? 'link'] ?? PROVIDER_META.link
}

export const PROVIDER_OPTIONS = Object.entries(PROVIDER_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}))
