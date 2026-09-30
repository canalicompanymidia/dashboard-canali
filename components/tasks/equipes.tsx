'use client'

import * as React from 'react'
import {
  ChevronDown,
  ChevronRight,
  Crown,
  Layers,
  Loader2,
  Network,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

import { definirGestor, excluirEquipe, salvarEquipe, salvarPessoaAdmin } from '@/app/tasks/actions'
import { ConfirmarExclusao } from '@/components/tasks/dialogs'
import { Avatar, Avatares, Vazio } from '@/components/tasks/pecas'
import { CorPicker } from '@/components/tasks/pickers'
import { useAcao } from '@/components/tasks/use-acao'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PALETA, type Equipe, type Pessoa } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Equipes e organograma. Todo colaborador vê; administradores criam
 * equipes, definem cargo, gestor e equipes de cada pessoa. O organograma
 * é a árvore dos gestores: quem não tem gestor fica no topo.
 */

const SELECT =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25'

function nomeDe(p: Pessoa): string {
  return p.nome?.trim() || p.email
}

function equipesDe(email: string, equipes: Equipe[]): Equipe[] {
  return equipes.filter((e) => e.membros.includes(email) || e.lider_email === email)
}

export function EquipesView({
  pessoas: pessoasDoServidor,
  equipes: equipesDoServidor,
  admin,
}: {
  pessoas: Pessoa[]
  equipes: Equipe[]
  admin: boolean
}) {
  // Cópias locais: a tela responde na hora; o servidor manda a versão
  // definitiva em seguida (revalidação) e as cópias se alinham.
  const [pessoas, setPessoas] = React.useState(pessoasDoServidor)
  const [equipes, setEquipes] = React.useState(equipesDoServidor)
  React.useEffect(() => setPessoas(pessoasDoServidor), [pessoasDoServidor])
  React.useEffect(() => setEquipes(equipesDoServidor), [equipesDoServidor])

  function atualizarPessoa(email: string, patch: Partial<Pessoa>) {
    setPessoas((atual) => atual.map((p) => (p.email === email ? { ...p, ...patch } : p)))
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="rotulo">Tasks · Equipes</p>
          <h1 className="mt-1.5 font-serif text-3xl leading-tight font-normal tracking-[-0.01em]">Equipes e organograma</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {pessoas.length} pessoa{pessoas.length === 1 ? '' : 's'} · {equipes.length} equipe{equipes.length === 1 ? '' : 's'}
            {admin ? '' : ' · só administradores alteram'}
          </p>
        </div>
      </header>

      <Tabs defaultValue="equipes" className="mt-5">
        <TabsList>
          <TabsTrigger value="equipes">
            <Users className="size-3.5" />
            Equipes
          </TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
          <TabsTrigger value="organograma">
            <Network className="size-3.5" />
            Organograma
          </TabsTrigger>
        </TabsList>
        <TabsContent value="equipes" className="pt-4">
          <AbaEquipes
            equipes={equipes}
            pessoas={pessoas}
            admin={admin}
            onSalva={(e) => setEquipes((atual) => (atual.some((x) => x.id === e.id) ? atual.map((x) => (x.id === e.id ? e : x)) : [...atual, e]))}
            onExcluida={(id) => setEquipes((atual) => atual.filter((x) => x.id !== id))}
          />
        </TabsContent>
        <TabsContent value="pessoas" className="pt-4">
          <AbaPessoas
            pessoas={pessoas}
            equipes={equipes}
            admin={admin}
            onSalva={(r) => {
              atualizarPessoa(r.email, { cargo: r.cargo, gestor_email: r.gestor_email })
              setEquipes((atual) =>
                atual.map((e) => {
                  const dentro = r.equipes.includes(e.id)
                  const tem = e.membros.includes(r.email)
                  if (dentro === tem) return e
                  return { ...e, membros: dentro ? [...e.membros, r.email].sort() : e.membros.filter((m) => m !== r.email) }
                }),
              )
            }}
          />
        </TabsContent>
        <TabsContent value="organograma" className="pt-4">
          <Organograma pessoas={pessoas} equipes={equipes} admin={admin} onGestor={(email, gestor) => atualizarPessoa(email, { gestor_email: gestor })} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Equipes
// ---------------------------------------------------------------------------

function AbaEquipes({
  equipes,
  pessoas,
  admin,
  onSalva,
  onExcluida,
}: {
  equipes: Equipe[]
  pessoas: Pessoa[]
  admin: boolean
  onSalva: (e: Equipe) => void
  onExcluida: (id: string) => void
}) {
  const [dialogo, setDialogo] = React.useState<{ equipe: Equipe | null } | null>(null)
  const [excluir, setExcluir] = React.useState<Equipe | null>(null)
  const porEmail = React.useMemo(() => new Map(pessoas.map((p) => [p.email, p])), [pessoas])

  return (
    <div className="space-y-4">
      {admin ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialogo({ equipe: null })}>
            <Plus className="size-4" />
            Nova equipe
          </Button>
        </div>
      ) : null}

      {equipes.length === 0 ? (
        <Vazio
          icone={Users}
          titulo="Nenhuma equipe ainda"
          texto={admin ? 'Crie a primeira com o botão “Nova equipe”: nome, cor, líder e membros.' : 'O administrador ainda não criou equipes.'}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {equipes.map((e) => {
            const lider = e.lider_email ? porEmail.get(e.lider_email) : null
            const membros = e.membros.filter((m) => porEmail.has(m))
            return (
              <li key={e.id} className="group overflow-hidden rounded-xl border border-border bg-card">
                <div className="h-1.5" style={{ backgroundColor: e.cor }} />
                <div className="p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[15px] font-semibold">{e.nome}</h3>
                      {e.descricao ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{e.descricao}</p> : null}
                    </div>
                    {admin ? (
                      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button variant="ghost" size="icon-sm" onClick={() => setDialogo({ equipe: e })} aria-label={`Editar ${e.nome}`}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setExcluir(e)} aria-label={`Excluir ${e.nome}`} className="hover:text-destructive">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    {lider ? (
                      <>
                        <Avatar email={lider.email} tamanho="sm" />
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{nomeDe(lider)}</span>
                          <span className="text-muted-foreground"> · líder</span>
                        </span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Crown className="size-3.5" />
                        Sem líder definido
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Avatares emails={membros} max={6} tamanho="sm" />
                    <span className="text-[11px] text-muted-foreground tabular">
                      {membros.length} pessoa{membros.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {dialogo ? (
        <EquipeDialog
          aberto
          onOpenChange={(o) => !o && setDialogo(null)}
          equipe={dialogo.equipe}
          pessoas={pessoas}
          onSalva={(e) => {
            onSalva(e)
            setDialogo(null)
          }}
        />
      ) : null}
      {excluir ? (
        <ConfirmarExclusao
          aberto
          onOpenChange={(o) => !o && setExcluir(null)}
          titulo={`Excluir a equipe “${excluir.nome}”?`}
          descricao="As pessoas continuam no Hub; só a equipe deixa de existir."
          onConfirmar={() => excluirEquipe(excluir.id)}
          aoConcluir={() => {
            onExcluida(excluir.id)
            setExcluir(null)
          }}
        />
      ) : null}
    </div>
  )
}

function EquipeDialog({
  aberto,
  onOpenChange,
  equipe,
  pessoas,
  onSalva,
}: {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  equipe: Equipe | null
  pessoas: Pessoa[]
  onSalva: (e: Equipe) => void
}) {
  const { executar, pendente, erro } = useAcao()
  const [nome, setNome] = React.useState(equipe?.nome ?? '')
  const [cor, setCor] = React.useState(equipe?.cor ?? PALETA[1])
  const [descricao, setDescricao] = React.useState(equipe?.descricao ?? '')
  const [lider, setLider] = React.useState(equipe?.lider_email ?? '')
  const [membros, setMembros] = React.useState<string[]>(equipe?.membros ?? [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const salva = await executar(() =>
      salvarEquipe({
        id: equipe?.id,
        nome,
        cor,
        descricao: descricao.trim() || null,
        lider_email: lider || null,
        membros,
      }),
    )
    if (salva) onSalva(salva)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{equipe ? 'Editar equipe' : 'Nova equipe'}</DialogTitle>
          <DialogDescription>Nome, cor, quem lidera e quem faz parte.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="equipe-nome">Nome</Label>
            <Input id="equipe-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Marketing, Comercial, Design…" autoFocus required maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <CorPicker valor={cor} onChange={(c) => setCor(c ?? PALETA[1])} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipe-descricao">Descrição (opcional)</Label>
            <Textarea id="equipe-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} className="min-h-16" maxLength={300} placeholder="Pelo que a equipe responde…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipe-lider">Líder</Label>
            <select id="equipe-lider" value={lider} onChange={(e) => setLider(e.target.value)} className={SELECT}>
              <option value="">Sem líder</option>
              {pessoas.map((p) => (
                <option key={p.email} value={p.email}>
                  {nomeDe(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Membros · {membros.length}</Label>
            <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {pessoas.map((p) => {
                const marcado = membros.includes(p.email)
                return (
                  <li key={p.email}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent/60">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) => setMembros(e.target.checked ? [...membros, p.email] : membros.filter((m) => m !== p.email))}
                        className="size-3.5 accent-current"
                      />
                      <Avatar email={p.email} tamanho="xs" />
                      <span className="min-w-0 flex-1 truncate">{nomeDe(p)}</span>
                      {p.cargo ? <span className="truncate text-[11px] text-muted-foreground">{p.cargo}</span> : null}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
          {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente || !nome.trim()}>
              {pendente ? <Loader2 className="size-4 animate-spin" /> : null}
              {equipe ? 'Salvar' : 'Criar equipe'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
//  Pessoas
// ---------------------------------------------------------------------------

/** Todos abaixo de uma pessoa no organograma (para ela não virar subordinada de quem já lidera). */
function descendentesDe(email: string, pessoas: Pessoa[]): Set<string> {
  const saida = new Set<string>()
  const fila = [email]
  while (fila.length > 0) {
    const atual = fila.shift()!
    for (const p of pessoas) {
      if (p.gestor_email === atual && !saida.has(p.email)) {
        saida.add(p.email)
        fila.push(p.email)
      }
    }
  }
  return saida
}

function AbaPessoas({
  pessoas,
  equipes,
  admin,
  onSalva,
}: {
  pessoas: Pessoa[]
  equipes: Equipe[]
  admin: boolean
  onSalva: (r: { email: string; cargo: string | null; gestor_email: string | null; equipes: string[] }) => void
}) {
  const [editando, setEditando] = React.useState<Pessoa | null>(null)
  const porEmail = React.useMemo(() => new Map(pessoas.map((p) => [p.email, p])), [pessoas])

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-2.5">Pessoa</th>
            <th className="px-4 py-2.5">Cargo</th>
            <th className="px-4 py-2.5">Equipes</th>
            <th className="px-4 py-2.5">Gestor</th>
            <th className="px-4 py-2.5">Papel</th>
            {admin ? <th className="px-2 py-2.5" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {pessoas.map((p) => {
            const gestor = p.gestor_email ? porEmail.get(p.gestor_email) : null
            const dela = equipesDe(p.email, equipes)
            return (
              <tr key={p.email} className="group hover:bg-accent/40">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar email={p.email} tamanho="md" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{nomeDe(p)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{p.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.cargo || '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {dela.length === 0 ? <span className="text-muted-foreground">—</span> : null}
                    {dela.map((e) => (
                      <span key={e.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]">
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: e.cor }} />
                        {e.nome}
                        {e.lider_email === p.email ? <Crown className="size-3 text-warning-foreground dark:text-warning" aria-label="líder" /> : null}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{gestor ? nomeDe(gestor) : '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', p.papel === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                    {p.papel === 'admin' ? 'Admin' : 'Colaborador'}
                  </span>
                </td>
                {admin ? (
                  <td className="px-2 py-2.5 text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditando(p)} aria-label={`Editar ${nomeDe(p)}`}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>

      {editando ? (
        <PessoaDialog
          aberto
          onOpenChange={(o) => !o && setEditando(null)}
          pessoa={editando}
          pessoas={pessoas}
          equipes={equipes}
          onSalva={(r) => {
            onSalva(r)
            setEditando(null)
          }}
        />
      ) : null}
    </div>
  )
}

function PessoaDialog({
  aberto,
  onOpenChange,
  pessoa,
  pessoas,
  equipes,
  onSalva,
}: {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  pessoa: Pessoa
  pessoas: Pessoa[]
  equipes: Equipe[]
  onSalva: (r: { email: string; cargo: string | null; gestor_email: string | null; equipes: string[] }) => void
}) {
  const { executar, pendente, erro } = useAcao()
  const [cargo, setCargo] = React.useState(pessoa.cargo ?? '')
  const [gestor, setGestor] = React.useState(pessoa.gestor_email ?? '')
  const [membroDe, setMembroDe] = React.useState<string[]>(equipesDe(pessoa.email, equipes).filter((e) => e.membros.includes(pessoa.email)).map((e) => e.id))
  const bloqueados = React.useMemo(() => descendentesDe(pessoa.email, pessoas), [pessoa.email, pessoas])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const r = await executar(() =>
      salvarPessoaAdmin({ email: pessoa.email, cargo: cargo.trim() || null, gestor_email: gestor || null, equipes: membroDe }),
    )
    if (r) onSalva(r)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Avatar email={pessoa.email} tamanho="md" />
            {nomeDe(pessoa)}
          </DialogTitle>
          <DialogDescription>Cargo, gestor direto e equipes. A pessoa troca a própria foto e o nome em Preferências.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pessoa-cargo">Cargo</Label>
            <Input id="pessoa-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={80} placeholder="Designer, Social media…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pessoa-gestor">Gestor direto</Label>
            <select id="pessoa-gestor" value={gestor} onChange={(e) => setGestor(e.target.value)} className={SELECT}>
              <option value="">Sem gestor (topo do organograma)</option>
              {pessoas
                .filter((p) => p.email !== pessoa.email && !bloqueados.has(p.email))
                .map((p) => (
                  <option key={p.email} value={p.email}>
                    {nomeDe(p)}
                    {p.cargo ? ` · ${p.cargo}` : ''}
                  </option>
                ))}
            </select>
            {bloqueados.size > 0 ? (
              <p className="text-[11px] text-muted-foreground">Quem já está abaixo desta pessoa não aparece: viraria um ciclo.</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Equipes</Label>
            {equipes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma equipe criada ainda.</p>
            ) : (
              <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {equipes.map((e) => (
                  <li key={e.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent/60">
                      <input
                        type="checkbox"
                        checked={membroDe.includes(e.id)}
                        onChange={(ev) => setMembroDe(ev.target.checked ? [...membroDe, e.id] : membroDe.filter((x) => x !== e.id))}
                        className="size-3.5 accent-current"
                      />
                      <span className="size-2 rounded-full" style={{ backgroundColor: e.cor }} />
                      <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                      {e.lider_email === pessoa.email ? <span className="text-[11px] text-muted-foreground">líder</span> : null}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
//  Organograma
// ---------------------------------------------------------------------------

interface ArvoreOrg {
  filhos: Map<string, Pessoa[]>
  /** Quem está no topo e tem gente abaixo. */
  arvores: Pessoa[]
  /** Quem não tem gestor nem subordinados. */
  soltos: Pessoa[]
  nivel: Map<string, number>
}

function montarArvore(pessoas: Pessoa[]): ArvoreOrg {
  const emails = new Set(pessoas.map((p) => p.email))
  const filhos = new Map<string, Pessoa[]>()
  const raizes: Pessoa[] = []
  for (const p of pessoas) {
    const g = p.gestor_email && emails.has(p.gestor_email) && p.gestor_email !== p.email ? p.gestor_email : null
    if (g) {
      const lista = filhos.get(g) ?? []
      lista.push(p)
      filhos.set(g, lista)
    } else raizes.push(p)
  }
  for (const lista of filhos.values()) lista.sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'))

  // Níveis a partir do topo. Quem ficou num ciclo (o servidor impede,
  // mas por via das dúvidas) não é alcançado e vai para "soltos".
  const nivel = new Map<string, number>()
  const fila: [Pessoa, number][] = raizes.map((r) => [r, 0])
  while (fila.length > 0) {
    const [p, n] = fila.shift()!
    if (nivel.has(p.email)) continue
    nivel.set(p.email, n)
    for (const f of filhos.get(p.email) ?? []) fila.push([f, n + 1])
  }
  const naoAlcancados = pessoas.filter((p) => !nivel.has(p.email))
  for (const p of naoAlcancados) nivel.set(p.email, 0)

  const arvores = raizes.filter((r) => (filhos.get(r.email)?.length ?? 0) > 0)
  const soltos = [...raizes.filter((r) => !(filhos.get(r.email)?.length ?? 0)), ...naoAlcancados]
  return { filhos, arvores, soltos, nivel }
}

function Organograma({
  pessoas,
  equipes,
  admin,
  onGestor,
}: {
  pessoas: Pessoa[]
  equipes: Equipe[]
  admin: boolean
  onGestor: (email: string, gestor: string | null) => void
}) {
  const [modo, setModo] = React.useState<'classico' | 'niveis'>('classico')
  const [zoom, setZoom] = React.useState(1)
  const [fechados, setFechados] = React.useState<Set<string>>(new Set())
  const [destaque, setDestaque] = React.useState<string | null>(null)
  const [busca, setBusca] = React.useState('')
  const [erro, setErro] = React.useState<string | null>(null)
  const arvore = React.useMemo(() => montarArvore(pessoas), [pessoas])
  const porEmail = React.useMemo(() => new Map(pessoas.map((p) => [p.email, p])), [pessoas])

  function alternar(email: string) {
    setFechados((atual) => {
      const novo = new Set(atual)
      if (novo.has(email)) novo.delete(email)
      else novo.add(email)
      return novo
    })
  }

  function pular(p: Pessoa) {
    // Abre a cadeia de gestores acima dela e leva a tela até o cartão.
    setFechados((atual) => {
      const novo = new Set(atual)
      let g = p.gestor_email
      for (let i = 0; g && i < 100; i++) {
        novo.delete(g)
        g = porEmail.get(g)?.gestor_email ?? null
      }
      return novo
    })
    setDestaque(p.email)
    window.setTimeout(() => {
      document.getElementById(`org-${p.email}`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }, 50)
    window.setTimeout(() => setDestaque((d) => (d === p.email ? null : d)), 3000)
  }

  function buscar(texto: string) {
    setBusca(texto)
    const t = texto.trim().toLowerCase()
    if (!t) return
    const exata = pessoas.find((p) => nomeDe(p).toLowerCase() === t)
    if (exata) pular(exata)
  }

  async function mudarGestor(email: string, gestor: string | null) {
    setErro(null)
    const anterior = porEmail.get(email)?.gestor_email ?? null
    onGestor(email, gestor)
    const r = await definirGestor({ email, gestor_email: gestor })
    if (!r.ok) {
      onGestor(email, anterior)
      setErro(r.message)
    }
  }

  const props = { equipes, admin, pessoas, destaque, onGestor: mudarGestor }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Modo do organograma">
          {(
            [
              ['classico', 'Clássico', Network],
              ['niveis', 'Por níveis', Layers],
            ] as const
          ).map(([chave, rotulo, Icone]) => (
            <button
              key={chave}
              type="button"
              role="tab"
              aria-selected={modo === chave}
              onClick={() => setModo(chave)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                modo === chave ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icone className="size-3.5" />
              {rotulo}
            </button>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            list="org-pessoas"
            value={busca}
            onChange={(e) => buscar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const t = busca.trim().toLowerCase()
              const achada = pessoas.find((p) => nomeDe(p).toLowerCase().includes(t) || p.email.includes(t))
              if (achada) pular(achada)
            }}
            placeholder="Pular para a pessoa…"
            className="h-8 w-full rounded-lg border border-input bg-card pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
            aria-label="Pular para a pessoa"
          />
          <datalist id="org-pessoas">
            {pessoas.map((p) => (
              <option key={p.email} value={nomeDe(p)} />
            ))}
          </datalist>
        </div>

        {modo === 'classico' ? (
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} aria-label="Diminuir" disabled={zoom <= 0.5}>
              <ZoomOut className="size-3.5" />
            </Button>
            <span className="w-11 text-center text-xs text-muted-foreground tabular">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon-sm" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(1)))} aria-label="Aumentar" disabled={zoom >= 1.4}>
              <ZoomIn className="size-3.5" />
            </Button>
            {fechados.size > 0 ? (
              <button type="button" onClick={() => setFechados(new Set())} className="ml-1 text-xs text-muted-foreground hover:text-foreground">
                Expandir tudo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {erro ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          <span className="flex-1">{erro}</span>
          <button type="button" onClick={() => setErro(null)}>fechar</button>
        </div>
      ) : null}

      {pessoas.length === 0 ? (
        <Vazio icone={Network} titulo="Ninguém no Hub ainda" texto="As pessoas liberadas em Admin › Colaboradores aparecem aqui." />
      ) : modo === 'classico' ? (
        <div className="rounded-xl border border-border bg-card/40">
          {arvore.arvores.length > 0 ? (
            <div className="overflow-auto px-6 py-6">
              <div className="organograma inline-block min-w-full" style={{ zoom }}>
                <ul>
                  {arvore.arvores.map((raiz) => (
                    <No key={raiz.email} pessoa={raiz} filhos={arvore.filhos} fechados={fechados} onAlternar={alternar} {...props} />
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="px-6 py-6 text-center text-sm text-muted-foreground">
              Ainda não há relações de gestão.{' '}
              {admin ? 'Defina o gestor de cada pessoa nos cartões abaixo (ou na aba Pessoas) e a árvore se desenha sozinha.' : 'O administrador define o gestor de cada pessoa.'}
            </p>
          )}

          {arvore.soltos.length > 0 ? (
            <div className="border-t border-border px-6 py-5">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <Users className="size-3.5" />
                Sem gestor definido · {arvore.soltos.length}
              </p>
              <ul className="flex flex-wrap gap-3">
                {arvore.soltos.map((p) => (
                  <li key={p.email}>
                    <CartaoPessoa pessoa={p} {...props} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <PorNiveis nivel={arvore.nivel} porEmail={porEmail} {...props} />
      )}
    </div>
  )
}

interface PropsCartao {
  equipes: Equipe[]
  admin: boolean
  pessoas: Pessoa[]
  destaque: string | null
  onGestor: (email: string, gestor: string | null) => Promise<void>
}

function No({
  pessoa,
  filhos,
  fechados,
  onAlternar,
  ...props
}: PropsCartao & {
  pessoa: Pessoa
  filhos: Map<string, Pessoa[]>
  fechados: Set<string>
  onAlternar: (email: string) => void
}) {
  const sub = filhos.get(pessoa.email) ?? []
  const fechado = fechados.has(pessoa.email)
  const total = React.useMemo(() => {
    let n = 0
    const fila = [...sub]
    while (fila.length > 0) {
      const p = fila.shift()!
      n++
      fila.push(...(filhos.get(p.email) ?? []))
    }
    return n
  }, [sub, filhos])

  return (
    <li>
      <CartaoPessoa pessoa={pessoa} {...props} />
      {sub.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => onAlternar(pessoa.email)}
            className="relative z-10 -mt-px flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border border-border bg-card px-1 text-[10px] text-muted-foreground shadow-xs hover:text-foreground"
            aria-expanded={!fechado}
            aria-label={fechado ? `Mostrar ${total} pessoa(s) abaixo de ${nomeDe(pessoa)}` : `Recolher abaixo de ${nomeDe(pessoa)}`}
          >
            {fechado ? (
              <>
                <ChevronRight className="size-3" />
                {total}
              </>
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>
          {!fechado ? (
            <ul>
              {sub.map((f) => (
                <No key={f.email} pessoa={f} filhos={filhos} fechados={fechados} onAlternar={onAlternar} {...props} />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  )
}

function CartaoPessoa({ pessoa, equipes, admin, pessoas, destaque, onGestor }: PropsCartao & { pessoa: Pessoa }) {
  const dela = equipesDe(pessoa.email, equipes)
  const bloqueados = React.useMemo(() => descendentesDe(pessoa.email, pessoas), [pessoa.email, pessoas])
  return (
    <div
      id={`org-${pessoa.email}`}
      className={cn(
        'w-56 rounded-xl border border-border bg-card p-3 text-left shadow-xs transition-shadow',
        destaque === pessoa.email && 'ring-2 ring-ring shadow-lg',
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar email={pessoa.email} tamanho="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold" title={pessoa.email}>
            {nomeDe(pessoa)}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{pessoa.cargo || (pessoa.papel === 'admin' ? 'Administrador' : 'Sem cargo')}</p>
        </div>
      </div>
      {dela.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {dela.slice(0, 3).map((e) => (
            <span key={e.id} className="inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${e.cor}22`, color: e.cor }}>
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: e.cor }} />
              <span className="truncate">{e.nome}</span>
            </span>
          ))}
          {dela.length > 3 ? <span className="text-[10px] text-muted-foreground">+{dela.length - 3}</span> : null}
        </div>
      ) : null}
      {admin ? (
        <select
          value={pessoa.gestor_email ?? ''}
          onChange={(e) => void onGestor(pessoa.email, e.target.value || null)}
          className="mt-2 h-7 w-full rounded-md border border-input bg-card px-2 text-[11px] text-muted-foreground outline-none focus-visible:border-ring"
          aria-label={`Gestor de ${nomeDe(pessoa)}`}
        >
          <option value="">Gestor: nenhum</option>
          {pessoas
            .filter((p) => p.email !== pessoa.email && !bloqueados.has(p.email))
            .map((p) => (
              <option key={p.email} value={p.email}>
                Gestor: {nomeDe(p)}
              </option>
            ))}
        </select>
      ) : null}
    </div>
  )
}

function PorNiveis({
  nivel,
  porEmail,
  ...props
}: PropsCartao & { nivel: Map<string, number>; porEmail: Map<string, Pessoa> }) {
  const { pessoas } = props
  const grupos = React.useMemo(() => {
    const mapa = new Map<number, Pessoa[]>()
    for (const p of pessoas) {
      const n = nivel.get(p.email) ?? 0
      const lista = mapa.get(n) ?? []
      lista.push(p)
      mapa.set(n, lista)
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0])
  }, [pessoas, nivel])

  return (
    <div className="space-y-4">
      {grupos.map(([n, lista]) => (
        <section key={n} className="rounded-xl border border-border bg-card/40 px-4 py-4">
          <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Nível {n + 1} · {lista.length} pessoa{lista.length === 1 ? '' : 's'}
          </p>
          <ul className="flex flex-wrap gap-3">
            {lista.map((p) => {
              const gestor = p.gestor_email ? porEmail.get(p.gestor_email) : null
              return (
                <li key={p.email} className="space-y-1">
                  <CartaoPessoa pessoa={p} {...props} />
                  {gestor ? <p className="px-1 text-[11px] text-muted-foreground">↳ responde a {nomeDe(gestor)}</p> : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
