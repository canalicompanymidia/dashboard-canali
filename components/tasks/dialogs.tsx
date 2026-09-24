'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Lock, Trash2 } from 'lucide-react'

import {
  atualizarEspaco,
  atualizarLista,
  criarEspaco,
  criarLista,
  criarPasta,
  criarTarefa,
  renomearPasta,
} from '@/app/tasks/actions'
import { Avatar } from '@/components/tasks/pecas'
import { CorPicker, DataPicker, PessoasPicker, PrioridadePicker, StatusPicker } from '@/components/tasks/pickers'
import { useTasks } from '@/components/tasks/provider'
import { useAcao } from '@/components/tasks/use-acao'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type {
  EspacoComArvore,
  Lista,
  Pasta,
  Prioridade,
  Resultado,
  Status,
} from '@/lib/tasks/types'
import { PALETA } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Diálogos de criação e edição da estrutura: espaço, pasta, lista, nova
 * tarefa e a confirmação de exclusão. Cada um é controlado de fora
 * (aberto/onOpenChange) para a barra lateral e as páginas reaproveitarem.
 */

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null
  return (
    <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
      <AlertTriangle className="mt-px size-3.5 shrink-0" />
      {texto}
    </p>
  )
}

const SELECT =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25'

// ---------------------------------------------------------------------------
//  Espaço
// ---------------------------------------------------------------------------

export function EspacoDialog({
  aberto,
  onOpenChange,
  espaco,
}: {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  espaco?: EspacoComArvore | null
}) {
  const router = useRouter()
  const { pessoas, colab } = useTasks()
  const { executar, pendente, erro, limpar } = useAcao()

  const [nome, setNome] = React.useState('')
  const [cor, setCor] = React.useState(PALETA[11])
  const [privado, setPrivado] = React.useState(false)
  const [membros, setMembros] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!aberto) return
    setNome(espaco?.nome ?? '')
    setCor(espaco?.cor ?? PALETA[11])
    setPrivado(espaco?.privado ?? false)
    setMembros(espaco?.membros ?? [])
    limpar()
  }, [aberto, espaco, limpar])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const payload = { nome, cor, privado, membros: privado ? membros : [] }
    if (espaco) {
      const ok = await executar(() => atualizarEspaco({ id: espaco.id, ...payload }))
      if (ok !== undefined) onOpenChange(false)
      return
    }
    const criado = await executar(() => criarEspaco(payload))
    if (criado) {
      onOpenChange(false)
      router.push(`/tasks/e/${criado.id}`)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{espaco ? 'Configurar espaço' : 'Novo espaço'}</DialogTitle>
          <DialogDescription>
            Um espaço agrupa as pastas e listas de um time ou de uma frente de trabalho.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="espaco-nome">Nome</Label>
            <Input
              id="espaco-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Marketing, Comercial, Produto..."
              autoFocus
              required
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <CorPicker valor={cor} onChange={(c) => setCor(c ?? PALETA[11])} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Lock className="size-3.5" />
                Espaço privado
              </p>
              <p className="text-xs text-muted-foreground">
                Só administradores e as pessoas escolhidas abaixo enxergam.
              </p>
            </div>
            <Switch checked={privado} onCheckedChange={setPrivado} aria-label="Espaço privado" />
          </div>

          {privado ? (
            <div className="space-y-1.5">
              <Label>Quem pode ver</Label>
              <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {pessoas.map((p) => {
                  const admin = p.papel === 'admin'
                  const marcado = admin || membros.includes(p.email)
                  return (
                    <li key={p.email}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent/60',
                          admin && 'cursor-default opacity-70',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={admin}
                          onChange={(e) =>
                            setMembros(
                              e.target.checked
                                ? [...membros, p.email]
                                : membros.filter((m) => m !== p.email),
                            )
                          }
                          className="size-3.5 accent-current"
                        />
                        <Avatar email={p.email} tamanho="xs" />
                        <span className="min-w-0 flex-1 truncate">
                          {p.nome || p.email}
                          {p.email === colab.email ? (
                            <span className="ml-1 text-[11px] text-muted-foreground">(você)</span>
                          ) : null}
                        </span>
                        {admin ? (
                          <span className="text-[11px] text-muted-foreground">admin · sempre vê</span>
                        ) : null}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          <Erro texto={erro} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente || !nome.trim()}>
              {pendente ? <Loader2 className="size-4 animate-spin" /> : null}
              {espaco ? 'Salvar' : 'Criar espaço'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
//  Pasta
// ---------------------------------------------------------------------------

export function PastaDialog({
  aberto,
  onOpenChange,
  espacoId,
  pasta,
}: {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  espacoId: string
  pasta?: Pasta | null
}) {
  const router = useRouter()
  const { executar, pendente, erro, limpar } = useAcao()
  const [nome, setNome] = React.useState('')

  React.useEffect(() => {
    if (!aberto) return
    setNome(pasta?.nome ?? '')
    limpar()
  }, [aberto, pasta, limpar])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (pasta) {
      const ok = await executar(() => renomearPasta({ id: pasta.id, espaco_id: espacoId, nome }))
      if (ok !== undefined) onOpenChange(false)
      return
    }
    const criada = await executar(() => criarPasta({ espaco_id: espacoId, nome }))
    if (criada) {
      onOpenChange(false)
      router.push(`/tasks/p/${criada.id}`)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{pasta ? 'Renomear pasta' : 'Nova pasta'}</DialogTitle>
          <DialogDescription>Pastas organizam listas dentro de um espaço.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pasta-nome">Nome</Label>
            <Input
              id="pasta-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Gestão do Time"
              autoFocus
              required
              maxLength={80}
            />
          </div>
          <Erro texto={erro} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente || !nome.trim()}>
              {pendente ? <Loader2 className="size-4 animate-spin" /> : null}
              {pasta ? 'Salvar' : 'Criar pasta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
//  Lista
// ---------------------------------------------------------------------------

export function ListaDialog({
  aberto,
  onOpenChange,
  espacoId,
  pastaId = null,
  lista,
}: {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  espacoId: string
  pastaId?: string | null
  lista?: Lista | null
}) {
  const router = useRouter()
  const { executar, pendente, erro, limpar } = useAcao()
  const [nome, setNome] = React.useState('')
  const [cor, setCor] = React.useState<string | null>(null)
  const [descricao, setDescricao] = React.useState('')

  React.useEffect(() => {
    if (!aberto) return
    setNome(lista?.nome ?? '')
    setCor(lista?.cor ?? null)
    setDescricao(lista?.descricao ?? '')
    limpar()
  }, [aberto, lista, limpar])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      espaco_id: espacoId,
      pasta_id: lista ? lista.pasta_id : pastaId,
      nome,
      cor,
      descricao: descricao.trim() || null,
    }
    if (lista) {
      const ok = await executar(() => atualizarLista({ id: lista.id, ...payload }))
      if (ok !== undefined) onOpenChange(false)
      return
    }
    const criada = await executar(() => criarLista(payload))
    if (criada) {
      onOpenChange(false)
      router.push(`/tasks/l/${criada.id}`)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lista ? 'Editar lista' : 'Nova lista'}</DialogTitle>
          <DialogDescription>
            {lista
              ? 'Nome, cor e descrição. Os status e campos ficam nas configurações da lista.'
              : 'A lista nasce com os status das listas vizinhas do espaço — dá para ajustar depois.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lista-nome">Nome</Label>
            <Input
              id="lista-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="DESIGNER, Conteúdo e Comunicação..."
              autoFocus
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <CorPicker valor={cor} onChange={setCor} permitirNenhuma />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lista-descricao">Descrição (opcional)</Label>
            <Textarea
              id="lista-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Para que serve esta lista, como o time a usa..."
              className="min-h-16"
              maxLength={500}
            />
          </div>
          <Erro texto={erro} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente || !nome.trim()}>
              {pendente ? <Loader2 className="size-4 animate-spin" /> : null}
              {lista ? 'Salvar' : 'Criar lista'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
//  Exclusão
// ---------------------------------------------------------------------------

export function ConfirmarExclusao({
  aberto,
  onOpenChange,
  titulo,
  descricao,
  rotulo = 'Excluir',
  onConfirmar,
  aoConcluir,
}: {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  titulo: string
  descricao: React.ReactNode
  rotulo?: string
  onConfirmar: () => Promise<Resultado<unknown>>
  aoConcluir?: () => void
}) {
  const { executar, pendente, erro, limpar } = useAcao()

  React.useEffect(() => {
    if (aberto) limpar()
  }, [aberto, limpar])

  async function confirmar() {
    const ok = await executar(onConfirmar)
    if (ok !== undefined) {
      onOpenChange(false)
      aoConcluir?.()
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">{descricao}</div>
          </DialogDescription>
        </DialogHeader>
        <Erro texto={erro} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={confirmar} disabled={pendente}>
            {pendente ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {rotulo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
//  Nova tarefa
// ---------------------------------------------------------------------------

export function NovaTarefaDialog({
  aberto,
  onOpenChange,
  listaId,
  statuses = [],
  padrao,
  aoCriar,
}: {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  /** Fixa a lista. Sem ela, o diálogo oferece a escolha. */
  listaId?: string
  statuses?: Status[]
  padrao?: { status_id?: string; data_vencimento?: string | null; pai_id?: string | null }
  aoCriar?: (id: string) => void
}) {
  const { arvore, colab } = useTasks()
  const { executar, pendente, erro, limpar } = useAcao()

  const [titulo, setTitulo] = React.useState('')
  const [lista, setLista] = React.useState(listaId ?? '')
  const [statusId, setStatusId] = React.useState<string>('')
  const [responsaveis, setResponsaveis] = React.useState<string[]>([])
  const [prioridade, setPrioridade] = React.useState<Prioridade | null>(null)
  const [vencimento, setVencimento] = React.useState<string | null>(null)
  const [descricao, setDescricao] = React.useState('')

  React.useEffect(() => {
    if (!aberto) return
    setTitulo('')
    setLista(listaId ?? primeiraLista(arvore) ?? '')
    setStatusId(padrao?.status_id ?? '')
    setResponsaveis([])
    setPrioridade(null)
    setVencimento(padrao?.data_vencimento ?? null)
    setDescricao('')
    limpar()
  }, [aberto, listaId, padrao, arvore, limpar])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const criada = await executar(() =>
      criarTarefa({
        lista_id: lista,
        titulo,
        status_id: statusId || undefined,
        pai_id: padrao?.pai_id ?? null,
        prioridade,
        data_vencimento: vencimento,
        responsaveis,
        descricao: descricao.trim() || null,
      }),
    )
    if (criada) {
      onOpenChange(false)
      aoCriar?.(criada.id)
    }
  }

  const opcoesDeLista = React.useMemo(() => listasDaArvore(arvore), [arvore])

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{padrao?.pai_id ? 'Nova subtarefa' : 'Nova tarefa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="O que precisa ser feito?"
            autoFocus
            required
            maxLength={300}
            className="h-11 text-base"
            aria-label="Título da tarefa"
          />

          {!listaId ? (
            <div className="space-y-1.5">
              <Label htmlFor="tarefa-lista">Lista</Label>
              <select
                id="tarefa-lista"
                value={lista}
                onChange={(e) => setLista(e.target.value)}
                className={SELECT}
                required
              >
                <option value="">Escolha a lista...</option>
                {opcoesDeLista.map((grupo) => (
                  <optgroup key={grupo.rotulo} label={grupo.rotulo}>
                    {grupo.listas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            {statuses.length > 0 ? (
              <StatusPicker
                statuses={statuses}
                valor={statusId || (statuses.find((s) => s.tipo === 'aberto') ?? statuses[0]).id}
                onChange={(s) => setStatusId(s.id)}
              />
            ) : null}
            <PessoasPicker valor={responsaveis} onChange={setResponsaveis} />
            <PrioridadePicker valor={prioridade} onChange={setPrioridade} />
            <DataPicker valor={vencimento} onChange={setVencimento} rotulo="Vencimento" vazio="Vencimento" />
            {responsaveis.length === 0 ? (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setResponsaveis([colab.email])}
              >
                atribuir a mim
              </button>
            ) : null}
          </div>

          <Textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição (opcional)"
            className="min-h-20"
          />

          <Erro texto={erro} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente || !titulo.trim() || !lista}>
              {pendente ? <Loader2 className="size-4 animate-spin" /> : null}
              Criar {padrao?.pai_id ? 'subtarefa' : 'tarefa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function primeiraLista(arvore: EspacoComArvore[]): string | null {
  for (const e of arvore) {
    for (const p of e.pastas) if (p.listas[0]) return p.listas[0].id
    if (e.listas[0]) return e.listas[0].id
  }
  return null
}

/** Listas agrupadas por "Espaço / Pasta" para um <select>. */
export function listasDaArvore(arvore: EspacoComArvore[]): { rotulo: string; listas: Lista[] }[] {
  const grupos: { rotulo: string; listas: Lista[] }[] = []
  for (const e of arvore) {
    if (e.listas.length > 0) grupos.push({ rotulo: e.nome, listas: e.listas })
    for (const p of e.pastas) {
      if (p.listas.length > 0) grupos.push({ rotulo: `${e.nome} / ${p.nome}`, listas: p.listas })
    }
  }
  return grupos
}
