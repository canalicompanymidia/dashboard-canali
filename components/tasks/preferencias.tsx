'use client'

import * as React from 'react'
import { CalendarCheck, CalendarPlus, Check, Copy, ExternalLink, Loader2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react'

import { obterPreferencias, renovarAgenda, salvarGoogleIcs } from '@/app/tasks/actions'
import { useAcao } from '@/components/tasks/use-acao'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PreferenciasTasks } from '@/lib/tasks/types'

/**
 * Preferências pessoais do Tasks:
 *   • a agenda assinável (.ics) das tarefas da pessoa, para o Google
 *     Calendar, a Apple ou o Outlook mostrarem os vencimentos;
 *   • o endereço iCal secreto do Google Calendar dela, para o Tasks
 *     mostrar as reuniões do dia no Início.
 */
export function PreferenciasView() {
  const [pref, setPref] = React.useState<PreferenciasTasks | null>(null)
  const [erroCarga, setErroCarga] = React.useState<string | null>(null)

  React.useEffect(() => {
    let ativo = true
    obterPreferencias().then((r) => {
      if (!ativo) return
      if (r.ok) setPref(r.data)
      else setErroCarga(r.message)
    })
    return () => {
      ativo = false
    }
  }, [])

  if (erroCarga) return <p className="mt-6 text-sm text-destructive">{erroCarga}</p>
  if (!pref) {
    return (
      <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Carregando…
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-5">
      <AgendaAssinavel pref={pref} setPref={setPref} />
      <GoogleCalendar pref={pref} setPref={setPref} />
    </div>
  )
}

function Cartao({
  icone: Icone,
  titulo,
  descricao,
  children,
}: {
  icone: React.ComponentType<{ className?: string }>
  titulo: string
  descricao: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent">
          <Icone className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
        </div>
      </header>
      <div className="space-y-4 px-5 py-4">{children}</div>
    </section>
  )
}

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = React.useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1800)
        } catch {
          // Sem clipboard: a pessoa seleciona e copia do campo.
        }
      }}
    >
      {copiado ? <Check className="size-3.5 text-positive" /> : <Copy className="size-3.5" />}
      {copiado ? 'Copiado' : 'Copiar'}
    </Button>
  )
}

// ---------------------------------------------------------------------------
//  Agenda assinável
// ---------------------------------------------------------------------------

function AgendaAssinavel({
  pref,
  setPref,
}: {
  pref: PreferenciasTasks
  setPref: (p: PreferenciasTasks) => void
}) {
  const { executar, pendente, erro, mensagem } = useAcao()
  const url = pref.agenda_url
  const webcal = url ? url.replace(/^https?:/, 'webcal:') : null
  const google = webcal ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(webcal)}` : null

  return (
    <Cartao
      icone={CalendarCheck}
      titulo="Suas tarefas no seu calendário"
      descricao="Um endereço secreto que o Google Calendar, a Apple ou o Outlook assinam. Cada tarefa sua com vencimento aparece como evento de dia inteiro, e some quando você a conclui (fica 30 dias como concluída)."
    >
      {url ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="agenda-url">Endereço da agenda (só seu)</Label>
            <div className="flex flex-wrap gap-2">
              <Input id="agenda-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" />
              <BotaoCopiar texto={url} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {google ? (
              <a href={google} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent">
                <CalendarPlus className="size-3.5" />
                Adicionar ao Google Calendar
                <ExternalLink className="size-3 opacity-60" />
              </a>
            ) : null}
            {webcal ? (
              <a href={webcal} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent">
                <CalendarPlus className="size-3.5" />
                Abrir na Apple / Outlook
              </a>
            ) : null}
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Como assinar manualmente</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Google Calendar (no computador): à esquerda, em “Outras agendas”, clique em + → “Por URL” e cole o endereço.</li>
              <li>Apple Calendar: Arquivo → Nova assinatura de calendário… e cole o endereço.</li>
              <li>Outlook: Adicionar calendário → Assinar da web e cole o endereço.</li>
            </ol>
            <p className="mt-2">Os programas de agenda atualizam a assinatura de tempos em tempos (o Google, a cada algumas horas). Não é instantâneo.</p>
          </details>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2">
            <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              Quem tiver este endereço vê os títulos e datas das suas tarefas. Se ele vazar, gere outro: o antigo para de funcionar na hora.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pendente}
              onClick={async () => {
                if (!confirm('Gerar um endereço novo? O atual deixa de funcionar e você precisa assinar de novo onde já usava.')) return
                const r = await executar(() => renovarAgenda())
                if (r) setPref(r)
              }}
            >
              {pendente ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Gerar novo endereço
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Não foi possível preparar a agenda agora.</p>
      )}
      {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
      {mensagem ? <p className="text-xs text-positive">{mensagem}</p> : null}
    </Cartao>
  )
}

// ---------------------------------------------------------------------------
//  Google Calendar (somente leitura, pelo endereço iCal secreto)
// ---------------------------------------------------------------------------

function GoogleCalendar({
  pref,
  setPref,
}: {
  pref: PreferenciasTasks
  setPref: (p: PreferenciasTasks) => void
}) {
  const { executar, pendente, erro, mensagem, limpar } = useAcao()
  const [endereco, setEndereco] = React.useState('')

  async function conectar(e: React.FormEvent) {
    e.preventDefault()
    const r = await executar(() => salvarGoogleIcs(endereco))
    if (r) {
      setEndereco('')
      setPref({ ...pref, google_calendar_conectado: r.conectado })
    }
  }

  async function desconectar() {
    if (!confirm('Desconectar o Google Calendar? O Tasks para de mostrar suas reuniões.')) return
    const r = await executar(() => salvarGoogleIcs(null))
    if (r) setPref({ ...pref, google_calendar_conectado: false })
  }

  return (
    <Cartao
      icone={CalendarPlus}
      titulo="Suas reuniões do Google Calendar no Tasks"
      descricao="Somente leitura: a Agenda do Início passa a mostrar as reuniões do dia, com o botão “Entrar” quando há Meet ou Zoom. O Tasks não altera nada no seu Google Calendar."
    >
      {pref.google_calendar_conectado ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-positive/40 bg-positive/10 px-3 py-2">
          <Check className="size-4 shrink-0 text-positive" />
          <p className="min-w-0 flex-1 text-sm">
            <strong>Conectado.</strong> Suas reuniões aparecem na Agenda do Início (atualiza a cada 5 minutos).
          </p>
          <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={() => void desconectar()}>
            {pendente ? <Loader2 className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />}
            Desconectar
          </Button>
        </div>
      ) : (
        <form onSubmit={conectar} className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              Abra o{' '}
              <a href="https://calendar.google.com/calendar/u/0/r/settings" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2">
                Google Calendar no computador → Configurações
              </a>
              .
            </li>
            <li>À esquerda, clique no seu calendário (o com seu nome) e desça até “Integrar agenda”.</li>
            <li>Copie o <strong>“Endereço secreto no formato iCal”</strong> (termina em .ics) e cole aqui.</li>
          </ol>
          <div className="space-y-1.5">
            <Label htmlFor="google-ics">Endereço secreto no formato iCal</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="google-ics"
                value={endereco}
                onChange={(e) => {
                  setEndereco(e.target.value)
                  limpar()
                }}
                placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
                className="min-w-0 flex-1 font-mono text-xs"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="submit" size="sm" disabled={pendente || !endereco.trim()}>
                {pendente ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Conectar
              </Button>
            </div>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Esse endereço dá acesso de leitura à sua agenda, por isso fica guardado cifrado e só o servidor do Hub o usa. Ninguém do time vê seus eventos: eles aparecem só para você.
          </p>
        </form>
      )}
      {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
      {mensagem ? <p className="text-xs text-positive">{mensagem}</p> : null}
    </Cartao>
  )
}
