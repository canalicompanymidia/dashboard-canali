'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'

import { excluirCampo, excluirLista, salvarCampo, salvarStatuses } from '@/app/tasks/actions'
import { ConfirmarExclusao, ListaDialog } from '@/components/tasks/dialogs'
import { StatusDot } from '@/components/tasks/pecas'
import { CorPicker } from '@/components/tasks/pickers'
import { useTasks } from '@/components/tasks/provider'
import { useAcao } from '@/components/tasks/use-acao'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { podeApagarItem } from '@/lib/tasks/permissoes'
import {
  PALETA,
  STATUS_TIPOS,
  STATUS_TIPOS_ORDEM,
  TIPOS_CAMPO,
  type Campo,
  type ListaContexto,
  type OpcaoCampo,
  type StatusTipo,
  type TipoCampo,
} from '@/lib/tasks/types'
import { cn, slugify } from '@/lib/utils'

/**
 * Configurações da lista: status (nome, cor, tipo, ordem), campos
 * personalizados (do espaço e só desta lista) e a própria lista.
 */
export function ListaConfigDialog({
  aberto,
  onOpenChange,
  contexto,
}: {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  contexto: ListaContexto
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configurações · {contexto.lista.nome}</DialogTitle>
          <DialogDescription>Status do fluxo, campos personalizados e dados da lista.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="status">
          <TabsList>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="campos">Campos</TabsTrigger>
            <TabsTrigger value="lista">Lista</TabsTrigger>
          </TabsList>
          <TabsContent value="status" className="pt-4">
            <EditorDeStatus contexto={contexto} />
          </TabsContent>
          <TabsContent value="campos" className="pt-4">
            <EditorDeCampos contexto={contexto} />
          </TabsContent>
          <TabsContent value="lista" className="pt-4">
            <DadosDaLista contexto={contexto} onFechar={() => onOpenChange(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
//  Status
// ---------------------------------------------------------------------------

interface StatusRascunho {
  id?: string
  nome: string
  cor: string
  tipo: StatusTipo
}

const SELECT =
  'h-8 rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25'

function EditorDeStatus({ contexto }: { contexto: ListaContexto }) {
  const { executar, pendente, erro, mensagem } = useAcao()
  const [itens, setItens] = React.useState<StatusRascunho[]>(() =>
    contexto.statuses.map((s) => ({ id: s.id, nome: s.nome, cor: s.cor, tipo: s.tipo })),
  )
  const [sujo, setSujo] = React.useState(false)

  React.useEffect(() => {
    setItens(contexto.statuses.map((s) => ({ id: s.id, nome: s.nome, cor: s.cor, tipo: s.tipo })))
    setSujo(false)
  }, [contexto.statuses])

  function mudar(i: number, patch: Partial<StatusRascunho>) {
    setItens((atual) => atual.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
    setSujo(true)
  }

  function mover(i: number, delta: number) {
    setItens((atual) => {
      const novo = [...atual]
      const j = i + delta
      if (j < 0 || j >= novo.length) return atual
      ;[novo[i], novo[j]] = [novo[j], novo[i]]
      return novo
    })
    setSujo(true)
  }

  const removidos = contexto.statuses.filter((s) => !itens.some((i) => i.id === s.id))

  async function salvar() {
    const salvos = await executar(() => salvarStatuses({ lista_id: contexto.lista.id, statuses: itens }))
    if (salvos) setSujo(false)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        A ordem aqui é a ordem das colunas do quadro. O <strong>tipo</strong> diz se a tarefa conta como
        pendente ou feita nas telas de Início.
      </p>

      <ul className="space-y-1.5">
        {itens.map((s, i) => (
          <li key={s.id ?? `novo-${i}`} className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent" aria-label="Cor do status">
                  <StatusDot cor={s.cor} tipo={s.tipo} className="size-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2">
                <CorPicker valor={s.cor} onChange={(c) => mudar(i, { cor: c ?? PALETA[0] })} />
              </PopoverContent>
            </Popover>
            <Input
              value={s.nome}
              onChange={(e) => mudar(i, { nome: e.target.value })}
              className="h-8 flex-1 text-sm"
              maxLength={40}
              aria-label="Nome do status"
            />
            <select
              value={s.tipo}
              onChange={(e) => mudar(i, { tipo: e.target.value as StatusTipo })}
              className={cn(SELECT, 'w-36')}
              aria-label="Tipo do status"
              title={STATUS_TIPOS[s.tipo].descricao}
            >
              {STATUS_TIPOS_ORDEM.map((t) => (
                <option key={t} value={t}>
                  {STATUS_TIPOS[t].rotulo}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon-sm" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">
              <ArrowUp className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => mover(i, 1)} disabled={i === itens.length - 1} aria-label="Descer">
              <ArrowDown className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                setItens((atual) => atual.filter((_, idx) => idx !== i))
                setSujo(true)
              }}
              disabled={itens.length <= 1}
              aria-label="Remover status"
            >
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setItens((atual) => [...atual, { nome: '', cor: PALETA[atual.length % PALETA.length], tipo: 'ativo' }])
          setSujo(true)
        }}
      >
        <Plus className="size-3.5" />
        Adicionar status
      </Button>

      {removidos.length > 0 ? (
        <p className="rounded-lg bg-warning/10 p-2.5 text-xs text-warning-foreground dark:text-warning">
          As tarefas de {removidos.map((s) => `“${s.nome}”`).join(', ')} vão para o primeiro status da lista ao salvar.
        </p>
      ) : null}

      {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
      {mensagem && !sujo ? <p className="text-xs text-positive">{mensagem}</p> : null}

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={pendente || !sujo || itens.some((s) => !s.nome.trim())}>
          {pendente ? <Loader2 className="size-4 animate-spin" /> : null}
          Salvar status
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Campos personalizados
// ---------------------------------------------------------------------------

function EditorDeCampos({ contexto }: { contexto: ListaContexto }) {
  const [editando, setEditando] = React.useState<Campo | 'novo' | null>(null)
  const [excluindo, setExcluindo] = React.useState<Campo | null>(null)
  const doEspaco = contexto.campos.filter((c) => !c.lista_id)
  const daLista = contexto.campos.filter((c) => c.lista_id)

  return (
    <div className="space-y-4">
      {editando ? (
        <FormularioDeCampo
          contexto={contexto}
          campo={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
        />
      ) : (
        <>
          <GrupoDeCampos titulo={`Campos do espaço ${contexto.espaco.nome}`} campos={doEspaco} onEditar={setEditando} onExcluir={setExcluindo} vazio="Nenhum campo vale para o espaço inteiro." />
          <GrupoDeCampos titulo="Campos só desta lista" campos={daLista} onEditar={setEditando} onExcluir={setExcluindo} vazio="Nenhum campo exclusivo desta lista." />
          <Button variant="outline" size="sm" onClick={() => setEditando('novo')}>
            <Plus className="size-3.5" />
            Criar campo
          </Button>
        </>
      )}

      {excluindo ? (
        <ConfirmarExclusao
          aberto
          onOpenChange={(o) => !o && setExcluindo(null)}
          titulo={`Excluir o campo “${excluindo.nome}”?`}
          descricao="Os valores já preenchidos nas tarefas deixam de aparecer."
          onConfirmar={() => excluirCampo(excluindo.id)}
        />
      ) : null}
    </div>
  )
}

function GrupoDeCampos({
  titulo,
  campos,
  onEditar,
  onExcluir,
  vazio,
}: {
  titulo: string
  campos: Campo[]
  onEditar: (c: Campo) => void
  onExcluir: (c: Campo) => void
  vazio: string
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{titulo}</h4>
      {campos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {campos.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{c.nome}</span>
              <span className="text-xs text-muted-foreground">
                {TIPOS_CAMPO[c.tipo]}
                {c.opcoes.length ? ` · ${c.opcoes.length} opções` : ''}
              </span>
              <Button variant="ghost" size="icon-sm" onClick={() => onEditar(c)} aria-label={`Editar ${c.nome}`}>
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => onExcluir(c)} aria-label={`Excluir ${c.nome}`}>
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FormularioDeCampo({
  contexto,
  campo,
  onFechar,
}: {
  contexto: ListaContexto
  campo: Campo | null
  onFechar: () => void
}) {
  const { executar, pendente, erro } = useAcao()
  const [nome, setNome] = React.useState(campo?.nome ?? '')
  const [tipo, setTipo] = React.useState<TipoCampo>(campo?.tipo ?? 'texto')
  const [escopo, setEscopo] = React.useState<'espaco' | 'lista'>(campo?.lista_id ? 'lista' : 'espaco')
  const [opcoes, setOpcoes] = React.useState<OpcaoCampo[]>(campo?.opcoes ?? [])
  const temOpcoes = tipo === 'selecao' || tipo === 'multiselecao'

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const salvo = await executar(() =>
      salvarCampo({
        id: campo?.id,
        espaco_id: contexto.espaco.id,
        lista_id: escopo === 'lista' ? contexto.lista.id : null,
        nome,
        tipo,
        opcoes: temOpcoes ? opcoes.filter((o) => o.nome.trim()) : [],
      }),
    )
    if (salvo) onFechar()
  }

  return (
    <form onSubmit={salvar} className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="campo-nome">Nome do campo</Label>
          <Input id="campo-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Produto, Canal, Data de publicação..." autoFocus required maxLength={60} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campo-tipo">Tipo</Label>
          <select id="campo-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCampo)} className={cn(SELECT, 'h-9 w-full text-sm')} disabled={Boolean(campo)}>
            {(Object.keys(TIPOS_CAMPO) as TipoCampo[]).map((t) => (
              <option key={t} value={t}>
                {TIPOS_CAMPO[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Onde vale</Label>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="escopo" checked={escopo === 'espaco'} onChange={() => setEscopo('espaco')} className="accent-current" />
            Todas as listas de {contexto.espaco.nome}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="escopo" checked={escopo === 'lista'} onChange={() => setEscopo('lista')} className="accent-current" />
            Só {contexto.lista.nome}
          </label>
        </div>
      </div>

      {temOpcoes ? (
        <div className="space-y-1.5">
          <Label>Opções</Label>
          <ul className="space-y-1">
            {opcoes.map((o, i) => (
              <li key={o.id} className="flex items-center gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="size-6 shrink-0 rounded-full border border-border" style={{ backgroundColor: o.cor }} aria-label="Cor da opção" />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <CorPicker valor={o.cor} onChange={(c) => setOpcoes((atual) => atual.map((x, idx) => (idx === i ? { ...x, cor: c ?? PALETA[0] } : x)))} />
                  </PopoverContent>
                </Popover>
                <Input
                  value={o.nome}
                  onChange={(e) => setOpcoes((atual) => atual.map((x, idx) => (idx === i ? { ...x, nome: e.target.value } : x)))}
                  className="h-8 text-sm"
                  maxLength={60}
                  aria-label="Nome da opção"
                />
                <Button variant="ghost" size="icon-sm" onClick={() => setOpcoes((atual) => atual.filter((_, idx) => idx !== i))} aria-label="Remover opção">
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setOpcoes((atual) => [
                ...atual,
                { id: `${slugify(`op-${Date.now().toString(36)}`)}-${atual.length}`, nome: '', cor: PALETA[atual.length % PALETA.length] },
              ])
            }
          >
            <Plus className="size-3.5" />
            Adicionar opção
          </Button>
        </div>
      ) : null}

      {erro ? <p className="text-xs text-destructive">{erro}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente || !nome.trim()}>
          {pendente ? <Loader2 className="size-4 animate-spin" /> : null}
          {campo ? 'Salvar campo' : 'Criar campo'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
//  Dados da lista
// ---------------------------------------------------------------------------

function DadosDaLista({ contexto, onFechar }: { contexto: ListaContexto; onFechar: () => void }) {
  const router = useRouter()
  const { colab } = useTasks()
  const [editando, setEditando] = React.useState(false)
  const [excluindo, setExcluindo] = React.useState(false)
  const podeExcluir = podeApagarItem(colab, contexto.lista, { ...contexto.espaco, membros: [] })

  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted-foreground">Nome</dt>
        <dd>{contexto.lista.nome}</dd>
        <dt className="text-muted-foreground">Espaço</dt>
        <dd>{contexto.espaco.nome}{contexto.pasta ? ` / ${contexto.pasta.nome}` : ''}</dd>
        <dt className="text-muted-foreground">Descrição</dt>
        <dd className="whitespace-pre-wrap">{contexto.lista.descricao || '—'}</dd>
        <dt className="text-muted-foreground">Tarefas</dt>
        <dd>
          {contexto.lista.tarefas_total} no total · {contexto.lista.tarefas_concluidas} concluídas · {contexto.lista.tarefas_atrasadas} atrasadas
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
          <Pencil className="size-3.5" />
          Editar nome, cor e descrição
        </Button>
        {podeExcluir ? (
          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setExcluindo(true)}>
            <Trash2 className="size-3.5" />
            Excluir lista
          </Button>
        ) : null}
      </div>
      <ListaDialog aberto={editando} onOpenChange={setEditando} espacoId={contexto.espaco.id} lista={contexto.lista} />
      <ConfirmarExclusao
        aberto={excluindo}
        onOpenChange={setExcluindo}
        titulo={`Excluir a lista “${contexto.lista.nome}”?`}
        descricao={
          <>
            As {contexto.lista.tarefas_total} tarefa(s) dela serão apagadas, com anexos e comentários.{' '}
            <strong className="text-destructive">Não dá para desfazer.</strong>
          </>
        }
        onConfirmar={() => excluirLista(contexto.lista.id)}
        aoConcluir={() => {
          onFechar()
          router.push(`/tasks/e/${contexto.espaco.id}`)
        }}
      />
    </div>
  )
}
