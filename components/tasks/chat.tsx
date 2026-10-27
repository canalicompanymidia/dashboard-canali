'use client'

import * as React from 'react'
import { ArrowLeft, Bell, BellOff, Check, LogOut, MessageSquarePlus, MoreHorizontal, Pencil, SendHorizontal, UserPlus, Users } from 'lucide-react'

import {
  abrirConversa,
  carregarConversas,
  carregarMensagens,
  editarGrupo,
  enviarMensagem,
  marcarConversaLida,
  sairDoGrupo,
} from '@/app/tasks/chat/actions'
import { EVENTO_CHAT_LIDO } from '@/components/tasks/chat-contador'
import { tocarSomChat, useSomChat } from '@/components/tasks/chat-som'
import { Avatar } from '@/components/tasks/pecas'
import { useSinalChat } from '@/components/tasks/presenca'
import { useTasks } from '@/components/tasks/provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { ConversaResumo, MensagemChat } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/** Sem aviso em tempo real (canal fora), ainda confere de tempos em tempos. */
const INTERVALO_CONFERENCIA_MS = 15_000

const FUSO = 'America/Sao_Paulo'
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })
const fmtDia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO })
const fmtDiaLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: FUSO })
const fmtChaveDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO })

function chaveDia(iso: string): string {
  return fmtChaveDia.format(new Date(iso))
}

/** "14:32" se foi hoje, "12/10" se antes. */
function quando(iso: string): string {
  return chaveDia(iso) === chaveDia(new Date().toISOString()) ? fmtHora.format(new Date(iso)) : fmtDia.format(new Date(iso))
}

function rotuloDia(iso: string): string {
  const hoje = chaveDia(new Date().toISOString())
  const ontem = chaveDia(new Date(Date.now() - 86_400_000).toISOString())
  const dia = chaveDia(iso)
  if (dia === hoje) return 'Hoje'
  if (dia === ontem) return 'Ontem'
  return fmtDiaLongo.format(new Date(iso))
}

/** Links clicáveis dentro do texto, sem interpretar HTML. */
function comLinks(texto: string): React.ReactNode {
  const partes = texto.split(/(https?:\/\/[^\s]+)/g)
  return partes.map((parte, i) =>
    /^https?:\/\//.test(parte) ? (
      <a key={i} href={parte} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 break-all">
        {parte}
      </a>
    ) : (
      <React.Fragment key={i}>{parte}</React.Fragment>
    ),
  )
}

export function ChatView({
  conversasIniciais,
  abertaInicial,
  mensagensIniciais,
}: {
  conversasIniciais: ConversaResumo[]
  abertaInicial: string | null
  mensagensIniciais: { mensagens: MensagemChat[]; temMais: boolean } | null
}) {
  const { colab } = useTasks()
  const { sinalChat, avisarChat } = useSinalChat()
  const [conversas, setConversas] = React.useState(conversasIniciais)
  const [aberta, setAberta] = React.useState<string | null>(abertaInicial)
  const [nova, setNova] = React.useState(false)
  const [som, alternarSom] = useSomChat()
  // As mensagens que vieram do servidor valem só para a primeira abertura.
  const iniciais = React.useRef(mensagensIniciais)

  const recarregar = React.useCallback(async () => {
    const r = await carregarConversas()
    if (r.ok) setConversas(r.data)
  }, [])

  // Aviso de outra pessoa: atualiza a lista (a conversa aberta cuida de si).
  React.useEffect(() => {
    if (sinalChat) void recarregar()
  }, [sinalChat, recarregar])

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void recarregar()
    }, INTERVALO_CONFERENCIA_MS)
    return () => window.clearInterval(id)
  }, [recarregar])

  const abrir = React.useCallback((id: string | null) => {
    iniciais.current = null
    setAberta(id)
    // Só a URL muda: o link fica compartilhável sem pedir a tela ao servidor.
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('c', id)
    else url.searchParams.delete('c')
    window.history.replaceState(window.history.state, '', url)
  }, [])

  const conversa = conversas.find((c) => c.id === aberta) ?? null

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          'flex w-full min-w-0 flex-col border-r border-border md:w-80 md:shrink-0',
          aberta && 'hidden md:flex',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Conversas</span>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={alternarSom}
              aria-pressed={som}
              aria-label={som ? 'Desligar som das mensagens' : 'Ligar som das mensagens'}
              title={som ? 'Som ligado' : 'Som desligado'}
            >
              {som ? <Bell className="size-4" /> : <BellOff className="size-4 text-muted-foreground" />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setNova(true)}>
              <MessageSquarePlus className="size-4" />
              Nova
            </Button>
          </div>
        </div>
        <ListaConversas conversas={conversas} aberta={aberta} eu={colab.email} onAbrir={abrir} onNova={() => setNova(true)} />
      </aside>

      <section className={cn('min-w-0 flex-1 flex-col', aberta ? 'flex' : 'hidden md:flex')}>
        {conversa ? (
          <Conversa
            key={conversa.id}
            conversa={conversa}
            inicial={conversa.id === abertaInicial ? iniciais.current : null}
            sinal={sinalChat?.conversa === conversa.id ? sinalChat.marca : null}
            onVoltar={() => abrir(null)}
            onEnviada={() => {
              avisarChat(conversa.id)
              void recarregar()
            }}
            onMudou={recarregar}
            onSaiu={() => {
              abrir(null)
              void recarregar()
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {aberta ? 'Conversa não encontrada.' : 'Escolha uma conversa ou comece uma nova.'}
          </div>
        )}
      </section>

      <NovaConversa
        aberto={nova}
        onFechar={() => setNova(false)}
        onCriada={async (id) => {
          setNova(false)
          await recarregar()
          abrir(id)
        }}
      />
    </div>
  )
}

function tituloDe(conversa: ConversaResumo, eu: string, nomeDe: (e: string) => string): string {
  if (conversa.tipo === 'grupo') return conversa.nome ?? 'Grupo'
  const outro = conversa.membros.find((m) => m !== eu)
  return outro ? nomeDe(outro) : 'Só você'
}

function IconeConversa({ conversa, eu }: { conversa: ConversaResumo; eu: string }) {
  if (conversa.tipo === 'grupo') {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Users className="size-4" />
      </span>
    )
  }
  const outro = conversa.membros.find((m) => m !== eu) ?? eu
  return <Avatar email={outro} tamanho="lg" />
}

function ListaConversas({
  conversas,
  aberta,
  eu,
  onAbrir,
  onNova,
}: {
  conversas: ConversaResumo[]
  aberta: string | null
  eu: string
  onAbrir: (id: string) => void
  onNova: () => void
}) {
  const { nomeDe } = useTasks()

  if (conversas.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        Nenhuma conversa ainda.
        <Button size="sm" onClick={onNova}>
          Começar uma conversa
        </Button>
      </div>
    )
  }

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
      {conversas.map((c) => {
        const previa = c.previa
        const autor = previa ? (previa.autor === eu ? 'Você' : nomeDe(previa.autor).split(' ')[0]) : null
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onAbrir(c.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors',
                c.id === aberta ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              <IconeConversa conversa={c} eu={eu} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn('truncate text-sm', c.nao_lidas > 0 ? 'font-semibold' : 'font-medium')}>
                    {tituloDe(c, eu, nomeDe)}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular">{quando(c.ultima_em)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-xs', c.nao_lidas > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                    {previa ? `${c.tipo === 'grupo' || previa.autor === eu ? `${autor}: ` : ''}${previa.texto}` : 'Sem mensagens'}
                  </span>
                  {c.nao_lidas > 0 ? (
                    <span className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular">
                      {c.nao_lidas > 99 ? '99+' : c.nao_lidas}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Conversa({
  conversa,
  inicial,
  sinal,
  onVoltar,
  onEnviada,
  onMudou,
  onSaiu,
}: {
  conversa: ConversaResumo
  inicial: { mensagens: MensagemChat[]; temMais: boolean } | null
  sinal: string | null
  onVoltar: () => void
  onEnviada: () => void
  onMudou: () => void
  onSaiu: () => void
}) {
  const { colab, nomeDe } = useTasks()
  const eu = colab.email
  const [mensagens, setMensagens] = React.useState<MensagemChat[]>(inicial?.mensagens ?? [])
  const [temMais, setTemMais] = React.useState(inicial?.temMais ?? false)
  const [carregando, setCarregando] = React.useState(!inicial)
  const [erro, setErro] = React.useState<string | null>(null)
  const [editando, setEditando] = React.useState<'nome' | 'pessoas' | null>(null)
  const rolagem = React.useRef<HTMLDivElement>(null)
  const noFim = React.useRef(true)
  const ultimaRef = React.useRef<string | null>(null)
  ultimaRef.current = mensagens.filter((m) => !m.id.startsWith('tmp-')).at(-1)?.created_at ?? null

  const marcarLida = React.useCallback(() => {
    void marcarConversaLida(conversa.id).then(() => window.dispatchEvent(new Event(EVENTO_CHAT_LIDO)))
  }, [conversa.id])

  // Primeira carga (quando o servidor não mandou junto) e marca como lida.
  React.useEffect(() => {
    let ativo = true
    if (!inicial) {
      void carregarMensagens({ conversaId: conversa.id }).then((r) => {
        if (!ativo) return
        setCarregando(false)
        if (r.ok) {
          setMensagens(r.data.mensagens)
          setTemMais(r.data.temMais)
        } else setErro(r.message)
      })
    }
    marcarLida()
    return () => {
      ativo = false
    }
  }, [conversa.id, inicial, marcarLida])

  const buscarNovas = React.useCallback(async () => {
    const depois = ultimaRef.current
    const r = await carregarMensagens({ conversaId: conversa.id, ...(depois ? { depois } : {}) })
    if (!r.ok || r.data.mensagens.length === 0) return
    // A conversa aberta marca como lida na hora, então o contador não sobe:
    // o aviso sonoro sai daqui.
    if (r.data.mensagens.some((m) => m.autor !== colab.email)) tocarSomChat()
    setMensagens((atual) => {
      const ids = new Set(atual.map((m) => m.id))
      const novas = r.data.mensagens.filter((m) => !ids.has(m.id))
      return novas.length ? [...atual, ...novas] : atual
    })
    if (document.visibilityState === 'visible') marcarLida()
  }, [conversa.id, marcarLida, colab.email])

  React.useEffect(() => {
    if (sinal) void buscarNovas()
  }, [sinal, buscarNovas])

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void buscarNovas()
    }, INTERVALO_CONFERENCIA_MS)
    return () => window.clearInterval(id)
  }, [buscarNovas])

  // Desce para a última mensagem quando chega algo e a pessoa já estava no fim.
  React.useLayoutEffect(() => {
    const el = rolagem.current
    if (el && noFim.current) el.scrollTop = el.scrollHeight
  }, [mensagens])

  const carregarAnteriores = async () => {
    const el = rolagem.current
    const altura = el?.scrollHeight ?? 0
    const r = await carregarMensagens({ conversaId: conversa.id, antes: mensagens[0]?.created_at })
    if (!r.ok) return setErro(r.message)
    noFim.current = false
    setMensagens((atual) => [...r.data.mensagens, ...atual])
    setTemMais(r.data.temMais)
    // Mantém a posição de leitura depois de inserir acima.
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - altura
    })
  }

  const enviar = async (texto: string) => {
    setErro(null)
    const tmp: MensagemChat = { id: `tmp-${Date.now()}`, autor: eu, texto, created_at: new Date().toISOString() }
    noFim.current = true
    setMensagens((atual) => [...atual, tmp])
    const r = await enviarMensagem({ conversaId: conversa.id, texto })
    if (!r.ok) {
      setMensagens((atual) => atual.filter((m) => m.id !== tmp.id))
      setErro(r.message)
      return false
    }
    setMensagens((atual) => atual.map((m) => (m.id === tmp.id ? r.data : m)))
    onEnviada()
    return true
  }

  const titulo = tituloDe(conversa, eu, nomeDe)
  const outros = conversa.membros.filter((m) => m !== eu)

  return (
    <>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onVoltar} aria-label="Voltar às conversas">
          <ArrowLeft className="size-4" />
        </Button>
        <IconeConversa conversa={conversa} eu={eu} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{titulo}</h2>
          {conversa.tipo === 'grupo' ? (
            <p className="truncate text-xs text-muted-foreground">
              {conversa.membros.map((m) => (m === eu ? 'Você' : nomeDe(m).split(' ')[0])).join(', ')}
            </p>
          ) : null}
        </div>
        {conversa.tipo === 'grupo' ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Opções do grupo">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditando('nome')}>
                <Pencil className="size-4" />
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditando('pessoas')}>
                <UserPlus className="size-4" />
                Adicionar pessoas
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={async () => {
                  if (!window.confirm(`Sair do grupo "${titulo}"?`)) return
                  const r = await sairDoGrupo(conversa.id)
                  if (r.ok) onSaiu()
                  else setErro(r.message)
                }}
              >
                <LogOut className="size-4" />
                Sair do grupo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      <div
        ref={rolagem}
        onScroll={(e) => {
          const el = e.currentTarget
          noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
      >
        {temMais ? (
          <div className="mb-4 text-center">
            <Button variant="ghost" size="sm" onClick={carregarAnteriores}>
              Ver mensagens anteriores
            </Button>
          </div>
        ) : null}
        {carregando ? (
          <p className="text-center text-sm text-muted-foreground">Carregando…</p>
        ) : mensagens.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            {conversa.tipo === 'grupo' ? 'Nenhuma mensagem no grupo ainda.' : `Diga oi para ${nomeDe(outros[0] ?? eu).split(' ')[0]}.`}
          </p>
        ) : (
          <Mensagens mensagens={mensagens} eu={eu} grupo={conversa.tipo === 'grupo'} />
        )}
      </div>

      {erro ? <p className="px-4 pb-1 text-xs text-destructive">{erro}</p> : null}
      <Compositor onEnviar={enviar} />

      <EditarGrupo
        conversa={conversa}
        modo={editando}
        onFechar={() => setEditando(null)}
        onSalvo={() => {
          setEditando(null)
          onMudou()
        }}
      />
    </>
  )
}

function Mensagens({ mensagens, eu, grupo }: { mensagens: MensagemChat[]; eu: string; grupo: boolean }) {
  const { nomeDe } = useTasks()
  return (
    <ol className="space-y-0.5">
      {mensagens.map((m, i) => {
        const anterior = mensagens[i - 1]
        const novoDia = !anterior || chaveDia(anterior.created_at) !== chaveDia(m.created_at)
        // Mensagens seguidas da mesma pessoa, em até 5 min, ficam juntas.
        const juntaComAnterior =
          !novoDia && anterior?.autor === m.autor && Date.parse(m.created_at) - Date.parse(anterior.created_at) < 5 * 60_000
        const minha = m.autor === eu
        const enviando = m.id.startsWith('tmp-')
        return (
          <li key={m.id}>
            {novoDia ? (
              <p className="my-4 text-center text-[11px] font-medium text-muted-foreground first-letter:uppercase">
                {rotuloDia(m.created_at)}
              </p>
            ) : null}
            <div className={cn('flex gap-2', minha ? 'justify-end' : 'justify-start', !juntaComAnterior && 'mt-3')}>
              {!minha ? (
                <span className="w-7 shrink-0">{!juntaComAnterior ? <Avatar email={m.autor} tamanho="md" /> : null}</span>
              ) : null}
              <div className={cn('flex max-w-[80%] flex-col sm:max-w-[65%]', minha ? 'items-end' : 'items-start')}>
                {grupo && !minha && !juntaComAnterior ? (
                  <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">{nomeDe(m.autor)}</span>
                ) : null}
                <div
                  className={cn(
                    'rounded-2xl px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap',
                    minha ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                    enviando && 'opacity-60',
                  )}
                  title={fmtHora.format(new Date(m.created_at))}
                >
                  {comLinks(m.texto)}
                </div>
                {!mensagens[i + 1] || mensagens[i + 1].autor !== m.autor ? (
                  <span className="mt-0.5 px-1 text-[11px] text-muted-foreground tabular">
                    {enviando ? 'Enviando…' : fmtHora.format(new Date(m.created_at))}
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Compositor({ onEnviar }: { onEnviar: (texto: string) => Promise<boolean> }) {
  const [texto, setTexto] = React.useState('')
  const campo = React.useRef<HTMLTextAreaElement>(null)

  // Cresce com o texto até umas 6 linhas.
  React.useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [texto])

  const mandar = async () => {
    const limpo = texto.trim()
    if (!limpo) return
    setTexto('')
    const ok = await onEnviar(limpo)
    if (!ok) setTexto(limpo)
    campo.current?.focus()
  }

  return (
    <form
      className="flex items-end gap-2 border-t border-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void mandar()
      }}
    >
      <textarea
        ref={campo}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void mandar()
          }
        }}
        rows={1}
        maxLength={4000}
        placeholder="Escreva uma mensagem"
        aria-label="Mensagem"
        className="min-h-10 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
      />
      <Button type="submit" size="icon" disabled={!texto.trim()} aria-label="Enviar">
        <SendHorizontal className="size-4" />
      </Button>
    </form>
  )
}

/** Escolha de pessoas com busca, usada para criar e para adicionar ao grupo. */
function EscolherPessoas({
  escolhidas,
  onAlternar,
  excluir = [],
}: {
  escolhidas: ReadonlySet<string>
  onAlternar: (email: string) => void
  excluir?: string[]
}) {
  const { pessoas, colab } = useTasks()
  const [busca, setBusca] = React.useState('')
  const termo = busca.trim().toLowerCase()
  const lista = pessoas
    .filter((p) => p.email !== colab.email && !excluir.includes(p.email))
    .filter((p) => !termo || (p.nome ?? '').toLowerCase().includes(termo) || p.email.includes(termo))
    .sort((a, b) => (a.nome ?? a.email).localeCompare(b.nome ?? b.email, 'pt-BR'))

  return (
    <div className="space-y-2">
      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" aria-label="Buscar pessoa" autoFocus />
      <ul className="max-h-72 overflow-y-auto rounded-lg border border-border p-1">
        {lista.length === 0 ? <li className="p-3 text-center text-sm text-muted-foreground">Ninguém encontrado.</li> : null}
        {lista.map((p) => {
          const marcada = escolhidas.has(p.email)
          return (
            <li key={p.email}>
              <button
                type="button"
                onClick={() => onAlternar(p.email)}
                aria-pressed={marcada}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-accent/60"
              >
                <Avatar email={p.email} tamanho="md" />
                <span className="min-w-0 flex-1 truncate">{p.nome ?? p.email}</span>
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded border',
                    marcada ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                >
                  {marcada ? <Check className="size-3.5" /> : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function NovaConversa({
  aberto,
  onFechar,
  onCriada,
}: {
  aberto: boolean
  onFechar: () => void
  onCriada: (id: string) => void
}) {
  const [escolhidas, setEscolhidas] = React.useState<Set<string>>(new Set())
  const [nome, setNome] = React.useState('')
  const [erro, setErro] = React.useState<string | null>(null)
  const [enviando, setEnviando] = React.useState(false)

  React.useEffect(() => {
    if (aberto) {
      setEscolhidas(new Set())
      setNome('')
      setErro(null)
    }
  }, [aberto])

  const grupo = escolhidas.size > 1

  const criar = async () => {
    setEnviando(true)
    setErro(null)
    const r = await abrirConversa({ emails: [...escolhidas], nome: grupo ? nome : undefined })
    setEnviando(false)
    if (r.ok) onCriada(r.data.id)
    else setErro(r.message)
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>
        <EscolherPessoas
          escolhidas={escolhidas}
          onAlternar={(email) =>
            setEscolhidas((atual) => {
              const novo = new Set(atual)
              if (novo.has(email)) novo.delete(email)
              else novo.add(email)
              return novo
            })
          }
        />
        {grupo ? (
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do grupo" aria-label="Nome do grupo" maxLength={80} />
        ) : null}
        {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
        <Button onClick={criar} disabled={enviando || escolhidas.size === 0 || (grupo && !nome.trim())}>
          {grupo ? `Criar grupo com ${escolhidas.size} pessoas` : 'Abrir conversa'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function EditarGrupo({
  conversa,
  modo,
  onFechar,
  onSalvo,
}: {
  conversa: ConversaResumo
  modo: 'nome' | 'pessoas' | null
  onFechar: () => void
  onSalvo: () => void
}) {
  const [nome, setNome] = React.useState(conversa.nome ?? '')
  const [escolhidas, setEscolhidas] = React.useState<Set<string>>(new Set())
  const [erro, setErro] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (modo) {
      setNome(conversa.nome ?? '')
      setEscolhidas(new Set())
      setErro(null)
    }
  }, [modo, conversa.nome])

  const salvar = async () => {
    const r = await editarGrupo(
      modo === 'nome' ? { conversaId: conversa.id, nome } : { conversaId: conversa.id, adicionar: [...escolhidas] },
    )
    if (r.ok) onSalvo()
    else setErro(r.message)
  }

  return (
    <Dialog open={modo !== null} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === 'nome' ? 'Renomear grupo' : 'Adicionar pessoas'}</DialogTitle>
        </DialogHeader>
        {modo === 'nome' ? (
          <Input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do grupo" maxLength={80} autoFocus />
        ) : (
          <EscolherPessoas
            escolhidas={escolhidas}
            excluir={conversa.membros}
            onAlternar={(email) =>
              setEscolhidas((atual) => {
                const novo = new Set(atual)
                if (novo.has(email)) novo.delete(email)
                else novo.add(email)
                return novo
              })
            }
          />
        )}
        {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
        <Button onClick={salvar} disabled={modo === 'nome' ? !nome.trim() : escolhidas.size === 0}>
          Salvar
        </Button>
      </DialogContent>
    </Dialog>
  )
}
