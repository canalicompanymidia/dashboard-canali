'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlarmClock, AtSign, Check, CheckCheck, Clock, Inbox, Loader2, MessageSquare, RotateCcw, Send, UserPlus } from 'lucide-react'

import { adiarAvisos, comentar, concluirTarefa, marcarAvisosLidos, marcarAvisosNaoLidos } from '@/app/tasks/actions'
import { Avatar, StatusPill, Vazio } from '@/components/tasks/pecas'
import { useTasks } from '@/components/tasks/provider'
import { Button } from '@/components/ui/button'
import type { AvisoDaCaixa } from '@/lib/tasks/data'
import { formatarDataCurta, formatarRelativo, hojeISO, somarDias } from '@/lib/tasks/datas'
import { statusEncerra, type Tarefa } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Caixa de Entrada, organizada por intenção:
 *   Para você   — atribuições, menções e comentários (pede ação);
 *   Atualizações — status e prazo das tarefas que você acompanha;
 *   Feito       — o que já foi lido.
 * Uma linha por TAREFA (não por evento), em blocos por dia, com ações
 * na própria linha.
 */

type Aba = 'voce' | 'atualizacoes' | 'feito'

const PARA_VOCE = new Set(['atribuida', 'mencao', 'comentario'])

interface Grupo {
  tarefa: Tarefa
  avisos: AvisoDaCaixa[]
  ultimo: string
}

function diaSP(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

function blocoDoDia(iso: string, hoje: string): string {
  const d = diaSP(iso)
  if (d === hoje) return 'Hoje'
  if (d === somarDias(hoje, -1)) return 'Ontem'
  if (d >= somarDias(hoje, -6)) return 'Esta semana'
  return 'Antes'
}

const BLOCOS = ['Hoje', 'Ontem', 'Esta semana', 'Antes']

export function CaixaView({
  avisos: avisosIniciais,
  tarefas,
  urgentes,
  agora,
}: {
  avisos: AvisoDaCaixa[]
  tarefas: Tarefa[]
  urgentes: Tarefa[]
  agora: string
}) {
  const [avisos, setAvisos] = React.useState(avisosIniciais)
  React.useEffect(() => setAvisos(avisosIniciais), [avisosIniciais])
  const [aba, setAba] = React.useState<Aba>('voce')
  const [erro, setErro] = React.useState<string | null>(null)
  const porId = React.useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas])
  const hoje = hojeISO()

  const visivel = (a: AvisoDaCaixa) => !a.adiada_ate || a.adiada_ate <= agora
  const daAba = (a: AvisoDaCaixa, alvo: Aba) =>
    alvo === 'feito' ? Boolean(a.lida_em) : !a.lida_em && visivel(a) && (alvo === 'voce' ? PARA_VOCE.has(a.tipo) : !PARA_VOCE.has(a.tipo))

  const grupos = React.useMemo(() => {
    const mapa = new Map<string, Grupo>()
    for (const a of avisos) {
      if (!daAba(a, aba)) continue
      const tarefa = porId.get(a.tarefa_id)
      if (!tarefa) continue
      const g = mapa.get(a.tarefa_id) ?? { tarefa, avisos: [], ultimo: a.created_at }
      g.avisos.push(a)
      if (a.created_at > g.ultimo) g.ultimo = a.created_at
      mapa.set(a.tarefa_id, g)
    }
    return [...mapa.values()].sort((x, y) => y.ultimo.localeCompare(x.ultimo))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avisos, aba, porId])

  const contagem = (alvo: Aba) => new Set(avisos.filter((a) => daAba(a, alvo)).map((a) => a.tarefa_id)).size

  // "Vence hoje / atrasadas": uma linha por dia, dispensável.
  const chaveUrgentes = `canali-caixa-urgentes-${hoje}`
  const [urgentesFechado, setUrgentesFechado] = React.useState(true)
  React.useEffect(() => {
    try {
      setUrgentesFechado(localStorage.getItem(chaveUrgentes) === '1')
    } catch {
      setUrgentesFechado(false)
    }
  }, [chaveUrgentes])

  async function aplicar(ids: string[], acao: 'lida' | 'naolida' | 'adiar') {
    setErro(null)
    const antes = avisos
    const agoraLocal = new Date().toISOString()
    const amanha = new Date(`${somarDias(hoje, 1)}T08:00:00-03:00`).toISOString()
    setAvisos((atual) =>
      atual.map((a) =>
        ids.includes(a.id)
          ? acao === 'lida'
            ? { ...a, lida_em: agoraLocal, adiada_ate: null }
            : acao === 'naolida'
              ? { ...a, lida_em: null }
              : { ...a, adiada_ate: amanha }
          : a,
      ),
    )
    const r = acao === 'lida' ? await marcarAvisosLidos(ids) : acao === 'naolida' ? await marcarAvisosNaoLidos(ids) : await adiarAvisos(ids)
    if (!r.ok) {
      setAvisos(antes)
      setErro(r.message)
    }
  }

  const todosDaAba = grupos.flatMap((g) => g.avisos.map((a) => a.id))

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="rotulo">Tasks · Caixa de entrada</p>
          <h1 className="mt-1.5 font-serif text-3xl leading-tight font-normal">Caixa de entrada</h1>
        </div>
        {aba !== 'feito' && todosDaAba.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => void aplicar(todosDaAba, 'lida')}>
            <CheckCheck className="size-3.5" />
            Marcar tudo como lido
          </Button>
        ) : null}
      </header>

      <div className="mt-4 flex gap-1 border-b border-border" role="tablist">
        {(
          [
            ['voce', 'Para você'],
            ['atualizacoes', 'Atualizações'],
            ['feito', 'Feito'],
          ] as [Aba, string][]
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            role="tab"
            aria-selected={aba === chave}
            onClick={() => setAba(chave)}
            className={cn(
              '-mb-px flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-medium',
              aba === chave ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {rotulo}
            {chave !== 'feito' && contagem(chave) > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground tabular">{contagem(chave)}</span>
            ) : null}
          </button>
        ))}
      </div>

      {erro ? <p className="mt-3 text-xs text-destructive">{erro}</p> : null}

      {aba === 'voce' && urgentes.length > 0 && !urgentesFechado ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <AlarmClock className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
          <p className="min-w-0 flex-1 text-sm">
            <strong>{urgentes.length}</strong> tarefa{urgentes.length === 1 ? '' : 's'} sua{urgentes.length === 1 ? '' : 's'} vence
            {urgentes.length === 1 ? '' : 'm'} hoje ou está{urgentes.length === 1 ? '' : 'ão'} atrasada{urgentes.length === 1 ? '' : 's'}.
          </p>
          <Link href="/tasks/minhas" className="text-sm font-medium underline-offset-2 hover:underline">
            Ver
          </Link>
          <button
            type="button"
            onClick={() => {
              setUrgentesFechado(true)
              try {
                localStorage.setItem(chaveUrgentes, '1')
              } catch {}
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Dispensar hoje
          </button>
        </div>
      ) : null}

      {grupos.length === 0 ? (
        <Vazio
          icone={Inbox}
          titulo={aba === 'feito' ? 'Nada lido ainda' : 'Tudo em dia'}
          texto={aba === 'voce' ? 'Atribuições, menções e comentários para você aparecem aqui.' : aba === 'atualizacoes' ? 'Mudanças de status e prazo nas suas tarefas aparecem aqui.' : 'O que você marcar como lido fica guardado aqui.'}
          className="mt-6"
        />
      ) : (
        BLOCOS.map((bloco) => {
          const doBloco = grupos.filter((g) => blocoDoDia(g.ultimo, hoje) === bloco)
          if (doBloco.length === 0) return null
          return (
            <section key={bloco} className="mt-5">
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{bloco}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {doBloco.map((g) => (
                  <LinhaGrupo
                    key={g.tarefa.id}
                    grupo={g}
                    aba={aba}
                    onAcao={(acao) => void aplicar(g.avisos.map((a) => a.id), acao)}
                    onErro={setErro}
                  />
                ))}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}

function iconeDo(tipo: string) {
  if (tipo === 'mencao') return AtSign
  if (tipo === 'comentario') return MessageSquare
  if (tipo === 'atribuida') return UserPlus
  return Clock
}

function LinhaGrupo({
  grupo,
  aba,
  onAcao,
  onErro,
}: {
  grupo: Grupo
  aba: Aba
  onAcao: (acao: 'lida' | 'naolida' | 'adiar') => void
  onErro: (m: string | null) => void
}) {
  const { abrirTarefa, nomeDe, emitir } = useTasks()
  const { tarefa, avisos } = grupo
  const [aberta, setAberta] = React.useState(false)
  const [respondendo, setRespondendo] = React.useState(false)
  const [resposta, setResposta] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)
  const [concluida, setConcluida] = React.useState(statusEncerra(tarefa.status_tipo))
  const principal = [...avisos].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const Icone = iconeDo(principal.tipo)

  function descrever(a: AvisoDaCaixa): React.ReactNode {
    const quem = a.autor ? nomeDe(a.autor) : 'Alguém'
    const d = a.detalhe as Record<string, string | null | boolean>
    switch (a.tipo) {
      case 'atribuida':
        return <>{quem} {d.criada ? 'criou esta tarefa para você' : 'atribuiu esta tarefa a você'}</>
      case 'mencao':
        return <>{quem} mencionou você: “{String(d.trecho ?? '')}”</>
      case 'comentario':
        return <>{quem} comentou: “{String(d.trecho ?? '')}”</>
      case 'status':
        return <>{quem} mudou o status para <strong>{String(d.para ?? '')}</strong></>
      case 'prazo':
        return d.para ? <>{quem} mudou o prazo para <strong>{formatarDataCurta(String(d.para))}</strong></> : <>{quem} removeu o prazo</>
      default:
        return <>{quem} mexeu na tarefa</>
    }
  }

  async function responder() {
    const t = resposta.trim()
    if (!t) return
    setEnviando(true)
    const r = await comentar({ tarefa_id: tarefa.id, texto: t, mencoes: principal.autor ? [principal.autor] : [] })
    setEnviando(false)
    if (!r.ok) return onErro(r.message)
    setResposta('')
    setRespondendo(false)
    onAcao('lida')
  }

  async function concluir() {
    setConcluida(true)
    const r = await concluirTarefa(tarefa.id)
    if (!r.ok) {
      setConcluida(false)
      return onErro(r.message)
    }
    emitir({ tipo: 'atualizada', tarefa: r.data.tarefa })
    onAcao('lida')
  }

  return (
    <li className="group px-4 py-3 hover:bg-accent/40">
      <div className="flex items-start gap-3">
        {principal.autor ? <Avatar email={principal.autor} tamanho="md" /> : <Icone className="mt-1 size-4 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => abrirTarefa(tarefa.id)} className="block max-w-full truncate text-left text-sm font-semibold hover:underline">
            <span className={cn(concluida && 'text-muted-foreground line-through')}>{tarefa.titulo}</span>
          </button>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <StatusPill nome={tarefa.status_nome} cor={tarefa.status_cor} tamanho="xs" />
            <span className="truncate">{tarefa.espaco_nome} › {tarefa.lista_nome}</span>
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
            <Icone className="mr-1 inline size-3.5 align-[-2px]" />
            {descrever(principal)}
          </p>
          {avisos.length > 1 ? (
            <button type="button" onClick={() => setAberta((v) => !v)} className="mt-1 text-xs font-medium text-primary hover:underline">
              {aberta ? 'Recolher' : `${avisos.length} novidades`}
            </button>
          ) : null}
          {aberta ? (
            <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
              {avisos.map((a) => (
                <li key={a.id} className="text-xs text-muted-foreground">
                  {descrever(a)} · {formatarRelativo(a.created_at)}
                </li>
              ))}
            </ul>
          ) : null}
          {respondendo ? (
            <div className="mt-2 flex items-start gap-2">
              <textarea
                autoFocus
                value={resposta}
                onChange={(e) => setResposta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void responder()
                  if (e.key === 'Escape') setRespondendo(false)
                }}
                rows={2}
                placeholder="Sua resposta… (Ctrl+Enter envia)"
                className="min-w-0 flex-1 resize-none rounded-lg border border-input bg-card p-2 text-[13px] outline-none focus-visible:border-ring"
              />
              <Button size="sm" onClick={() => void responder()} disabled={enviando || !resposta.trim()}>
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[11px] text-muted-foreground tabular">{formatarRelativo(grupo.ultimo)}</span>
          <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            {aba === 'feito' ? (
              <AcaoIcone rotulo="Voltar para a caixa" onClick={() => onAcao('naolida')} icone={RotateCcw} />
            ) : (
              <>
                <AcaoIcone rotulo="Marcar como lida" onClick={() => onAcao('lida')} icone={Check} />
                <AcaoIcone rotulo="Mais tarde (amanhã às 8h)" onClick={() => onAcao('adiar')} icone={AlarmClock} />
                <AcaoIcone rotulo="Responder" onClick={() => setRespondendo((v) => !v)} icone={MessageSquare} />
                {!concluida ? <AcaoIcone rotulo="Concluir tarefa" onClick={() => void concluir()} icone={CheckCheck} /> : null}
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

function AcaoIcone({ rotulo, onClick, icone: Icone }: { rotulo: string; onClick: () => void; icone: React.ComponentType<{ className?: string }> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={rotulo}
      aria-label={rotulo}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icone className="size-3.5" />
    </button>
  )
}
