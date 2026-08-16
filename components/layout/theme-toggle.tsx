'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Theme = 'light' | 'dark'

/** Alterna entre claro e escuro e persiste a escolha em localStorage. */
export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>('light')
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      localStorage.setItem('canali-theme', next)
    } catch {
      // Modo privado pode bloquear o storage — o tema ainda muda na sessão.
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
    >
      {/* Antes de montar, renderiza o ícone do tema claro para não divergir do HTML do servidor. */}
      {mounted && theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
