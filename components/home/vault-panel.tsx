'use client'

import * as React from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LockOpen,
  Search,
  ShieldCheck,
  Timer,
  User,
  Users,
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
import type { CofrePerfilPublico, VaultAcesso, VaultCredential } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Espelha SESSION_TTL_SECONDS em lib/crypto.ts. */
const SESSION_SECONDS = 15 * 60

interface Conteudo {
  acesso: VaultAcesso
  credenciais: VaultCredential[]
  subcategorias: string[]
  ocultas: number
}

type Etapa = 'selecao' | 'pin' | 'master'

/**
 * Cofre de Senhas.
 *
 * Dois caminhos de entrada: o colaborador escolhe o próprio nome e digita um
 * PIN de 4 dígitos, ou o admin usa a Senha Mestre. O servidor valida, filtra
 * pelas subcategorias liberadas e só então devolve as credenciais — o cliente
 * nunca recebe o que não pode ver.
 */
export function VaultPanel({ configured }: { configured: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [etapa, setEtapa] = React.useState<Etapa>('selecao')

  const [perfis, setPerfis] = React.useState<CofrePerfilPublico[]>([])
  const [perfil, setPerfil] = React.useState<CofrePerfilPublico | null>(null)
  const [pin, setPin] = React.useState('')
  const [senha, setSenha] = React.useState('')
  const [mostrarSenha, setMostrarSenha] = React.useState(false)

  const [carregando, setCarregando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  const [conteudo, setConteudo] = React.useState<Conteudo | null>(null)
  const [segundos, setSegundos] = React.useState(SESSION_SECONDS)
  const [busca, setBusca] = React.useState('')
  const [filtroSub, setFiltroSub] = React.useState<string | null>(null)
  const [reveladas, setReveladas] = React.useState<Set<string>>(new Set())

  const bloquear = React.useCallback(async () => {
    setConteudo(null)
    setReveladas(new Set())
    setBusca('')
    setFiltroSub(null)
    setPin('')
    setSenha('')
    setPerfil(null)
    setEtapa('selecao')
    try {
      await fetch('/api/vault/lock', { method: 'POST' })
    } catch {
      // Mesmo sem resposta do servidor, os dados já saíram da memória do cliente.
    }
  }, [])

  // Contagem regressiva até o bloqueio automático.
  React.useEffect(() => {
    if (!conteudo) return

    setSegundos(SESSION_SECONDS)
    const t = setInterval(() => {
      setSegundos((atual) => {
        if (atual <= 1) {
          void bloquear()
          return 0
        }
        return atual - 1
      })
    }, 1000)

    return () => clearInterval(t)
  }, [conteudo, bloquear])

  async function abrirModal() {
    setOpen(true)
    setErro(null)
    setEtapa('selecao')

    try {
      const r = await fetch('/api/vault/profiles', { cache: 'no-store' })
      const p = (await r.json()) as { ok: boolean; perfis?: CofrePerfilPublico[] }
      setPerfis(p.perfis ?? [])
    } catch {
      setPerfis([])
    }
  }

  async function autenticar(corpo: Record<string, unknown>) {
    setCarregando(true)
    setErro(null)

    try {
      const r = await fetch('/api/vault/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const p = (await r.json()) as {
        ok: boolean
        error?: string
        acesso?: VaultAcesso
        credenciais?: VaultCredential[]
        subcategorias?: string[]
        ocultas?: number
      }

      if (!p.ok || !p.acesso) {
        setErro(p.error ?? 'Não foi possível liberar o cofre.')
        setPin('')
        return
      }

      setConteudo({
        acesso: p.acesso,
        credenciais: p.credenciais ?? [],
        subcategorias: p.subcategorias ?? [],
        ocultas: p.ocultas ?? 0,
      })
      setOpen(false)
      setPin('')
      setSenha('')
    } catch {
      setErro('Falha de conexão. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  function alternarRevelacao(id: string) {
    setReveladas((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  const filtradas = React.useMemo(() => {
    if (!conteudo) return []
    const termo = busca.trim().toLowerCase()

    return conteudo.credenciais.filter((c) => {
      if (filtroSub && c.subcategoria !== filtroSub) return false
      if (!termo) return true
      return [c.service_name, c.category, c.subcategoria, c.username, c.url, c.notes]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo))
    })
  }, [conteudo, busca, filtroSub])

  const minutos = Math.floor(segundos / 60)
  const resto = segundos % 60

  // ----- Estado bloqueado -----
  if (!conteudo) {
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
                <p className="text-xs text-muted-foreground">Acesso individual por PIN</p>
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

          <Button className="mt-4 w-full" onClick={() => void abrirModal()} disabled={!configured}>
            <KeyRound className="size-4" />
            Destravar cofre
          </Button>
        </div>

        <Dialog
          open={open}
          onOpenChange={(proximo) => {
            setOpen(proximo)
            if (!proximo) {
              setErro(null)
              setEtapa('selecao')
              setPin('')
              setSenha('')
              setPerfil(null)
            }
          }}
        >
          <DialogContent className="max-w-md">
            {/* ---------- Etapa 1: quem é você ---------- */}
            {etapa === 'selecao' ? (
              <>
                <DialogHeader>
                  <span className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/8 text-primary">
                    <Users className="size-5" />
                  </span>
                  <DialogTitle>Selecione seu nome</DialogTitle>
                  <DialogDescription>
                    Cada pessoa enxerga apenas os acessos liberados para o seu perfil.
                  </DialogDescription>
                </DialogHeader>

                <div className="max-h-72 space-y-1.5 overflow-y-auto">
                  {perfis.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                      Nenhum perfil cadastrado ainda. Use o acesso Master abaixo, ou crie perfis em
                      Admin → Cofre → Gestão de Acessos.
                    </p>
                  ) : (
                    perfis.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPerfil(p)
                          setEtapa('pin')
                          setErro(null)
                        }}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors',
                          'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
                        )}
                      >
                        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <User className="size-3.5" />
                        </span>
                        <span className="font-medium">{p.nome_colaborador}</span>
                      </button>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEtapa('master')
                    setErro(null)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-left text-sm transition-colors',
                    'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
                  )}
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ShieldCheck className="size-3.5" />
                  </span>
                  <span>
                    <span className="font-medium">Acesso Master (admin)</span>
                    <span className="block text-xs text-muted-foreground">
                      Senha Mestre · vê todas as senhas
                    </span>
                  </span>
                </button>

                {erro ? (
                  <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" />
                    {erro}
                  </p>
                ) : null}
              </>
            ) : null}

            {/* ---------- Etapa 2a: PIN do colaborador ---------- */}
            {etapa === 'pin' && perfil ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void autenticar({ modo: 'perfil', perfilId: perfil.id, pin })
                }}
              >
                <DialogHeader>
                  <span className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/8 text-primary">
                    <User className="size-5" />
                  </span>
                  <DialogTitle>{perfil.nome_colaborador}</DialogTitle>
                  <DialogDescription>Digite seu PIN de 4 dígitos.</DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-3">
                  <Input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    maxLength={4}
                    placeholder="••••"
                    aria-label="PIN de 4 dígitos"
                    aria-invalid={Boolean(erro)}
                    className="h-14 text-center font-mono text-2xl tracking-[0.6em]"
                  />

                  {erro ? (
                    <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      {erro}
                    </p>
                  ) : null}
                </div>

                <DialogFooter className="mt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEtapa('selecao')
                      setPin('')
                      setErro(null)
                    }}
                  >
                    <ArrowLeft className="size-4" />
                    Voltar
                  </Button>
                  <Button type="submit" disabled={carregando || pin.length !== 4}>
                    <LockOpen className="size-4" />
                    {carregando ? 'Validando...' : 'Entrar'}
                  </Button>
                </DialogFooter>
              </form>
            ) : null}

            {/* ---------- Etapa 2b: Senha Mestre ---------- */}
            {etapa === 'master' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void autenticar({ modo: 'master', senha })
                }}
              >
                <DialogHeader>
                  <span className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/8 text-primary">
                    <ShieldCheck className="size-5" />
                  </span>
                  <DialogTitle>Acesso Master</DialogTitle>
                  <DialogDescription>
                    A Senha Mestre libera todas as senhas, inclusive as sem subcategoria.
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="master-password">Senha Mestre</Label>
                    <div className="relative">
                      <Input
                        id="master-password"
                        type={mostrarSenha ? 'text' : 'password'}
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        placeholder="••••••••••••"
                        autoComplete="off"
                        autoFocus
                        className="pr-10"
                        aria-invalid={Boolean(erro)}
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha((v) => !v)}
                        className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                        aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {mostrarSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  {erro ? (
                    <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      {erro}
                    </p>
                  ) : null}
                </div>

                <DialogFooter className="mt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEtapa('selecao')
                      setSenha('')
                      setErro(null)
                    }}
                  >
                    <ArrowLeft className="size-4" />
                    Voltar
                  </Button>
                  <Button type="submit" disabled={carregando || !senha}>
                    <LockOpen className="size-4" />
                    {carregando ? 'Validando...' : 'Liberar acesso'}
                  </Button>
                </DialogFooter>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // ----- Estado liberado -----
  // Alias local para o TypeScript conseguir estreitar a união discriminada.
  const acesso = conteudo.acesso
  const ehMaster = acesso.tipo === 'master'

  return (
    <div className="flex h-full flex-col rounded-xl border border-positive/25 bg-card shadow-xs">
      <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-positive/12 text-positive">
          <LockOpen className="size-4.5" />
        </span>

        <div className="mr-auto">
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            Cofre de Senhas
            <Badge variant={acesso.tipo === 'master' ? 'default' : 'muted'}>
              {acesso.tipo === 'master' ? 'Master' : acesso.nome}
            </Badge>
          </h3>
          <p className="text-xs text-muted-foreground">
            {conteudo.credenciais.length} credencial(is) · clique para copiar
            {conteudo.ocultas > 0 ? ` · ${conteudo.ocultas} fora do seu acesso` : ''}
          </p>
        </div>

        <Badge variant={segundos < 120 ? 'negative' : 'muted'}>
          <Timer className="size-3" />
          <span className="tabular">
            {minutos}:{String(resto).padStart(2, '0')}
          </span>
        </Badge>

        <Button variant="outline" size="sm" onClick={() => void bloquear()}>
          <Lock className="size-3.5" />
          Bloquear
        </Button>
      </header>

      <div className="space-y-2.5 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por serviço, categoria ou usuário..."
            className="pl-9"
          />
        </div>

        {/* Filtros rápidos por subcategoria */}
        {conteudo.subcategorias.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <FiltroChip ativo={filtroSub === null} onClick={() => setFiltroSub(null)}>
              Todas
            </FiltroChip>
            {conteudo.subcategorias.map((sub) => (
              <FiltroChip
                key={sub}
                ativo={filtroSub === sub}
                onClick={() => setFiltroSub(filtroSub === sub ? null : sub)}
              >
                {sub}
              </FiltroChip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-x-auto">
        {filtradas.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {conteudo.credenciais.length === 0
              ? ehMaster
                ? 'Nenhuma credencial cadastrada. Adicione pelo painel administrativo.'
                : 'Nenhuma senha liberada para o seu perfil. Fale com o admin.'
              : 'Nenhum resultado para este filtro.'}
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
              {filtradas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-medium">{c.service_name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {c.category}
                      {c.subcategoria ? (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                          {c.subcategoria}
                        </span>
                      ) : null}
                    </p>
                    {c.notes ? (
                      <p className="mt-0.5 text-xs text-muted-foreground italic">{c.notes}</p>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    {c.username ? (
                      <span className="flex items-center gap-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {c.username}
                        </code>
                        <CopyButton value={c.username} label="usuário" />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {c.password ? (
                      <span className="flex items-center gap-1">
                        <code
                          className={cn(
                            'rounded bg-muted px-1.5 py-0.5 font-mono text-xs',
                            !reveladas.has(c.id) && 'tracking-widest select-none',
                          )}
                        >
                          {reveladas.has(c.id) ? c.password : '••••••••••'}
                        </code>
                        <button
                          type="button"
                          onClick={() => alternarRevelacao(c.id)}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          aria-label={reveladas.has(c.id) ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          {reveladas.has(c.id) ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>
                        <CopyButton value={c.password} label="senha" />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {c.url ? (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={c.url} target="_blank" rel="noopener noreferrer">
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

function FiltroChip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
        ativo
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
