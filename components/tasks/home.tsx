'use client'

import * as React from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Inbox, Plus, UserRound } from 'lucide-react'

import { NovaTarefaDialog } from '@/components/tasks/dialogs'
import { StatusPill, Vazio } from '@/components/tasks/pecas'
import { useTasks } from '@/components/tasks/provider'
import { TaskRow } from '@/components/tasks/task-row'
import { Button } from '@/components/ui/button'
import { grupoDePrazo, type GrupoPrazo } from '@/lib/tasks/agrupamento'
import { DIAS_SEMANA_CURTOS, diaDaSemana, formatarDataLonga, formatarRelativo, hojeISO, somarDias } from '@/lib/tasks/datas'
import { STATUS_TIPOS_ORDEM, statusEncerra, type Tarefa } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Os painéis da tela Início: Meu trabalho, Agenda, Atribuídas a mim e
 * Recentes — a mesma composição da Home do ClickUp.
 */

export function Painel({
  titulo,
  acoes,
  children,
  className,
}: {
  titulo: React.ReactNode
  acoes?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)}>
      <header className="flex min-h-11 items-center justify-between gap-2 border-b border-border px-4">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {acoes}
      </header>
      <div className="p-2">{children}</div>
    </section>
  )
}

export function BotaoNovaTarefa() {
  const [aberto, setAberto] = React.useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}>
        <Plus className="size-4" />
        Nova tarefa
      </Button>
      <NovaTarefaDialog aberto={aberto} onOpenChange={setAberto} />
    </>
  )
}

// ---------------------------------------------------------------------------
//  Meu trabalho
// ---------------------------------------------------------------------------

const GRUPOS: { chave: GrupoPrazo; rotulo: string; abertoPorPadrao: boolean }[] = [
  { chave: 'hoje', rotulo: 'Hoje', abertoPorPadrao: true },
  { chave: 'atrasadas', rotulo: 'Em atraso', abertoPorPadrao: true },
  { chave: 'proximas', rotulo: 'Próximo', abertoPorPadrao: false },
  { chave: 'sem_data', rotulo: 'Não programado', abertoPorPadrao: false },
]

type Aba = 'pendente' | 'feito' | 'delegado'

export function MeuTrabalho({ minhas, delegadas }: { minhas: Tarefa[]; delegadas: Tarefa[] }) {
  const [aba, setAba] = React.useState<Aba>('pendente')
  const hoje = hojeISO()

  const pendentes = minhas.filter((t) => !statusEncerra(t.status_tipo))
  const feitas = minhas
    .filter((t) => statusEncerra(t.status_tipo))
    .sort((a, b) => (b.concluida_em ?? '').localeCompare(a.concluida_em ?? ''))
    .slice(0, 40)
  const delegadasPendentes = delegadas.filter((t) => !statusEncerra(t.status_tipo))

  const fonte = aba === 'pendente' ? pendentes : aba === 'delegado' ? delegadasPendentes : []

  return (
    <Painel
      titulo="Meu trabalho"
      acoes={
        <div className="flex gap-1 text-[13px]" role="tablist">
          {(
            [
              ['pendente', 'Pendente', pendentes.length],
              ['feito', 'Feito', feitas.length],
              ['delegado', 'Delegado', delegadasPendentes.length],
            ] as [Aba, string, number][]
          ).map(([chave, rotulo, n]) => (
            <button
              key={chave}
              type="button"
              role="tab"
              aria-selected={aba === chave}
              onClick={() => setAba(chave)}
              className={cn(
                'flex h-11 items-center gap-1.5 border-b-2 px-2 font-medium transition-colors',
                aba === chave ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {rotulo}
              <span className="text-[11px] text-muted-foreground tabular">{n}</span>
            </button>
          ))}
        </div>
      }
    >
      {aba === 'feito' ? (
        feitas.length === 0 ? (
          <Vazio icone={Inbox} titulo="Nada concluído ainda" texto="As tarefas que você fechar aparecem aqui." className="border-0 bg-transparent py-8" />
        ) : (
          <ul>
            {feitas.map((t) => (
              <li key={t.id}>
                <TaskRow tarefa={t} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <GruposDePrazo tarefas={fonte} hoje={hoje} vazio={aba === 'pendente' ? 'Nenhuma tarefa atribuída a você.' : 'Você não delegou nenhuma tarefa em aberto.'} />
      )}
    </Painel>
  )
}

function GruposDePrazo({ tarefas, hoje, vazio }: { tarefas: Tarefa[]; hoje: string; vazio: string }) {
  const [fechados, setFechados] = React.useState<Set<GrupoPrazo>>(
    () => new Set(GRUPOS.filter((g) => !g.abertoPorPadrao).map((g) => g.chave)),
  )

  if (tarefas.length === 0) {
    return <Vazio icone={Inbox} titulo={vazio} className="border-0 bg-transparent py-8" />
  }

  return (
    <div className="space-y-1">
      {GRUPOS.map((g) => {
        const doGrupo = tarefas.filter((t) => grupoDePrazo(t, hoje) === g.chave)
        const fechado = fechados.has(g.chave)
        return (
          <div key={g.chave}>
            <button
              type="button"
              onClick={() =>
                setFechados((atual) => {
                  const novo = new Set(atual)
                  if (novo.has(g.chave)) novo.delete(g.chave)
                  else novo.add(g.chave)
                  return novo
                })
              }
              className="flex h-8 w-full items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium hover:bg-accent/60"
              aria-expanded={!fechado}
            >
              <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', !fechado && 'rotate-90')} />
              <span className={cn(g.chave === 'atrasadas' && doGrupo.length > 0 && 'text-negative')}>{g.rotulo}</span>
              <span className="text-[11px] text-muted-foreground tabular">{doGrupo.length}</span>
            </button>
            {!fechado && doGrupo.length > 0 ? (
              <ul className="ml-3 border-l border-border pl-1">
                {doGrupo.map((t) => (
                  <li key={t.id}>
                    <TaskRow tarefa={t} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Agenda
// ---------------------------------------------------------------------------

export function Agenda({ tarefas, inicio, fim }: { tarefas: Tarefa[]; inicio: string; fim: string }) {
  const hoje = hojeISO()
  const [dia, setDia] = React.useState(hoje)
  const doDia = tarefas.filter((t) => t.data_vencimento === dia)
  const { abrirTarefa } = useTasks()

  return (
    <Painel
      titulo="Agenda"
      acoes={
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setDia((d) => somarDias(d, -1))} disabled={dia <= inicio} aria-label="Dia anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setDia((d) => somarDias(d, 1))} disabled={dia >= fim} aria-label="Próximo dia">
            <ChevronRight className="size-4" />
          </Button>
          <button type="button" onClick={() => setDia(hoje)} className="ml-1 text-xs text-muted-foreground hover:text-foreground">
            Hoje
          </button>
        </div>
      }
    >
      <div className="flex items-baseline gap-2 px-2 pt-1 pb-2">
        <span className={cn('inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold tabular', dia === hoje && 'bg-primary text-primary-foreground')}>
          {Number(dia.slice(8, 10))}
        </span>
        <span className="text-sm">
          <span className="text-muted-foreground capitalize">{DIAS_SEMANA_CURTOS[diaDaSemana(dia)]}, </span>
          {formatarDataLonga(dia)}
        </span>
      </div>
      {doDia.length === 0 ? (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nada vence neste dia.</p>
      ) : (
        <ul className="space-y-1 px-1">
          <li className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">O dia todo</li>
          {doDia.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => abrirTarefa(t.id)}
                className="flex w-full items-center gap-2 rounded-md border-l-2 bg-accent/40 px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                style={{ borderLeftColor: t.status_cor }}
              >
                <span className={cn('min-w-0 flex-1 truncate', statusEncerra(t.status_tipo) && 'text-muted-foreground line-through')}>{t.titulo}</span>
                <span className="truncate text-[11px] text-muted-foreground">{t.lista_nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  )
}

// ---------------------------------------------------------------------------
//  Atribuídas a mim, por status
// ---------------------------------------------------------------------------

export function AtribuidasAMim({ minhas }: { minhas: Tarefa[] }) {
  const grupos = React.useMemo(() => agruparPorStatus(minhas), [minhas])
  const [fechados, setFechados] = React.useState<Set<string>>(
    () => new Set(grupos.filter((g) => statusEncerra(g.tipo)).map((g) => g.nome)),
  )

  return (
    <Painel titulo={<span className="flex items-center gap-1.5"><UserRound className="size-4" />Atribuídas a mim</span>}>
      {grupos.length === 0 ? (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nenhuma tarefa atribuída a você.</p>
      ) : (
        <div className="space-y-1">
          {grupos.map((g) => {
            const fechado = fechados.has(g.nome)
            return (
              <div key={g.nome}>
                <button
                  type="button"
                  onClick={() =>
                    setFechados((atual) => {
                      const novo = new Set(atual)
                      if (novo.has(g.nome)) novo.delete(g.nome)
                      else novo.add(g.nome)
                      return novo
                    })
                  }
                  className="flex h-8 w-full items-center gap-1.5 rounded-md px-1.5 hover:bg-accent/60"
                  aria-expanded={!fechado}
                >
                  <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', !fechado && 'rotate-90')} />
                  <StatusPill nome={g.nome} cor={g.cor} />
                  <span className="text-[11px] text-muted-foreground tabular">{g.tarefas.length}</span>
                </button>
                {!fechado ? (
                  <ul className="ml-3 border-l border-border pl-1">
                    {g.tarefas.map((t) => (
                      <li key={t.id}>
                        <TaskRow tarefa={t} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </Painel>
  )
}

/** Agrupa pelo NOME do status (listas diferentes repetem nomes), na ordem dos tipos. */
export function agruparPorStatus(tarefas: Tarefa[]) {
  const mapa = new Map<string, { nome: string; cor: string; tipo: Tarefa['status_tipo']; tarefas: Tarefa[] }>()
  for (const t of tarefas) {
    const chave = t.status_nome.toLowerCase()
    const g = mapa.get(chave) ?? { nome: t.status_nome, cor: t.status_cor, tipo: t.status_tipo, tarefas: [] }
    g.tarefas.push(t)
    mapa.set(chave, g)
  }
  return [...mapa.values()].sort(
    (a, b) => STATUS_TIPOS_ORDEM.indexOf(a.tipo) - STATUS_TIPOS_ORDEM.indexOf(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR'),
  )
}

// ---------------------------------------------------------------------------
//  Recentes
// ---------------------------------------------------------------------------

export function Recentes({ tarefas }: { tarefas: Tarefa[] }) {
  const { abrirTarefa } = useTasks()
  return (
    <Painel titulo={<span className="flex items-center gap-1.5"><Clock className="size-4" />Recentes</span>}>
      {tarefas.length === 0 ? (
        <Vazio icone={CalendarDays} titulo="Nenhuma tarefa ainda" texto="Crie a primeira com o botão “Nova tarefa”." className="border-0 bg-transparent py-8" />
      ) : (
        <ul>
          {tarefas.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => abrirTarefa(t.id)}
                className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] hover:bg-accent/60"
              >
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: t.status_cor }} />
                <span className={cn('min-w-0 flex-1 truncate', statusEncerra(t.status_tipo) && 'text-muted-foreground line-through')}>{t.titulo}</span>
                <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">em {t.lista_nome}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular">{formatarRelativo(t.updated_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  )
}
