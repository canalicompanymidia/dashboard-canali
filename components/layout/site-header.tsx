import Link from 'next/link'
import { LayoutDashboard, Settings2 } from 'lucide-react'

import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground shadow-sm">
            CC
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight">Canali Company</span>
            <span className="text-[11px] text-muted-foreground">Hub de Marketing</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="mr-1 hidden text-xs text-muted-foreground lg:block tabular">
            {formatDate(new Date())}
          </span>

          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <LayoutDashboard className="size-4" />
              <span className="hidden sm:inline">Painel</span>
            </Link>
          </Button>

          <Button variant="outline" size="sm" asChild>
            <Link href="/admin">
              <Settings2 className="size-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          </Button>

          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
