'use client'

import * as React from 'react'
import { ChevronDown, Layers, Plus, Users, Video } from 'lucide-react'

import { atualizarTarefa, criarTarefa, moverTarefa } from '@/app/tasks/actions'
import { Avatar, Avatares, ChipsDeCampos, DataChip, PrioridadeFlag, StatusPill } from '@/components/tasks/pecas'
import { useEventosDeTarefa, useTasks } from '@/components/tasks/provider'
import { Indicadores } from '@/components/tasks/task-row'
import { useAcao } from '@/components/tasks/use-acao'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { diaDaSemana, formatarDataCurta, hojeISO, somarDias } from '@/lib/tasks/datas'
import { aplicarPatchLocal, type PatchLocal } from '@/lib/tasks/patch-local'
import {
  PRIORIDADES,
  PRIORIDADES_ORDEM,
  statusEncerra,
  type ListaContexto,
  type Prioridade,
  type Status,
  type Tarefa,
  type TarefaAtualizada,
} from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Quadro (kanban). As colunas podem ser os status (padrão), os
 * responsáveis, as prioridades ou as faixas de vencimento. Arrastar um
 * card para outra coluna muda o campo correspondente; dentro da coluna,
 * reordena. A posição é fracionária — soltar entre dois cards só grava a
 * tarefa movida. A escolha do agrupamento fica guardada por lista, neste
 * navegador.
 */

type Agrupamento = 'status' | 'responsavel' | 'prioridade' | 'vencimento'

const AGRUPAMENTOS: { chave: Agrupamento; rotulo: string }[] = [
  { chave: 'status', rotulo: 'Status' },
  { chave: 'responsavel', rotulo: 'Responsável' },
  { chave: 'prioridade', rotulo: 'Prioridade' },
  { chave: 'vencimento', rotulo: 'Vencimento' },
]

type NovaTarefaValores = Partial<{
  status_id: string
  prioridade: Prioridade | null
  data_vencimento: string | null
  responsaveis: string[]
}>

interface Coluna {
  id: string
  titulo: React.ReactNode
  subtitulo?: string
  cards: Tarefa[]
  /**
   * Como a tarefa muda ao ser solta aqui, vinda da coluna `origem`.
   * `{}` = só reordena. null na coluna = não aceita soltar.
   */
  aoSoltar: ((tarefa: Tarefa, origem: string | null) => PatchLocal) | null
  /** Valores da tarefa criada pelo "Adicionar tarefa" desta coluna. null = sem criação rápida. */
  nova: NovaTarefaValores | null
  /** Coluna que some quando está vazia (pessoas sem tarefa, concluídas antigas). */
  ocultavel?: boolean
}

export function ViewQuadro({ contexto, tarefas }: { contexto: ListaContexto; tarefas: Tarefa[] }) {
  const { statuses, campos, lista } = contexto
  const { pessoas, nomeDe, emitir } = useTasks()
  const { executar, erro, setErro } = useAcao()
  const [itens, setItens] = React.useState(tarefas)
  React.useEffect(() => setItens(tarefas), [tarefas])
  useEventosDeTarefa(lista.id, setItens)

  // Preferência por lista, lembrada neste navegador.
  const chavePreferencia = `canali-tasks-quadro-${lista.id}`
  const [agrupar, setAgrupar] = React.useState<Agrupamento>('status')
  const [mostrarVazias, setMostrarVazias] = React.useState(false)
  // Layout effect: aplica a preferência antes da primeira pintura, sem
  // piscar o quadro por status.
  React.useLayoutEffect(() => {
    try {
      const salvo = localStorage.getItem(chavePreferencia)
      if (!salvo) return
      const p = JSON.parse(salvo) as { agrupar?: Agrupamento; vazias?: boolean }
      if (p.agrupar && AGRUPAMENTOS.some((a) => a.chave === p.agrupar)) setAgrupar(p.agrupar)
      if (typeof p.vazias === 'boolean') setMostrarVazias(p.vazias)
    } catch {
      // Sem storage o quadro abre por status.
    }
  }, [chavePreferencia])
  function guardar(prox: { agrupar: Agrupamento; vazias: boolean }) {
    setAgrupar(prox.agrupar)
    setMostrarVazias(prox.vazias)
    try {
      localStorage.setItem(chavePreferencia, JSON.stringify(prox))
    } catch {
      // idem
    }
  }

  const [arrastando, setArrastando] = React.useState<string | null>(null)
  const [sobre, setSobre] = React.useState<string | null>(null)
  const origemRef = React.useRef<string | null>(null)

  const hoje = hojeISO()
  const colunas = React.useMemo(
    () => montarColunas(agrupar, itens, statuses, pessoas.map((p) => p.email), nomeDe, hoje),
    [agrupar, itens, statuses, pessoas, nomeDe, hoje],
  )
  const visiveis = colunas.filter(
    (c) => c.cards.length > 0 || !c.ocultavel || (agrupar === 'responsavel' && mostrarVazias),
  )
  const totalRaiz = itens.filter((t) => !t.pai_id).length

  async function soltar(coluna: Coluna, antesDeId: string | null) {
    const id = arrastando
    const origem = origemRef.current
    setArrastando(null)
    setSobre(null)
    origemRef.current = null
    if (!id || !coluna.aoSoltar) return

    const original = itens.find((t) => t.id === id)
    if (!original) return
    const patch = coluna.aoSoltar(original, origem)

    // Posição dentro da coluna de destino.
    const cards = coluna.cards.filter((t) => t.id !== id)
    let posicao: number
    if (antesDeId && antesDeId !== id) {
      const idx = cards.findIndex((t) => t.id === antesDeId)
      const anterior = cards[idx - 1]
      const proxima = cards[idx]
      posicao = anterior ? (anterior.posicao + proxima.posicao) / 2 : proxima.posicao - 1024
    } else {
      const ultima = cards[cards.length - 1]
      posicao = ultima ? ultima.posicao + 1024 : 1024
    }

    const mudaCampo = Object.keys(patch).length > 0
    const mudaPosicao = original.posicao !== posicao
    if (!mudaCampo && !mudaPosicao) return

    // Otimista: o card já aparece no lugar novo enquanto o servidor grava.
    const local: Tarefa = { ...aplicarPatchLocal(original, patch, statuses), posicao }
    setItens((atual) => atual.map((t) => (t.id === id ? local : t)))
    const reverter = () => setItens((atual) => atual.map((t) => (t.id === id ? original : t)))

    let salvo: TarefaAtualizada | undefined
    if (agrupar === 'status') {
      salvo = await executar(() => moverTarefa({ tarefa_id: id, status_id: patch.status_id ?? original.status_id, posicao }))
    } else {
      if (mudaPosicao) {
        salvo = await executar(() => moverTarefa({ tarefa_id: id, status_id: original.status_id, posicao }))
        if (!salvo) return reverter()
      }
      if (mudaCampo) salvo = await executar(() => atualizarTarefa(id, patch))
    }
    if (!salvo) return reverter()

    const gravada = salvo.tarefa
    setItens((atual) => atual.map((t) => (t.id === id ? gravada : t)))
    emitir({ tipo: 'atualizada', tarefa: gravada })
  }

  const rotuloAgrupamento = AGRUPAMENTOS.find((a) => a.chave === agrupar)?.rotulo ?? 'Status'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {erro ? (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          <span className="flex-1">{erro}</span>
          <button type="button" onClick={() => setErro(null)}>fechar</button>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 sm:px-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" aria-label="Agrupar por">
              <Layers className="size-3.5" />
              <span className="text-muted-foreground">Agrupar por</span>
              <strong className="font-semibold">{rotuloAgrupamento}</strong>
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Colunas do quadro</DropdownMenuLabel>
            {AGRUPAMENTOS.map((a) => (
              <DropdownMenuCheckboxItem
                key={a.chave}
                checked={agrupar === a.chave}
                onCheckedChange={() => guardar({ agrupar: a.chave, vazias: mostrarVazias })}
              >
                {a.rotulo}
              </DropdownMenuCheckboxItem>
            ))}
            {agrupar === 'responsavel' ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={mostrarVazias}
                  onCheckedChange={(v) => guardar({ agrupar, vazias: Boolean(v) })}
                >
                  Mostrar pessoas sem tarefa
                </DropdownMenuCheckboxItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-xs text-muted-foreground tabular">
          {totalRaiz} tarefa{totalRaiz === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-3 py-4 sm:px-6">
        {visiveis.map((coluna) => {
          const aceita = coluna.aoSoltar !== null
          const destacada = aceita && sobre === coluna.id && arrastando !== null
          return (
            <section
              key={coluna.id}
              className={cn(
                'flex max-h-full w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30 transition-colors',
                destacada && 'border-ring bg-accent/60',
                !aceita && arrastando !== null && 'opacity-60',
              )}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = aceita ? 'move' : 'none'
                if (aceita && sobre !== coluna.id) setSobre(coluna.id)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                void soltar(coluna, null)
              }}
            >
              <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
                <div className="min-w-0 flex-1">
                  {coluna.titulo}
                  {coluna.subtitulo ? <p className="mt-0.5 text-[11px] text-muted-foreground">{coluna.subtitulo}</p> : null}
                </div>
                <span className="text-xs text-muted-foreground tabular">{coluna.cards.length}</span>
              </header>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {coluna.cards.map((t) => (
                  <Card
                    key={t.id}
                    tarefa={t}
                    campos={campos}
                    mostrarStatus={agrupar !== 'status'}
                    arrastando={arrastando === t.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id)
                      e.dataTransfer.effectAllowed = 'move'
                      origemRef.current = coluna.id
                      setArrastando(t.id)
                    }}
                    onDragEnd={() => {
                      setArrastando(null)
                      setSobre(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void soltar(coluna, t.id)
                    }}
                  />
                ))}
                {coluna.cards.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    {aceita ? 'Arraste tarefas para cá' : 'Nada por aqui'}
                  </p>
                ) : null}
              </div>

              {coluna.nova ? (
                <NovoCard
                  listaId={lista.id}
                  valores={coluna.nova}
                  onCriada={(t) => {
                    setItens((atual) => [...atual, t])
                    emitir({ tipo: 'criada', tarefa: t })
                  }}
                />
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Colunas por agrupamento
// ---------------------------------------------------------------------------

function ordenar(cards: Tarefa[]): Tarefa[] {
  return cards.sort((a, b) => a.posicao - b.posicao || a.created_at.localeCompare(b.created_at))
}

function montarColunas(
  agrupar: Agrupamento,
  itens: Tarefa[],
  statuses: Status[],
  emailsDoTime: string[],
  nomeDe: (email: string) => string,
  hoje: string,
): Coluna[] {
  const raiz = itens.filter((t) => !t.pai_id)

  switch (agrupar) {
    case 'status':
      return statuses.map((s) => ({
        id: s.id,
        titulo: <StatusPill nome={s.nome} cor={s.cor} tamanho="md" />,
        cards: ordenar(raiz.filter((t) => t.status_id === s.id)),
        aoSoltar: (t) => (t.status_id === s.id ? {} : { status_id: s.id }),
        nova: { status_id: s.id },
      }))

    case 'prioridade': {
      const niveis: (Prioridade | null)[] = [...PRIORIDADES_ORDEM, null]
      return niveis.map((p) => ({
        id: p ?? 'sem',
        titulo: (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold">
            <PrioridadeFlag prioridade={p} />
            {p ? PRIORIDADES[p].rotulo : 'Sem prioridade'}
          </span>
        ),
        cards: ordenar(raiz.filter((t) => (t.prioridade ?? null) === p)),
        aoSoltar: (t) => ((t.prioridade ?? null) === p ? {} : { prioridade: p }),
        nova: { prioridade: p },
      }))
    }

    case 'vencimento': {
      const faixas = faixasDeVencimento(hoje)
      return faixas.map((f) => {
        const solta = f.data !== undefined
        return {
          id: f.id,
          titulo: (
            <span className={cn('text-[13px] font-semibold', f.id === 'atrasadas' && 'text-negative')}>{f.rotulo}</span>
          ),
          subtitulo:
            f.data && (f.id === 'semana' || f.id === 'proxima' || f.id === 'depois')
              ? `Soltar aqui marca ${formatarDataCurta(f.data, hoje)}`
              : f.id === 'semana' && !solta
                ? 'A semana termina amanhã'
                : undefined,
          cards: ordenar(raiz.filter((t) => faixaDe(t, hoje) === f.id)),
          aoSoltar: solta ? (t) => (faixaDe(t, hoje) === f.id ? {} : { data_vencimento: f.data ?? null }) : null,
          nova: solta ? { data_vencimento: f.data ?? null } : null,
          ocultavel: f.id === 'concluidas',
        }
      })
    }

    case 'responsavel': {
      const semResponsavel: Coluna = {
        id: 'sem',
        titulo: (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
            <Users className="size-4" />
            Sem responsável
          </span>
        ),
        cards: ordenar(raiz.filter((t) => t.responsaveis.length === 0)),
        aoSoltar: (t) => (t.responsaveis.length === 0 ? {} : { responsaveis: [] }),
        nova: { responsaveis: [] },
      }

      // O time inteiro, mais quem aparece atribuído e já saiu do time.
      const emails = new Set(emailsDoTime)
      for (const t of raiz) for (const e of t.responsaveis) emails.add(e)

      const porPessoa: Coluna[] = [...emails].map((email) => ({
        id: email,
        titulo: (
          <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold">
            <Avatar email={email} tamanho="sm" />
            <span className="truncate">{nomeDe(email)}</span>
          </span>
        ),
        cards: ordenar(raiz.filter((t) => t.responsaveis.includes(email))),
        aoSoltar: (t, origem) => {
          if (t.responsaveis.includes(email)) return {}
          // Veio da coluna de outra pessoa: ela sai, esta entra.
          const restantes = origem && origem !== 'sem' ? t.responsaveis.filter((e) => e !== origem) : t.responsaveis
          return { responsaveis: [...restantes, email] }
        },
        nova: { responsaveis: [email] },
        ocultavel: true,
      }))
      porPessoa.sort(
        (a, b) =>
          Number(b.cards.length > 0) - Number(a.cards.length > 0) ||
          nomeDe(a.id).localeCompare(nomeDe(b.id), 'pt-BR'),
      )
      return [semResponsavel, ...porPessoa]
    }
  }
}

type FaixaId = 'atrasadas' | 'hoje' | 'amanha' | 'semana' | 'proxima' | 'depois' | 'sem' | 'concluidas'

/** Semana de segunda a domingo. `data` é o dia que soltar na faixa marca; undefined = não aceita. */
function faixasDeVencimento(hoje: string): { id: FaixaId; rotulo: string; data: string | null | undefined }[] {
  const fimSemana = somarDias(hoje, (7 - diaDaSemana(hoje)) % 7)
  const inicioFaixaSemana = somarDias(hoje, 2)
  // "Esta semana": de depois de amanhã até domingo; soltar marca o último dia útil da faixa.
  let semana: string | undefined
  if (inicioFaixaSemana <= fimSemana) {
    semana = fimSemana
    for (let d = fimSemana; d >= inicioFaixaSemana; d = somarDias(d, -1)) {
      const w = diaDaSemana(d)
      if (w >= 1 && w <= 5) {
        semana = d
        break
      }
    }
  }
  return [
    { id: 'atrasadas', rotulo: 'Atrasadas', data: undefined },
    { id: 'hoje', rotulo: 'Hoje', data: hoje },
    { id: 'amanha', rotulo: 'Amanhã', data: somarDias(hoje, 1) },
    { id: 'semana', rotulo: 'Esta semana', data: semana },
    { id: 'proxima', rotulo: 'Próxima semana', data: somarDias(fimSemana, 1) },
    { id: 'depois', rotulo: 'Mais tarde', data: somarDias(fimSemana, 8) },
    { id: 'sem', rotulo: 'Sem data', data: null },
    { id: 'concluidas', rotulo: 'Concluídas (data passada)', data: undefined },
  ]
}

function faixaDe(t: Tarefa, hoje: string): FaixaId {
  const v = t.data_vencimento
  if (!v) return 'sem'
  if (v < hoje) return statusEncerra(t.status_tipo) ? 'concluidas' : 'atrasadas'
  if (v === hoje) return 'hoje'
  if (v === somarDias(hoje, 1)) return 'amanha'
  const fimSemana = somarDias(hoje, (7 - diaDaSemana(hoje)) % 7)
  if (v <= fimSemana) return 'semana'
  if (v <= somarDias(fimSemana, 7)) return 'proxima'
  return 'depois'
}

// ---------------------------------------------------------------------------
//  Card
// ---------------------------------------------------------------------------

function Card({
  tarefa,
  campos,
  mostrarStatus,
  arrastando,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  tarefa: Tarefa
  campos: ListaContexto['campos']
  mostrarStatus: boolean
  arrastando: boolean
  onDragStart: React.DragEventHandler<HTMLDivElement>
  onDragEnd: () => void
  onDrop: React.DragEventHandler<HTMLDivElement>
}) {
  const { abrirTarefa, prefetchTarefa } = useTasks()
  const concluida = statusEncerra(tarefa.status_tipo)

  return (
    <div
      onMouseEnter={() => prefetchTarefa(tarefa.id)}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={onDrop}
      onClick={() => abrirTarefa(tarefa.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          abrirTarefa(tarefa.id)
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'cursor-grab rounded-lg border border-border bg-card p-3 text-left shadow-xs transition-all hover:border-input hover:shadow-md active:cursor-grabbing',
        'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
        arrastando && 'opacity-40',
      )}
    >
      <p className={cn('text-[13px] leading-snug font-medium', concluida && 'text-muted-foreground line-through')}>
        {tarefa.titulo}
      </p>
      {tarefa.etiquetas.length > 0 ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{tarefa.etiquetas.map((e) => `#${e}`).join(' ')}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {mostrarStatus ? <StatusPill nome={tarefa.status_nome} cor={tarefa.status_cor} tamanho="xs" /> : null}
        <PrioridadeFlag prioridade={tarefa.prioridade} />
        <DataChip iso={tarefa.data_vencimento} concluida={concluida} />
        {tarefa.reuniao_url ? (
          <a
            href={tarefa.reuniao_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            className="inline-flex h-[18px] items-center gap-1 rounded-[4px] bg-positive/15 px-1.5 text-[10.5px] font-semibold text-positive hover:bg-positive/25"
            title="Entrar na reunião"
          >
            <Video className="size-3" />
            Entrar
          </a>
        ) : null}
        <Indicadores tarefa={tarefa} className="inline-flex" />
        <span className="ml-auto">
          <Avatares emails={tarefa.responsaveis} tamanho="xs" />
        </span>
      </div>
      <div className="mt-1.5 empty:hidden">
        <ChipsDeCampos campos={campos} valores={tarefa.campos} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Criação rápida no pé da coluna
// ---------------------------------------------------------------------------

function NovoCard({
  listaId,
  valores,
  onCriada,
}: {
  listaId: string
  valores: NovaTarefaValores
  onCriada: (t: Tarefa) => void
}) {
  const { executar, pendente } = useAcao()
  const [editando, setEditando] = React.useState(false)
  const [titulo, setTitulo] = React.useState('')

  async function criar() {
    const t = titulo.trim()
    if (!t) return setEditando(false)
    const nova = await executar(() => criarTarefa({ lista_id: listaId, titulo: t, ...valores }))
    if (nova) {
      onCriada(nova)
      setTitulo('')
    }
  }

  return (
    <div className="shrink-0 p-2 pt-0">
      {editando ? (
        <textarea
          autoFocus
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={criar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void criar()
            }
            if (e.key === 'Escape') {
              setTitulo('')
              setEditando(false)
            }
          }}
          disabled={pendente}
          rows={2}
          placeholder="Nome da tarefa — Enter para criar"
          className="w-full resize-none rounded-lg border border-input bg-card p-2 text-[13px] outline-none focus-visible:border-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Adicionar tarefa
        </button>
      )}
    </div>
  )
}
