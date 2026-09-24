'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, Inbox } from 'lucide-react'

import { agruparPorStatus } from '@/components/tasks/home'
import { StatusPill, Vazio } from '@/components/tasks/pecas'
import { TaskRow } from '@/components/tasks/task-row'
import { hojeISO } from '@/lib/tasks/datas'
import { statusEncerra, type Tarefa } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

export type FiltroMinhas = 'pendentes' | 'hoje' | 'feitas' | 'todas'

const FILTROS: { chave: FiltroMinhas; rotulo: string }[] = [
  { chave: 'pendentes', rotulo: 'Pendentes' },
  { chave: 'hoje', rotulo: 'Hoje e atrasadas' },
  { chave: 'feitas', rotulo: 'Feitas' },
  { chave: 'todas', rotulo: 'Todas' },
]

/** "Minhas tarefas" em tela cheia: filtros e agrupamento por status. */
export function MinhasView({ tarefas, filtro }: { tarefas: Tarefa[]; filtro: FiltroMinhas }) {
  const hoje = hojeISO()
  const filtradas = tarefas.filter((t) => {
    const encerrada = statusEncerra(t.status_tipo)
    if (filtro === 'pendentes') return !encerrada
    if (filtro === 'feitas') return encerrada
    if (filtro === 'hoje') return !encerrada && Boolean(t.data_vencimento) && t.data_vencimento! <= hoje
    return true
  })
  const grupos = agruparPorStatus(filtradas)
  const [fechados, setFechados] = React.useState<Set<string>>(new Set())

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <Link
            key={f.chave}
            href={`/tasks/minhas?f=${f.chave}`}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filtro === f.chave ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-accent',
            )}
          >
            {f.rotulo}
          </Link>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground tabular">{filtradas.length} tarefa(s)</span>
      </div>

      {grupos.length === 0 ? (
        <Vazio icone={Inbox} titulo="Nada por aqui" texto="Nenhuma tarefa atribuída a você neste filtro." />
      ) : (
        grupos.map((g) => {
          const fechado = fechados.has(g.nome)
          return (
            <section key={g.nome} className="rounded-xl border border-border bg-card">
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
                className="flex h-10 w-full items-center gap-2 px-3"
                aria-expanded={!fechado}
              >
                <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', !fechado && 'rotate-90')} />
                <StatusPill nome={g.nome} cor={g.cor} tamanho="md" />
                <span className="text-xs text-muted-foreground tabular">{g.tarefas.length}</span>
              </button>
              {!fechado ? (
                <ul className="border-t border-border p-1.5">
                  {g.tarefas.map((t) => (
                    <li key={t.id}>
                      <TaskRow tarefa={t} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          )
        })
      )}
    </div>
  )
}
