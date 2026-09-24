'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { atualizarTarefa } from '@/app/tasks/actions'
import { StatusDot } from '@/components/tasks/pecas'
import { useTasks } from '@/components/tasks/provider'
import { useAcao } from '@/components/tasks/use-acao'
import { Button } from '@/components/ui/button'
import { DIAS_SEMANA_CURTOS, diaDaSemana, hojeISO, somarDias } from '@/lib/tasks/datas'
import { statusEncerra, type ListaContexto, type Tarefa } from '@/lib/tasks/types'
import { MONTH_NAMES, cn } from '@/lib/utils'

/**
 * Calendário mensal pelo vencimento. Arrastar uma tarefa para outro dia
 * muda a data; clicar abre o modal.
 */
export function ViewCalendario({ contexto, tarefas }: { contexto: ListaContexto; tarefas: Tarefa[] }) {
  void contexto
  const { abrirTarefa } = useTasks()
  const { executar, erro, setErro } = useAcao()
  const hoje = hojeISO()
  const [ano, setAno] = React.useState(Number(hoje.slice(0, 4)))
  const [mes, setMes] = React.useState(Number(hoje.slice(5, 7)))
  const [itens, setItens] = React.useState(tarefas)
  React.useEffect(() => setItens(tarefas), [tarefas])
  const [arrastando, setArrastando] = React.useState<string | null>(null)
  const [sobre, setSobre] = React.useState<string | null>(null)

  const primeiroDia = `${ano}-${String(mes).padStart(2, '0')}-01`
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const inicioGrade = somarDias(primeiroDia, -diaDaSemana(primeiroDia))
  const semanas = Math.ceil((diaDaSemana(primeiroDia) + diasNoMes) / 7)

  const porDia = React.useMemo(() => {
    const mapa = new Map<string, Tarefa[]>()
    for (const t of itens) {
      if (!t.data_vencimento) continue
      const lista = mapa.get(t.data_vencimento) ?? []
      lista.push(t)
      mapa.set(t.data_vencimento, lista)
    }
    return mapa
  }, [itens])

  const semData = itens.filter((t) => !t.data_vencimento && !statusEncerra(t.status_tipo)).length

  function navegar(delta: number) {
    const d = new Date(Date.UTC(ano, mes - 1 + delta, 1))
    setAno(d.getUTCFullYear())
    setMes(d.getUTCMonth() + 1)
  }

  async function soltar(dia: string) {
    const id = arrastando
    setArrastando(null)
    setSobre(null)
    if (!id) return
    const original = itens.find((t) => t.id === id)
    if (!original || original.data_vencimento === dia) return
    setItens((atual) => atual.map((t) => (t.id === id ? { ...t, data_vencimento: dia } : t)))
    const salvo = await executar(() => atualizarTarefa(id, { data_vencimento: dia }))
    if (!salvo) setItens((atual) => atual.map((t) => (t.id === id ? original : t)))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2 sm:px-6">
        <Button variant="outline" size="icon-sm" onClick={() => navegar(-1)} aria-label="Mês anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => navegar(1)} aria-label="Próximo mês">
          <ChevronRight className="size-4" />
        </Button>
        <h2 className="font-serif text-xl">
          {MONTH_NAMES[mes - 1]} {ano}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAno(Number(hoje.slice(0, 4)))
            setMes(Number(hoje.slice(5, 7)))
          }}
        >
          Hoje
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {semData > 0 ? `${semData} tarefa(s) sem vencimento não aparecem aqui` : 'Arraste uma tarefa para mudar o vencimento'}
        </span>
        {erro ? (
          <button type="button" onClick={() => setErro(null)} className="text-xs text-destructive">
            {erro}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-4 sm:px-6">
        <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-xl border border-border bg-card">
          {DIAS_SEMANA_CURTOS.map((d) => (
            <div key={d} className="border-b border-border px-2 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {d}
            </div>
          ))}
          {Array.from({ length: semanas * 7 }, (_, i) => {
            const dia = somarDias(inicioGrade, i)
            const doMes = dia.slice(0, 7) === primeiroDia.slice(0, 7)
            const ehHoje = dia === hoje
            const doDia = porDia.get(dia) ?? []
            const visiveis = doDia.slice(0, 4)
            return (
              <div
                key={dia}
                className={cn(
                  'min-h-[7.5rem] border-b border-r border-border p-1.5 transition-colors',
                  !doMes && 'bg-muted/30 text-muted-foreground',
                  sobre === dia && 'bg-accent',
                )}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (sobre !== dia) setSobre(dia)
                }}
                onDragLeave={() => setSobre((s) => (s === dia ? null : s))}
                onDrop={(e) => {
                  e.preventDefault()
                  void soltar(dia)
                }}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex size-6 items-center justify-center rounded-full text-xs tabular',
                      ehHoje && 'bg-primary font-semibold text-primary-foreground',
                    )}
                  >
                    {Number(dia.slice(8, 10))}
                  </span>
                  {doDia.length > 0 ? <span className="text-[10px] text-muted-foreground">{doDia.length}</span> : null}
                </div>
                <ul className="space-y-1">
                  {visiveis.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', t.id)
                          setArrastando(t.id)
                        }}
                        onDragEnd={() => {
                          setArrastando(null)
                          setSobre(null)
                        }}
                        onClick={() => abrirTarefa(t.id)}
                        className={cn(
                          'flex w-full items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1 text-left text-[11px] leading-tight hover:border-input',
                          statusEncerra(t.status_tipo) && 'text-muted-foreground line-through',
                          arrastando === t.id && 'opacity-40',
                        )}
                        title={t.titulo}
                      >
                        <StatusDot cor={t.status_cor} tipo={t.status_tipo} className="size-2.5 border" />
                        <span className="truncate">{t.titulo}</span>
                      </button>
                    </li>
                  ))}
                  {doDia.length > visiveis.length ? (
                    <li className="px-1 text-[10px] text-muted-foreground">+{doDia.length - visiveis.length} mais</li>
                  ) : null}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
