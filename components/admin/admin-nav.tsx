'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FolderOpen, HandCoins, KeyRound, LayoutGrid, Layers, Target, Users } from 'lucide-react'

import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/admin', label: 'Visão geral', icon: LayoutGrid },
  { href: '/admin/metas', label: 'Metas & EBITDA', icon: Target },
  { href: '/admin/vendas', label: 'Vendas manuais', icon: HandCoins },
  { href: '/admin/acoes', label: 'Ações de marketing', icon: Layers },
  { href: '/admin/documentos', label: 'Documentos', icon: FolderOpen },
  { href: '/admin/cofre', label: 'Cofre de senhas', icon: KeyRound },
  { href: '/admin/colaboradores', label: 'Acessos', icon: Users },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="overflow-x-auto">
      <ul className="inline-flex min-w-full gap-1 rounded-lg border border-border bg-card p-1 shadow-xs">
        {LINKS.map((link) => {
          // '/admin' só fica ativo na rota exata; as demais aceitam subrotas.
          const isActive =
            link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href)

          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <link.icon className="size-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
