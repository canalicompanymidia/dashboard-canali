'use client'

import * as React from 'react'
import {
  AlertTriangle,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LockOpen,
  Search,
  ShieldCheck,
  Timer,
} from 'lucide-react'

import { CopyButton } from '@/components/home/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { VaultCredential } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Duração da sessão do cofre — precisa espelhar SESSION_TTL_SECONDS em lib/crypto.ts. */
const SESSION_SECONDS = 15 * 60

/**
 * Cofre de Senhas.
 *
 * A Senha Mestre é validada no servidor; o cliente nunca recebe hash nem
 * chave. As credenciais só chegam depois da liberação, ficam apenas em
 * memória (nada de localStorage) e são descartadas ao bloquear ou expirar.
 */
export function VaultPanel({ configured }: { configured: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [credentials, setCredentials] = React.useState<VaultCredential[] | null>(null)
  const [secondsLeft, setSecondsLeft] = React.useState(SESSION_SECONDS)
  const [query, setQuery] = React.useState('')
  const [revealed, setRevealed] = React.useState<Set<string>>(new Set())

  const lock = React.useCallback(async () => {
    setCredentials(null)
    setRevealed(new Set())
    setQuery('')
    setPassword('')
    try {
      await fetch('/api/vault/lock', { method: 'POST' })
    } catch {
      // Mesmo sem resposta do servidor, os dados já saíram da memória do cliente.
    }
  }, [])

  // Contagem regressiva até o bloqueio automático.
  React.useEffect(() => {
    if (!credentials) return

    setSecondsLeft(SESSION_SECONDS)
    const interval = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          void lock()
          return 0
        }
        return current - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [credentials, lock])

  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/vault/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const payload = (await response.json()) as {
        ok: boolean
        error?: string
        credentials?: VaultCredential[]
      }

      if (!payload.ok) {
        setError(payload.error ?? 'Não foi possível liberar o cofre.')
        return
      }

      setCredentials(payload.credentials ?? [])
      setOpen(false)
      setPassword('')
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function toggleReveal(id: string) {
    setRevealed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = React.useMemo(() => {
    if (!credentials) return []
    const term = query.trim().toLowerCase()
    if (!term) return credentials

    return credentials.filter((item) =>
      [item.service_name, item.category, item.username, item.url, item.notes]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term)),
    )
  }, [credentials, query])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  // ----- Estado bloqueado -----
  if (!credentials) {
    return (
      <>
        <div className="flex h-full flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
                <Lock className="size-4.5" />
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-tight">Cofre de Senhas</h3>
                <p className="text-xs text-muted-foreground">Acesso protegido por Senha Mestre</p>
              </div>
            </div>

            <p className="mt-3.5 text-sm text-muted-foreground">
              Senhas e acessos do time. A sessão expira sozinha em 15 minutos.
            </p>

            {!configured ? (
              <div className="mt-3 flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs">
                <AlertTriangle className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
                <span>
                  Cofre ainda não configurado. Defina <code className="font-mono">VAULT_ENCRYPTION_KEY</code>{' '}
                  e a Senha Mestre para liberar o acesso.
                </span>
              </div>
            ) : null}
          </div>

          <Button className="mt-4 w-full" onClick={() => setOpen(true)} disabled={!configured}>
            <KeyRound className="size-4" />
            Destravar cofre
          </Button>
        </div>

        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) setError(null)
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <span className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/8 text-primary">
                <ShieldCheck className="size-5" />
              </span>
              <DialogTitle>Validação da Senha Mestre</DialogTitle>
              <DialogDescription>
                Informe a Senha Mestre para liberar as credenciais. O acesso fica registrado na
                trilha de auditoria.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={unlock} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="master-password">Senha Mestre</Label>
                <div className="relative">
                  <Input
                    id="master-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="off"
                    autoFocus
                    className="pr-10"
                    aria-invalid={Boolean(error)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error ? (
                <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading || !password}>
                  <LockOpen className="size-4" />
                  {loading ? 'Validando...' : 'Liberar acesso'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // ----- Estado liberado -----
  return (
    <div className="flex h-full flex-col rounded-xl border border-positive/25 bg-card shadow-xs">
      <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-positive/12 text-positive">
          <LockOpen className="size-4.5" />
        </span>

        <div className="mr-auto">
          <h3 className="text-base font-semibold tracking-tight">Cofre de Senhas</h3>
          <p className="text-xs text-muted-foreground">
            {credentials.length} credencial(is) · clique para copiar
          </p>
        </div>

        <Badge variant={secondsLeft < 120 ? 'negative' : 'muted'}>
          <Timer className="size-3" />
          <span className="tabular">
            {minutes}:{String(seconds).padStart(2, '0')}
          </span>
        </Badge>

        <Button variant="outline" size="sm" onClick={() => void lock()}>
          <Lock className="size-3.5" />
          Bloquear
        </Button>
      </header>

      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por serviço, categoria ou usuário..."
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {credentials.length === 0
              ? 'Nenhuma credencial cadastrada. Adicione pelo painel administrativo.'
              : 'Nenhum resultado para esta busca.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Senha</TableHead>
                <TableHead className="text-right">Acesso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((credential) => (
                <TableRow key={credential.id}>
                  <TableCell>
                    <p className="font-medium">{credential.service_name}</p>
                    <p className="text-xs text-muted-foreground">{credential.category}</p>
                    {credential.notes ? (
                      <p className="mt-0.5 text-xs text-muted-foreground italic">
                        {credential.notes}
                      </p>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    {credential.username ? (
                      <span className="flex items-center gap-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {credential.username}
                        </code>
                        <CopyButton value={credential.username} label="usuário" />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {credential.password ? (
                      <span className="flex items-center gap-1">
                        <code
                          className={cn(
                            'rounded bg-muted px-1.5 py-0.5 font-mono text-xs',
                            !revealed.has(credential.id) && 'tracking-widest select-none',
                          )}
                        >
                          {revealed.has(credential.id) ? credential.password : '••••••••••'}
                        </code>
                        <button
                          type="button"
                          onClick={() => toggleReveal(credential.id)}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          aria-label={
                            revealed.has(credential.id) ? 'Ocultar senha' : 'Mostrar senha'
                          }
                        >
                          {revealed.has(credential.id) ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>
                        <CopyButton value={credential.password} label="senha" />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {credential.url ? (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={credential.url} target="_blank" rel="noopener noreferrer">
                          Abrir
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
