'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, LogIn } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Login do painel administrativo (ativo apenas quando ADMIN_PASSWORD existe). */
export function AdminLoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const payload = (await response.json()) as { ok: boolean; error?: string }

      if (!payload.ok) {
        setError(payload.error ?? 'Não foi possível entrar.')
        return
      }

      router.replace(redirectTo)
      router.refresh()
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="admin-password">Senha do painel</Label>
        <Input
          id="admin-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          aria-invalid={Boolean(error)}
        />
      </div>

      {error ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={loading || !password}>
        <LogIn className="size-4" />
        {loading ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>
  )
}
