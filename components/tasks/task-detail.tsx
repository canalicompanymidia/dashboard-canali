'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowRightLeft,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  CornerDownRight,
  Download,
  Eye,
  EyeOff,
  File,
  FolderOpen,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import {
  adicionarItemChecklist,
  alternarItemChecklist,
  atualizarTarefa,
  carregarTarefa,
  comentar,
  criarTarefa,
  duplicarTarefa,
  editarComentario,
  excluirAnexo,
  excluirComentario,
  excluirItemChecklist,
  excluirTarefa,
  moverParaLista,
  pedirUploadDeAnexo,
  registrarAnexo,
} from '@/app/tasks/actions'
import { ConfirmarExclusao, listasDaArvore } from '@/components/tasks/dialogs'
import {
  Avatar,
  Avatares,
  DataChip,
  MarcaEspaco,
  StatusDot,
  StatusPill,
} from '@/components/tasks/pecas'
import {
  CampoEditor,
  DataPicker,
  EtiquetasEditor,
  PessoasPicker,
  PrioridadePicker,
  StatusPicker,
} from '@/components/tasks/pickers'
import { useTasks } from '@/components/tasks/provider'
import { useAcao } from '@/components/tasks/use-acao'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  formatarDataCurta,
  formatarDataHora,
  formatarEstimativa,
  formatarRelativo,
  interpretarEstimativa,
} from '@/lib/tasks/datas'
import { podeApagarComentario, podeEditarComentario } from '@/lib/tasks/permissoes'
import {
  BUCKET_ANEXOS,
  statusEncerra,
  type Anexo,
  type Atividade,
  type Campo,
  type Comentario,
  type ItemChecklist,
  type Tarefa,
  type TarefaDetalhe,
  type ValorCampo,
} from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * O modal da tarefa — a tela mais densa do módulo, no formato do ClickUp:
 * à esquerda os campos, descrição, subtarefas, checklist e anexos; à
 * direita o histórico com os comentários. Cada campo salva sozinho ao
 * ser alterado; nada de botão "Salvar".
 */

type Patch = Parameters<typeof atualizarTarefa>[1]

export function TaskDetailDialog({ tarefaId }: { tarefaId: string }) {
  const { fecharTarefa } = useTasks()
  const [detalhe, setDetalhe] = React.useState<TarefaDetalhe | null>(null)
  const [erroCarga, setErroCarga] = React.useState<string | null>(null)

  React.useEffect(() => {
    let ativo = true
    carregarTarefa(tarefaId).then((r) => {
      if (!ativo) return
      if (r.ok) setDetalhe(r.data)
      else setErroCarga(r.message)
    })
    return () => {
      ativo = false
    }
  }, [tarefaId])

  return (
    <Dialog open onOpenChange={(o) => !o && fecharTarefa()}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-2rem)]',
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {erroCarga ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <DialogTitle className="font-serif text-xl">Não deu para abrir a tarefa</DialogTitle>
            <p className="text-sm text-muted-foreground">{erroCarga}</p>
            <Button variant="outline" onClick={fecharTarefa}>
              Fechar
            </Button>
          </div>
        ) : !detalhe ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <DialogTitle className="sr-only">Carregando tarefa</DialogTitle>
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Detalhe detalhe={detalhe} setDetalhe={setDetalhe} />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
//  Corpo
// ---------------------------------------------------------------------------

export function Detalhe({
  detalhe,
  setDetalhe,
}: {
  detalhe: TarefaDetalhe
  setDetalhe: React.Dispatch<React.SetStateAction<TarefaDetalhe | null>>
}) {
  const { tarefa, statuses, campos } = detalhe
  const { fecharTarefa, abrirTarefa, arvore, colab } = useTasks()
  const { executar, erro, setErro } = useAcao()
  const [confirmarExclusao, setConfirmarExclusao] = React.useState(false)
  const [moverAberto, setMoverAberto] = React.useState(false)

  const atualizar = React.useCallback(
    (fn: (d: TarefaDetalhe) => TarefaDetalhe) => setDetalhe((d) => (d ? fn(d) : d)),
    [setDetalhe],
  )

  const salvar = React.useCallback(
    async (patch: Patch) => {
      const nova = await executar(() => atualizarTarefa(tarefa.id, patch))
      if (nova) atualizar((d) => ({ ...d, tarefa: nova }))
      return nova
    },
    [executar, tarefa.id, atualizar],
  )

  // O histórico é recarregado depois de cada mudança — é o servidor que
  // escreve as linhas, então só ele sabe o texto exato de cada uma.
  const recarregarHistorico = React.useCallback(async () => {
    const r = await carregarTarefa(tarefa.id)
    if (r.ok) atualizar((d) => ({ ...d, atividades: r.data.atividades, comentarios: r.data.comentarios }))
  }, [tarefa.id, atualizar])

  const salvarComHistorico = React.useCallback(
    async (patch: Patch) => {
      const nova = await salvar(patch)
      if (nova) void recarregarHistorico()
      return nova
    },
    [salvar, recarregarHistorico],
  )

  const concluida = statusEncerra(tarefa.status_tipo)
  const listasDestino = React.useMemo(() => listasDaArvore(arvore), [arvore])

  return (
    <>
      {/* Cabeçalho: trilha, menu e fechar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground" aria-label="Onde a tarefa está">
          <Link href={`/tasks/e/${tarefa.espaco_id}`} className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground">
            <MarcaEspaco nome={tarefa.espaco_nome} cor={tarefa.espaco_cor} />
            <span className="hidden truncate sm:inline">{tarefa.espaco_nome}</span>
          </Link>
          {tarefa.pasta_id ? (
            <>
              <ChevronRight className="size-3 shrink-0" />
              <Link href={`/tasks/p/${tarefa.pasta_id}`} className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground">
                <FolderOpen className="size-3.5 shrink-0 text-warning-foreground dark:text-warning" />
                <span className="hidden truncate sm:inline">{tarefa.pasta_nome}</span>
              </Link>
            </>
          ) : null}
          <ChevronRight className="size-3 shrink-0" />
          <Link href={`/tasks/l/${tarefa.lista_id}`} className="min-w-0 truncate rounded px-1 py-0.5 font-medium text-foreground hover:bg-accent">
            {tarefa.lista_nome}
          </Link>
          {tarefa.pai_id ? (
            <>
              <ChevronRight className="size-3 shrink-0" />
              <button
                type="button"
                onClick={() => abrirTarefa(tarefa.pai_id!)}
                className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
              >
                <CornerDownRight className="size-3 shrink-0" />
                <span className="truncate">{tarefa.pai_titulo}</span>
              </button>
            </>
          ) : null}
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Mais opções">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onSelect={async () => {
                const copia = await executar(() => duplicarTarefa(tarefa.id))
                if (copia) abrirTarefa(copia.id)
              }}
            >
              <Copy />
              Duplicar
            </DropdownMenuItem>
            {!tarefa.pai_id ? (
              <DropdownMenuItem onSelect={() => setMoverAberto(true)}>
                <ArrowRightLeft />
                Mover para outra lista
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setConfirmarExclusao(true)}>
              <Trash2 />
              Excluir tarefa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon-sm" onClick={fecharTarefa} aria-label="Fechar">
          <X className="size-4" />
        </Button>
      </div>

      {erro ? (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <span className="flex-1">{erro}</span>
          <button type="button" onClick={() => setErro(null)} aria-label="Fechar aviso">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Coluna principal */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-7 px-4 py-5 sm:px-8">
            <TituloEditavel titulo={tarefa.titulo} concluida={concluida} onSalvar={(t) => salvarComHistorico({ titulo: t })} />

            <Propriedades detalhe={detalhe} salvar={salvarComHistorico} />

            <Descricao valor={tarefa.descricao} onSalvar={(d) => salvarComHistorico({ descricao: d })} />

            {campos.length > 0 ? (
              <CamposPersonalizados
                campos={campos}
                valores={tarefa.campos}
                onChange={(id, valor) => salvarComHistorico({ campo: { id, valor } })}
              />
            ) : null}

            {!tarefa.pai_id ? (
              <Subtarefas
                tarefa={tarefa}
                subtarefas={detalhe.subtarefas}
                statuses={statuses}
                onAdicionar={(nova) => atualizar((d) => ({ ...d, subtarefas: [...d.subtarefas, nova] }))}
                onAtualizar={(sub) =>
                  atualizar((d) => ({ ...d, subtarefas: d.subtarefas.map((s) => (s.id === sub.id ? sub : s)) }))
                }
              />
            ) : null}

            <Checklist
              tarefa={tarefa}
              itens={detalhe.checklist}
              setItens={(fn) => atualizar((d) => ({ ...d, checklist: fn(d.checklist) }))}
            />

            <Anexos
              tarefa={tarefa}
              anexos={detalhe.anexos}
              setAnexos={(fn) => atualizar((d) => ({ ...d, anexos: fn(d.anexos) }))}
              aoMudar={recarregarHistorico}
            />

            <p className="text-[11px] text-muted-foreground">
              Criada {formatarDataHora(tarefa.created_at)}
              {tarefa.criado_por ? <> por <NomeDe email={tarefa.criado_por} /></> : null} · atualizada{' '}
              {formatarRelativo(tarefa.updated_at)}
            </p>
          </div>
        </div>

        {/* Atividade */}
        <Atividade
          detalhe={detalhe}
          colabEmail={colab.email}
          setComentarios={(fn) => atualizar((d) => ({ ...d, comentarios: fn(d.comentarios) }))}
        />
      </div>

      <ConfirmarExclusao
        aberto={confirmarExclusao}
        onOpenChange={setConfirmarExclusao}
        titulo="Excluir esta tarefa?"
        descricao={
          <>
            <strong className="text-foreground">{tarefa.titulo}</strong> será apagada com subtarefas, anexos e
            comentários. <strong className="text-destructive">Não dá para desfazer.</strong>
          </>
        }
        onConfirmar={() => excluirTarefa(tarefa.id)}
        aoConcluir={fecharTarefa}
      />

      <Dialog open={moverAberto} onOpenChange={setMoverAberto}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Mover para outra lista</DialogTitle>
          <p className="text-sm text-muted-foreground">
            As subtarefas vão junto. O status é mantido quando a lista de destino tem um com o mesmo nome;
            senão a tarefa entra no primeiro status de lá.
          </p>
          <select
            className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            defaultValue=""
            onChange={async (e) => {
              const listaId = e.target.value
              if (!listaId) return
              const nova = await executar(() => moverParaLista({ tarefa_id: tarefa.id, lista_id: listaId }))
              if (nova) {
                setMoverAberto(false)
                const r = await carregarTarefa(nova.id)
                if (r.ok) setDetalhe(r.data)
              }
            }}
          >
            <option value="">Escolha a lista...</option>
            {listasDestino.map((g) => (
              <optgroup key={g.rotulo} label={g.rotulo}>
                {g.listas
                  .filter((l) => l.id !== tarefa.lista_id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </DialogContent>
      </Dialog>
    </>
  )
}

function NomeDe({ email }: { email: string }) {
  const { nomeDe } = useTasks()
  return <>{nomeDe(email)}</>
}

// ---------------------------------------------------------------------------
//  Título
// ---------------------------------------------------------------------------

function TituloEditavel({
  titulo,
  concluida,
  onSalvar,
}: {
  titulo: string
  concluida: boolean
  onSalvar: (titulo: string) => Promise<unknown>
}) {
  const [texto, setTexto] = React.useState(titulo)
  React.useEffect(() => setTexto(titulo), [titulo])

  function confirmar() {
    const t = texto.trim()
    if (!t) return setTexto(titulo)
    if (t !== titulo) void onSalvar(t)
  }

  return (
    <div>
      <DialogTitle className="sr-only">{titulo}</DialogTitle>
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLTextAreaElement).blur()
          }
          if (e.key === 'Escape') {
            setTexto(titulo)
            ;(e.target as HTMLTextAreaElement).blur()
          }
        }}
        rows={1}
        maxLength={300}
        aria-label="Título da tarefa"
        className={cn(
          'min-h-0 resize-none rounded-md border-transparent bg-transparent px-2 py-1 font-serif text-2xl leading-tight font-normal',
          'hover:border-border focus-visible:border-ring sm:text-[28px]',
          concluida && 'text-muted-foreground line-through',
        )}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Propriedades
// ---------------------------------------------------------------------------

function Propriedade({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-3">
      <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">{rotulo}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Propriedades({ detalhe, salvar }: { detalhe: TarefaDetalhe; salvar: (p: Patch) => Promise<unknown> }) {
  const { tarefa, statuses } = detalhe
  const [estimativa, setEstimativa] = React.useState(formatarEstimativa(tarefa.estimativa_minutos))
  React.useEffect(() => setEstimativa(formatarEstimativa(tarefa.estimativa_minutos)), [tarefa.estimativa_minutos])

  return (
    <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
      <Propriedade rotulo="Status">
        <StatusPicker statuses={statuses} valor={tarefa.status_id} onChange={(s) => salvar({ status_id: s.id })} />
      </Propriedade>

      <Propriedade rotulo="Responsáveis">
        <PessoasPicker valor={tarefa.responsaveis} onChange={(emails) => salvar({ responsaveis: emails })} />
      </Propriedade>

      <Propriedade rotulo="Datas">
        <div className="flex flex-wrap items-center gap-1">
          <DataPicker valor={tarefa.data_inicio} onChange={(iso) => salvar({ data_inicio: iso })} rotulo="Início" vazio="Início" />
          <span className="text-xs text-muted-foreground">→</span>
          <DataPicker
            valor={tarefa.data_vencimento}
            onChange={(iso) => salvar({ data_vencimento: iso })}
            rotulo="Vencimento"
            vazio="Vencimento"
          >
            <button
              type="button"
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-1.5 text-sm outline-none hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
                !tarefa.data_vencimento && 'text-muted-foreground',
              )}
            >
              <Calendar className="size-3.5" />
              {tarefa.data_vencimento ? (
                <DataChip iso={tarefa.data_vencimento} concluida={statusEncerra(tarefa.status_tipo)} className="text-xs" />
              ) : (
                <span className="text-xs">Vencimento</span>
              )}
            </button>
          </DataPicker>
        </div>
      </Propriedade>

      <Propriedade rotulo="Prioridade">
        <PrioridadePicker valor={tarefa.prioridade} onChange={(p) => salvar({ prioridade: p })} />
      </Propriedade>

      <Propriedade rotulo="Estimativa">
        <input
          value={estimativa}
          onChange={(e) => setEstimativa(e.target.value)}
          onBlur={() => {
            const t = estimativa.trim()
            if (!t) {
              if (tarefa.estimativa_minutos !== null) void salvar({ estimativa_minutos: null })
              return
            }
            const minutos = interpretarEstimativa(t)
            if (minutos === null) return setEstimativa(formatarEstimativa(tarefa.estimativa_minutos))
            if (minutos !== tarefa.estimativa_minutos) void salvar({ estimativa_minutos: minutos })
            else setEstimativa(formatarEstimativa(minutos))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          placeholder="ex.: 2h 30min"
          className="h-7 w-32 rounded-md border border-transparent bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground hover:border-border focus-visible:border-ring"
          aria-label="Estimativa de tempo"
        />
      </Propriedade>

      <Propriedade rotulo="Etiquetas">
        <EtiquetasEditor valor={tarefa.etiquetas} onChange={(e) => salvar({ etiquetas: e })} />
      </Propriedade>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Descrição
// ---------------------------------------------------------------------------

function Descricao({ valor, onSalvar }: { valor: string | null; onSalvar: (d: string | null) => Promise<unknown> }) {
  const [texto, setTexto] = React.useState(valor ?? '')
  const [estado, setEstado] = React.useState<'ocioso' | 'salvando' | 'salvo'>('ocioso')
  React.useEffect(() => setTexto(valor ?? ''), [valor])

  async function confirmar() {
    if ((texto.trim() || null) === (valor ?? null) && texto === (valor ?? '')) return
    setEstado('salvando')
    await onSalvar(texto.trim() ? texto : null)
    setEstado('salvo')
    setTimeout(() => setEstado('ocioso'), 1500)
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Descrição</h3>
        <span className="text-[11px] text-muted-foreground">
          {estado === 'salvando' ? 'Salvando…' : estado === 'salvo' ? 'Salvo' : ''}
        </span>
      </div>
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        placeholder="Escreva o contexto, o briefing, os links… Salva ao sair do campo."
        className="min-h-24 border-transparent bg-transparent px-2 leading-relaxed hover:border-border focus-visible:border-ring"
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
//  Campos personalizados
// ---------------------------------------------------------------------------

function valorVazio(v: ValorCampo | undefined): boolean {
  return v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0)
}

function CamposPersonalizados({
  campos,
  valores,
  onChange,
}: {
  campos: Campo[]
  valores: Record<string, ValorCampo>
  onChange: (id: string, valor: ValorCampo) => void
}) {
  const vazios = campos.filter((c) => valorVazio(valores[c.id]))
  const [mostrarVazios, setMostrarVazios] = React.useState(vazios.length <= 4)
  const visiveis = mostrarVazios ? campos : campos.filter((c) => !valorVazio(valores[c.id]))

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Campos</h3>
      {visiveis.length === 0 ? (
        <p className="px-2 py-1 text-sm text-muted-foreground">Nenhum campo preenchido.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {visiveis.map((campo) => (
            <div key={campo.id} className="flex min-h-9 items-center gap-3 px-2">
              <span className="w-40 shrink-0 truncate text-xs text-muted-foreground" title={campo.nome}>
                {campo.nome}
              </span>
              <div className="min-w-0 flex-1">
                <CampoEditor campo={campo} valor={valores[campo.id] ?? null} onChange={(v) => onChange(campo.id, v)} />
              </div>
            </div>
          ))}
        </div>
      )}
      {vazios.length > 0 ? (
        <button
          type="button"
          onClick={() => setMostrarVazios((v) => !v)}
          className="mt-1.5 flex items-center gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {mostrarVazios ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {mostrarVazios ? `Ocultar ${vazios.length} campos vazios` : `Mostrar ${vazios.length} campos vazios`}
        </button>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
//  Subtarefas
// ---------------------------------------------------------------------------

function Subtarefas({
  tarefa,
  subtarefas,
  statuses,
  onAdicionar,
  onAtualizar,
}: {
  tarefa: Tarefa
  subtarefas: Tarefa[]
  statuses: TarefaDetalhe['statuses']
  onAdicionar: (t: Tarefa) => void
  onAtualizar: (t: Tarefa) => void
}) {
  const { abrirTarefa } = useTasks()
  const { executar, pendente } = useAcao()
  const [titulo, setTitulo] = React.useState('')
  const [adicionando, setAdicionando] = React.useState(false)
  const feitas = subtarefas.filter((s) => statusEncerra(s.status_tipo)).length

  async function adicionar() {
    const t = titulo.trim()
    if (!t) return setAdicionando(false)
    const nova = await executar(() => criarTarefa({ lista_id: tarefa.lista_id, titulo: t, pai_id: tarefa.id }))
    if (nova) {
      onAdicionar(nova)
      setTitulo('')
    }
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Subtarefas{subtarefas.length > 0 ? ` · ${feitas}/${subtarefas.length}` : ''}
        </h3>
      </div>
      {subtarefas.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {subtarefas.map((sub) => (
            <li key={sub.id} className="flex h-9 items-center gap-2 px-2 hover:bg-accent/40">
              <StatusPicker
                statuses={statuses}
                valor={sub.status_id}
                onChange={async (s) => {
                  const nova = await executar(() => atualizarTarefa(sub.id, { status_id: s.id }))
                  if (nova) onAtualizar(nova)
                }}
              >
                <button type="button" className="flex size-6 items-center justify-center rounded hover:bg-accent" aria-label={`Status: ${sub.status_nome}`}>
                  <StatusDot cor={sub.status_cor} tipo={sub.status_tipo} />
                </button>
              </StatusPicker>
              <button
                type="button"
                onClick={() => abrirTarefa(sub.id)}
                className={cn('min-w-0 flex-1 truncate text-left text-sm hover:underline', statusEncerra(sub.status_tipo) && 'text-muted-foreground line-through')}
              >
                {sub.titulo}
              </button>
              <Avatares emails={sub.responsaveis} tamanho="xs" />
              <DataChip iso={sub.data_vencimento} concluida={statusEncerra(sub.status_tipo)} />
            </li>
          ))}
        </ul>
      ) : null}
      {adicionando ? (
        <input
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={adicionar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void adicionar()
            }
            if (e.key === 'Escape') {
              setTitulo('')
              setAdicionando(false)
            }
          }}
          disabled={pendente}
          placeholder="Nome da subtarefa — Enter para criar"
          className="mt-1.5 h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdicionando(true)}
          className="mt-1.5 flex items-center gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Adicionar subtarefa
        </button>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
//  Checklist
// ---------------------------------------------------------------------------

function Checklist({
  tarefa,
  itens,
  setItens,
}: {
  tarefa: Tarefa
  itens: ItemChecklist[]
  setItens: (fn: (itens: ItemChecklist[]) => ItemChecklist[]) => void
}) {
  const { executar, pendente } = useAcao()
  const [texto, setTexto] = React.useState('')
  const [adicionando, setAdicionando] = React.useState(false)
  const feitos = itens.filter((i) => i.feito).length

  async function adicionar() {
    const t = texto.trim()
    if (!t) return setAdicionando(false)
    const item = await executar(() => adicionarItemChecklist({ tarefa_id: tarefa.id, texto: t }), { atualizar: false })
    if (item) {
      setItens((atual) => [...atual, item])
      setTexto('')
    }
  }

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Checklist{itens.length > 0 ? ` · ${feitos}/${itens.length}` : ''}
      </h3>
      {itens.length > 0 ? (
        <ul className="space-y-0.5">
          {itens.map((item) => (
            <li key={item.id} className="group flex min-h-8 items-center gap-2 rounded-md px-2 hover:bg-accent/40">
              <input
                type="checkbox"
                checked={item.feito}
                onChange={async (e) => {
                  const feito = e.target.checked
                  setItens((atual) => atual.map((i) => (i.id === item.id ? { ...i, feito } : i)))
                  const salvo = await executar(() => alternarItemChecklist(item.id, feito), { atualizar: false })
                  if (!salvo) setItens((atual) => atual.map((i) => (i.id === item.id ? { ...i, feito: !feito } : i)))
                }}
                className="size-4 accent-current"
                aria-label={item.texto}
              />
              <span className={cn('flex-1 text-sm', item.feito && 'text-muted-foreground line-through')}>{item.texto}</span>
              <button
                type="button"
                onClick={async () => {
                  const ok = await executar(() => excluirItemChecklist(item.id), { atualizar: false })
                  if (ok !== undefined) setItens((atual) => atual.filter((i) => i.id !== item.id))
                }}
                className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remover ${item.texto}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {adicionando ? (
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={adicionar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void adicionar()
            }
            if (e.key === 'Escape') {
              setTexto('')
              setAdicionando(false)
            }
          }}
          disabled={pendente}
          placeholder="Novo item — Enter para adicionar"
          className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdicionando(true)}
          className="mt-1 flex items-center gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ListChecks className="size-3.5" />
          {itens.length === 0 ? 'Criar checklist' : 'Adicionar item'}
        </button>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
//  Anexos
// ---------------------------------------------------------------------------

function tamanhoLegivel(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

function Anexos({
  tarefa,
  anexos,
  setAnexos,
  aoMudar,
}: {
  tarefa: Tarefa
  anexos: Anexo[]
  setAnexos: (fn: (anexos: Anexo[]) => Anexo[]) => void
  aoMudar: () => void
}) {
  const { executar } = useAcao()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [progresso, setProgresso] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  const [arrastando, setArrastando] = React.useState(false)

  async function enviar(arquivos: FileList | File[]) {
    const lista = Array.from(arquivos)
    if (lista.length === 0) return
    setErro(null)

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setErro('Supabase não configurado no navegador.')

    for (let i = 0; i < lista.length; i++) {
      const arquivo = lista[i]
      setProgresso(`Enviando ${i + 1} de ${lista.length}: ${arquivo.name}`)

      const pedido = await pedirUploadDeAnexo({
        tarefa_id: tarefa.id,
        nome: arquivo.name,
        tipo_mime: arquivo.type || null,
        tamanho: arquivo.size,
      })
      if (!pedido.ok) {
        setErro(pedido.message)
        break
      }

      const { error } = await supabase.storage
        .from(BUCKET_ANEXOS)
        .uploadToSignedUrl(pedido.data.caminho, pedido.data.token, arquivo, {
          contentType: arquivo.type || undefined,
        })
      if (error) {
        setErro(`Falha ao enviar ${arquivo.name}: ${error.message}`)
        break
      }

      const registro = await registrarAnexo({
        tarefa_id: tarefa.id,
        caminho: pedido.data.caminho,
        nome: arquivo.name,
        tipo_mime: arquivo.type || null,
        tamanho: arquivo.size,
      })
      if (!registro.ok) {
        setErro(registro.message)
        break
      }
      setAnexos((atual) => [...atual, registro.data])
    }

    setProgresso(null)
    aoMudar()
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Anexos{anexos.length > 0 ? ` · ${anexos.length}` : ''}
        </h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          disabled={progresso !== null}
        >
          <Upload className="size-3.5" />
          Enviar arquivo
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void enviar(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastando(false)
          void enviar(e.dataTransfer.files)
        }}
        className={cn(
          'rounded-lg border border-dashed p-2 transition-colors',
          arrastando ? 'border-ring bg-accent/60' : 'border-border',
        )}
      >
        {anexos.length === 0 && !progresso ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 py-4 text-xs text-muted-foreground hover:text-foreground"
          >
            <Paperclip className="size-4" />
            Arraste arquivos para cá ou clique para escolher (até 50 MB cada)
          </button>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {anexos.map((a) => {
              const imagem = Boolean(a.tipo_mime?.startsWith('image/')) && Boolean(a.url)
              return (
                <li key={a.id} className="group relative overflow-hidden rounded-lg border border-border bg-card">
                  <a
                    href={a.url ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    title={a.nome}
                  >
                    <div className="flex h-24 items-center justify-center bg-muted/60">
                      {imagem ? (
                        // <img>: a URL é assinada e temporária, o otimizador do Next não serve.
                        <img src={a.url!} alt={a.nome} className="size-full object-cover" loading="lazy" />
                      ) : (
                        <File className="size-7 text-muted-foreground/60" />
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="truncate text-[11px] font-medium">{a.nome}</p>
                      <p className="text-[10px] text-muted-foreground">{tamanhoLegivel(a.tamanho)}</p>
                    </div>
                  </a>
                  <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {a.url ? (
                      <a
                        href={a.url}
                        download={a.nome}
                        className="rounded-md bg-card/90 p-1 text-muted-foreground shadow hover:text-foreground"
                        aria-label={`Baixar ${a.nome}`}
                      >
                        <Download className="size-3.5" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await executar(() => excluirAnexo(a.id), { atualizar: false })
                        if (ok !== undefined) {
                          setAnexos((atual) => atual.filter((x) => x.id !== a.id))
                          aoMudar()
                        }
                      }}
                      className="rounded-md bg-card/90 p-1 text-muted-foreground shadow hover:text-destructive"
                      aria-label={`Excluir ${a.nome}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
            {progresso ? (
              <li className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground sm:col-span-1">
                <Loader2 className="size-4 animate-spin" />
                <span className="truncate">{progresso}</span>
              </li>
            ) : null}
          </ul>
        )}
      </div>
      {erro ? <p className="mt-1.5 text-xs text-destructive">{erro}</p> : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
//  Atividade e comentários
// ---------------------------------------------------------------------------

type ItemLinhaDoTempo =
  | { tipo: 'atividade'; data: string; atividade: Atividade }
  | { tipo: 'comentario'; data: string; comentario: Comentario }

function Atividade({
  detalhe,
  colabEmail,
  setComentarios,
}: {
  detalhe: TarefaDetalhe
  colabEmail: string
  setComentarios: (fn: (c: Comentario[]) => Comentario[]) => void
}) {
  const { colab } = useTasks()
  const { executar, pendente, erro } = useAcao()
  const [texto, setTexto] = React.useState('')
  const fimRef = React.useRef<HTMLDivElement>(null)

  const linha = React.useMemo<ItemLinhaDoTempo[]>(() => {
    const itens: ItemLinhaDoTempo[] = [
      ...detalhe.atividades.map((a) => ({ tipo: 'atividade' as const, data: a.created_at, atividade: a })),
      ...detalhe.comentarios.map((c) => ({ tipo: 'comentario' as const, data: c.created_at, comentario: c })),
    ]
    return itens.sort((a, b) => a.data.localeCompare(b.data))
  }, [detalhe.atividades, detalhe.comentarios])

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [linha.length])

  async function enviar() {
    const t = texto.trim()
    if (!t) return
    const novo = await executar(() => comentar({ tarefa_id: detalhe.tarefa.id, texto: t }))
    if (novo) {
      setComentarios((atual) => [...atual, novo])
      setTexto('')
    }
  }

  return (
    <aside className="flex min-h-0 flex-col border-t border-border bg-card/40 lg:w-[380px] lg:shrink-0 lg:border-t-0 lg:border-l">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-4">
        <h3 className="text-sm font-semibold">Atividade</h3>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <ol className="space-y-3">
          {linha.map((item) =>
            item.tipo === 'atividade' ? (
              <LinhaAtividade key={item.atividade.id} atividade={item.atividade} campos={detalhe.campos} />
            ) : (
              <LinhaComentario
                key={item.comentario.id}
                comentario={item.comentario}
                podeEditar={podeEditarComentario(colab, item.comentario.autor)}
                podeApagar={podeApagarComentario(colab, item.comentario.autor)}
                onEditar={async (t) => {
                  const salvo = await executar(() => editarComentario(item.comentario.id, t), { atualizar: false })
                  if (salvo) setComentarios((atual) => atual.map((c) => (c.id === salvo.id ? salvo : c)))
                  return Boolean(salvo)
                }}
                onExcluir={async () => {
                  const ok = await executar(() => excluirComentario(item.comentario.id), { atualizar: false })
                  if (ok !== undefined) setComentarios((atual) => atual.filter((c) => c.id !== item.comentario.id))
                }}
              />
            ),
          )}
        </ol>
        <div ref={fimRef} />
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-start gap-2">
          <Avatar email={colabEmail} tamanho="md" className="mt-1" />
          <div className="min-w-0 flex-1">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void enviar()
                }
              }}
              placeholder="Escreva um comentário… (Ctrl+Enter envia)"
              className="min-h-16 text-[13px]"
            />
            {erro ? <p className="mt-1 text-xs text-destructive">{erro}</p> : null}
            <div className="mt-1.5 flex justify-end">
              <Button size="sm" onClick={enviar} disabled={pendente || !texto.trim()}>
                {pendente ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Comentar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function LinhaAtividade({ atividade, campos }: { atividade: Atividade; campos: Campo[] }) {
  const { nomeDe } = useTasks()
  const d = atividade.detalhe as Record<string, unknown>
  const autor = atividade.autor ? nomeDe(atividade.autor) : 'Alguém'
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  const lista = (v: unknown) => (Array.isArray(v) ? (v as string[]).map(nomeDe).join(', ') : '')

  let conteudo: React.ReactNode
  switch (atividade.tipo) {
    case 'criou':
      conteudo = d.copia_de ? (
        <>duplicou a tarefa a partir de “{texto(d.copia_de)}”</>
      ) : (
        <>criou esta tarefa{d.lista ? <> em {texto(d.lista)}</> : null}</>
      )
      break
    case 'status':
      conteudo = (
        <>
          alterou o status de{' '}
          <StatusPill nome={texto(d.de)} cor={texto(d.de_cor) || '#8a817c'} tamanho="xs" className="align-middle" /> para{' '}
          <StatusPill nome={texto(d.para)} cor={texto(d.para_cor) || '#8a817c'} tamanho="xs" className="align-middle" />
        </>
      )
      break
    case 'prioridade':
      conteudo = d.para ? <>definiu a prioridade como <strong>{texto(d.para)}</strong></> : <>removeu a prioridade</>
      break
    case 'data_vencimento':
      conteudo = d.para ? <>definiu o vencimento para <strong>{formatarDataCurta(texto(d.para))}</strong></> : <>removeu o vencimento</>
      break
    case 'data_inicio':
      conteudo = d.para ? <>definiu o início para <strong>{formatarDataCurta(texto(d.para))}</strong></> : <>removeu a data de início</>
      break
    case 'titulo':
      conteudo = <>renomeou de “{texto(d.de)}” para “{texto(d.para)}”</>
      break
    case 'descricao':
      conteudo = <>editou a descrição</>
      break
    case 'estimativa':
      conteudo = d.para ? <>estimou em <strong>{formatarEstimativa(Number(d.para))}</strong></> : <>removeu a estimativa</>
      break
    case 'etiquetas':
      conteudo = <>alterou as etiquetas{Array.isArray(d.para) && d.para.length ? <> para {(d.para as string[]).join(', ')}</> : null}</>
      break
    case 'responsaveis': {
      const entram = lista(d.entram)
      const saem = lista(d.saem)
      conteudo = (
        <>
          {entram ? <>atribuiu a <strong>{entram}</strong></> : null}
          {entram && saem ? ' e ' : null}
          {saem ? <>removeu <strong>{saem}</strong></> : null}
        </>
      )
      break
    }
    case 'campo': {
      const campo = campos.find((c) => c.id === d.campo_id)
      conteudo = <>alterou o campo <strong>{campo?.nome ?? 'personalizado'}</strong></>
      break
    }
    case 'lista':
      conteudo = <>moveu de <strong>{texto(d.de)}</strong> para <strong>{texto(d.para)}</strong></>
      break
    case 'anexo':
      conteudo = <>anexou <strong>{texto(d.nome)}</strong></>
      break
    case 'anexo_removido':
      conteudo = <>removeu o anexo <strong>{texto(d.nome)}</strong></>
      break
    default:
      conteudo = <>{atividade.tipo}</>
  }

  return (
    <li className="flex items-start gap-2 text-xs text-muted-foreground">
      <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-border" aria-hidden />
      <p className="min-w-0 flex-1 leading-relaxed">
        <span className="font-medium text-foreground">{autor}</span> {conteudo}
      </p>
      <time className="shrink-0 text-[11px] tabular" dateTime={atividade.created_at} title={formatarDataHora(atividade.created_at)}>
        {formatarRelativo(atividade.created_at)}
      </time>
    </li>
  )
}

function LinhaComentario({
  comentario,
  podeEditar,
  podeApagar,
  onEditar,
  onExcluir,
}: {
  comentario: Comentario
  podeEditar: boolean
  podeApagar: boolean
  onEditar: (texto: string) => Promise<boolean>
  onExcluir: () => Promise<void>
}) {
  const { nomeDe } = useTasks()
  const [editando, setEditando] = React.useState(false)
  const [texto, setTexto] = React.useState(comentario.texto)

  return (
    <li className="group rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Avatar email={comentario.autor} tamanho="sm" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{nomeDe(comentario.autor)}</span>
        <time className="text-[11px] text-muted-foreground tabular" dateTime={comentario.created_at} title={formatarDataHora(comentario.created_at)}>
          {formatarDataHora(comentario.created_at)}
        </time>
        {(podeEditar || podeApagar) && !editando ? (
          <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {podeEditar ? (
              <button type="button" onClick={() => setEditando(true)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Editar comentário">
                <Pencil className="size-3" />
              </button>
            ) : null}
            {podeApagar ? (
              <button type="button" onClick={() => void onExcluir()} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Excluir comentário">
                <Trash2 className="size-3" />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {editando ? (
        <div className="mt-2 space-y-1.5">
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-16 text-[13px]" autoFocus />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => { setEditando(false); setTexto(comentario.texto) }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (await onEditar(texto)) setEditando(false)
              }}
              disabled={!texto.trim()}
            >
              <Check className="size-3.5" />
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap">{comentario.texto}</p>
      )}
    </li>
  )
}

