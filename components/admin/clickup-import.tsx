'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Loader2, Plug, Square, XCircle } from 'lucide-react'

import {
  clickupConectar,
  clickupFinalizarLista,
  clickupImportarComentarios,
  clickupImportarPagina,
  type RespostaClickup,
} from '@/app/admin/clickup/actions'
import { Field } from '@/components/admin/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AlvoLista, ArvoreClickup } from '@/lib/clickup/importar'
import { cn } from '@/lib/utils'

/**
 * Tela de importação. O navegador comanda o passo a passo — uma página
 * de uma lista por chamada — e mostra o progresso. Se o ClickUp pedir
 * para esperar (limite de 100 pedidos por minuto), espera e continua.
 */

type Fase = 'config' | 'rodando' | 'fim'

interface Contadores {
  listas: number
  listasTotal: number
  tarefas: number
  ignoradas: number
  subtarefas: number
  comentarios: number
}

const CONTADORES_ZERADOS: Contadores = { listas: 0, listasTotal: 0, tarefas: 0, ignoradas: 0, subtarefas: 0, comentarios: 0 }

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function ClickupImport() {
  const [token, setToken] = React.useState('')
  const [conectando, setConectando] = React.useState(false)
  const [arvore, setArvore] = React.useState<ArvoreClickup | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)

  const [selecionadas, setSelecionadas] = React.useState<Set<string>>(new Set())
  const [desde, setDesde] = React.useState('2026-01-01')
  const [incluirFechadas, setIncluirFechadas] = React.useState(true)
  const [comComentarios, setComComentarios] = React.useState(false)

  const [fase, setFase] = React.useState<Fase>('config')
  const [etapa, setEtapa] = React.useState('')
  const [log, setLog] = React.useState<string[]>([])
  const [contadores, setContadores] = React.useState<Contadores>(CONTADORES_ZERADOS)
  const cancelar = React.useRef(false)
  const logRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log])

  function registrar(linha: string) {
    setLog((atual) => [...atual.slice(-199), linha])
  }

  const alvos = React.useMemo(() => (arvore ? listarAlvos(arvore) : []), [arvore])

  async function conectar(e: React.FormEvent) {
    e.preventDefault()
    setConectando(true)
    setErro(null)
    const r = await clickupConectar(token)
    setConectando(false)
    if (!r.ok) return setErro(r.message)
    setArvore(r.data)
    setSelecionadas(new Set(listarAlvos(r.data).map((a) => a.lista.id)))
  }

  /** Chama uma action; se o ClickUp pediu para esperar, espera e repete. */
  async function comEspera<T>(rotulo: string, fn: () => Promise<RespostaClickup<T>>): Promise<T> {
    for (let tentativa = 0; tentativa < 12; tentativa++) {
      const r = await fn()
      if (r.ok) return r.data
      if (r.aguardar && !cancelar.current) {
        registrar(`Limite do ClickUp atingido em ${rotulo}: aguardando ${r.aguardar}s…`)
        setEtapa(`Aguardando o ClickUp (${r.aguardar}s)…`)
        await dormir(r.aguardar * 1000)
        continue
      }
      throw new Error(r.message)
    }
    throw new Error(`O ClickUp continuou recusando ${rotulo}. Tente de novo mais tarde.`)
  }

  async function importar() {
    const escolhidos = alvos.filter((a) => selecionadas.has(a.lista.id))
    if (escolhidos.length === 0) return

    cancelar.current = false
    setFase('rodando')
    setErro(null)
    setLog([])
    const totais: Contadores = { ...CONTADORES_ZERADOS, listasTotal: escolhidos.length }
    setContadores({ ...totais })

    try {
      for (const alvo of escolhidos) {
        if (cancelar.current) break
        const caminho = [alvo.espaco.nome, alvo.pasta?.nome, alvo.lista.nome].filter(Boolean).join(' / ')
        setEtapa(`Importando ${caminho}…`)

        let pagina = 0
        let listaHubId: string | null = null
        let daLista = 0
        for (;;) {
          if (cancelar.current) break
          const r = await comEspera(caminho, () =>
            clickupImportarPagina({ token, alvo, pagina, desde, incluirFechadas }),
          )
          daLista += r.importadas
          totais.tarefas += r.importadas
          totais.ignoradas += r.ignoradas
          listaHubId = r.listaHubId ?? listaHubId
          setContadores({ ...totais })
          if (r.ultimaPagina) break
          pagina++
        }

        if (listaHubId) {
          const fim = await comEspera(caminho, () => clickupFinalizarLista(listaHubId))
          totais.subtarefas += fim.subtarefas
        }
        totais.listas++
        setContadores({ ...totais })
        registrar(
          daLista > 0
            ? `${caminho}: ${daLista} tarefa(s)`
            : `${caminho}: nada a partir de ${desde.split('-').reverse().join('/')} — pulada`,
        )
      }

      if (comComentarios && !cancelar.current) {
        setEtapa('Importando comentários…')
        for (;;) {
          if (cancelar.current) break
          const r = await comEspera('comentários', () => clickupImportarComentarios({ token, lote: 15 }))
          totais.comentarios += r.comentarios
          setContadores({ ...totais })
          setEtapa(`Importando comentários… faltam ${r.restantes} tarefa(s)`)
          if (r.restantes === 0 || r.processadas === 0) break
        }
      }

      registrar(cancelar.current ? 'Importação interrompida. O que já veio está salvo.' : 'Importação concluída.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha inesperada.'
      setErro(msg)
      registrar(`Erro: ${msg}`)
    } finally {
      setEtapa('')
      setFase('fim')
    }
  }

  const selecionadasTotal = alvos.filter((a) => selecionadas.has(a.lista.id)).length

  return (
    <div className="space-y-5">
      {/* 1. Token */}
      <form onSubmit={conectar} className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Plug className="size-4" />
          1. Conectar ao ClickUp
        </h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field
            label="Token pessoal da API"
            htmlFor="clickup-token"
            hint="No ClickUp: seu avatar (canto inferior esquerdo) → Settings → Apps → API Token → Generate. O token começa com pk_ e é usado só durante a importação: o Hub não o guarda."
          >
            <Input
              id="clickup-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="pk_..."
              autoComplete="off"
              disabled={fase === 'rodando'}
            />
          </Field>
          <div className="flex items-start pt-6">
            <Button type="submit" disabled={conectando || token.trim().length < 10 || fase === 'rodando'}>
              {conectando ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
              {arvore ? 'Reconectar' : 'Conectar'}
            </Button>
          </div>
        </div>
      </form>

      {/* 2. O que importar */}
      {arvore ? (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Download className="size-4" />
            2. O que importar de “{arvore.workspace.nome}”
          </h3>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Tarefas criadas a partir de"
              htmlFor="clickup-desde"
              hint="Tarefas criadas antes deste dia são ignoradas, mesmo que ainda estejam abertas."
            >
              <Input
                id="clickup-desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                disabled={fase === 'rodando'}
              />
            </Field>
            <label className="flex items-start gap-2 pt-6 text-sm">
              <input
                type="checkbox"
                checked={incluirFechadas}
                onChange={(e) => setIncluirFechadas(e.target.checked)}
                className="mt-0.5 size-3.5 accent-current"
                disabled={fase === 'rodando'}
              />
              <span>
                Incluir tarefas concluídas
                <span className="block text-[11px] text-muted-foreground">Desmarque para trazer só o que está em aberto.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 pt-6 text-sm">
              <input
                type="checkbox"
                checked={comComentarios}
                onChange={(e) => setComComentarios(e.target.checked)}
                className="mt-0.5 size-3.5 accent-current"
                disabled={fase === 'rodando'}
              />
              <span>
                Trazer os comentários
                <span className="block text-[11px] text-muted-foreground">
                  Um pedido por tarefa: cerca de 1 minuto a cada 100 tarefas. Dá para rodar depois.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className="text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setSelecionadas(new Set(alvos.map((a) => a.lista.id)))}
              disabled={fase === 'rodando'}
            >
              Selecionar tudo
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              className="text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setSelecionadas(new Set())}
              disabled={fase === 'rodando'}
            >
              Limpar
            </button>
            <span className="ml-auto text-muted-foreground tabular">
              {selecionadasTotal} de {alvos.length} lista(s)
            </span>
          </div>

          <ul className="divide-y divide-border rounded-lg border border-border">
            {arvore.espacos.map((espaco) => {
              const idsDoEspaco = [...espaco.listas, ...espaco.pastas.flatMap((p) => p.listas)].map((l) => l.id)
              const marcadas = idsDoEspaco.filter((id) => selecionadas.has(id)).length
              return (
                <li key={espaco.id} className="p-2">
                  <label className="flex items-center gap-2 px-1 py-1 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={idsDoEspaco.length > 0 && marcadas === idsDoEspaco.length}
                      ref={(el) => {
                        if (el) el.indeterminate = marcadas > 0 && marcadas < idsDoEspaco.length
                      }}
                      onChange={(e) => alternarVarios(idsDoEspaco, e.target.checked)}
                      className="size-3.5 accent-current"
                      disabled={fase === 'rodando' || idsDoEspaco.length === 0}
                    />
                    {espaco.nome}
                    {espaco.privado ? <span className="text-[11px] font-normal text-muted-foreground">privado</span> : null}
                    {idsDoEspaco.length === 0 ? (
                      <span className="text-[11px] font-normal text-muted-foreground">sem listas</span>
                    ) : null}
                  </label>
                  {espaco.pastas.map((pasta) => (
                    <div key={pasta.id} className="ml-5">
                      <p className="px-1 pt-1 text-xs font-medium text-muted-foreground">{pasta.nome}</p>
                      <ul className="ml-3">
                        {pasta.listas.map((l) => (
                          <ItemLista key={l.id} lista={l} marcada={selecionadas.has(l.id)} onChange={(v) => alternarVarios([l.id], v)} travado={fase === 'rodando'} />
                        ))}
                      </ul>
                    </div>
                  ))}
                  {espaco.listas.length > 0 ? (
                    <ul className="ml-8">
                      {espaco.listas.map((l) => (
                        <ItemLista key={l.id} lista={l} marcada={selecionadas.has(l.id)} onChange={(v) => alternarVarios([l.id], v)} travado={fase === 'rodando'} />
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>

          <p className="text-[11px] text-muted-foreground">
            As contagens são do ClickUp e incluem tarefas de todas as datas; o corte por data é aplicado na importação.
            Anexos não são trazidos.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {fase === 'rodando' ? (
              <Button type="button" variant="outline" onClick={() => { cancelar.current = true; registrar('Parando após o passo atual…') }}>
                <Square className="size-4" />
                Parar
              </Button>
            ) : (
              <Button type="button" onClick={importar} disabled={selecionadasTotal === 0 || !desde}>
                <Download className="size-4" />
                Importar {selecionadasTotal} lista(s)
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {/* 3. Progresso */}
      {fase !== 'config' ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            {fase === 'rodando' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : erro ? (
              <XCircle className="size-4 text-destructive" />
            ) : (
              <CheckCircle2 className="size-4 text-positive" />
            )}
            {fase === 'rodando' ? etapa || 'Importando…' : erro ? 'A importação parou' : 'Importação concluída'}
          </h3>

          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <Contador rotulo="Listas" valor={`${contadores.listas}/${contadores.listasTotal}`} />
            <Contador rotulo="Tarefas" valor={contadores.tarefas} />
            <Contador rotulo="Ignoradas pela data" valor={contadores.ignoradas} />
            <Contador rotulo="Subtarefas ligadas" valor={contadores.subtarefas} />
            <Contador rotulo="Comentários" valor={contadores.comentarios} />
          </dl>

          <div ref={logRef} className="max-h-56 overflow-y-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
            {log.length === 0 ? <p className="text-muted-foreground">Começando…</p> : log.map((l, i) => <p key={i}>{l}</p>)}
          </div>

          {erro ? (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {erro} O que já foi importado está salvo; rodar de novo continua de onde parou.
            </p>
          ) : null}

          {fase === 'fim' ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/tasks">
                  <ExternalLink className="size-4" />
                  Abrir o Tasks
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setFase('config')}>
                Importar de novo
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  function alternarVarios(ids: string[], marcar: boolean) {
    setSelecionadas((atual) => {
      const novo = new Set(atual)
      for (const id of ids) {
        if (marcar) novo.add(id)
        else novo.delete(id)
      }
      return novo
    })
  }
}

function ItemLista({
  lista,
  marcada,
  onChange,
  travado,
}: {
  lista: { id: string; nome: string; tarefas: number | null }
  marcada: boolean
  onChange: (v: boolean) => void
  travado: boolean
}) {
  return (
    <li>
      <label className={cn('flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent/40', !marcada && 'text-muted-foreground')}>
        <input type="checkbox" checked={marcada} onChange={(e) => onChange(e.target.checked)} className="size-3.5 accent-current" disabled={travado} />
        <span className="min-w-0 flex-1 truncate">{lista.nome}</span>
        {lista.tarefas !== null ? <span className="text-[11px] text-muted-foreground tabular">{lista.tarefas}</span> : null}
      </label>
    </li>
  )
}

function Contador({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5">
      <dt className="text-[11px] text-muted-foreground">{rotulo}</dt>
      <dd className="font-semibold tabular">{valor}</dd>
    </div>
  )
}

/** Toda lista da árvore, na ordem da tela, com o caminho completo. */
function listarAlvos(arvore: ArvoreClickup): AlvoLista[] {
  const alvos: AlvoLista[] = []
  for (const espaco of arvore.espacos) {
    const e = { id: espaco.id, nome: espaco.nome, privado: espaco.privado }
    for (const pasta of espaco.pastas) {
      for (const lista of pasta.listas) {
        alvos.push({ espaco: e, pasta: { id: pasta.id, nome: pasta.nome }, lista: { id: lista.id, nome: lista.nome } })
      }
    }
    for (const lista of espaco.listas) {
      alvos.push({ espaco: e, pasta: null, lista: { id: lista.id, nome: lista.nome } })
    }
  }
  return alvos
}
