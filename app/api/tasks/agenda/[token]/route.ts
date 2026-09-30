import { NextResponse } from 'next/server'

import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { gerarAgendaICS } from '@/lib/tasks/ics'
import type { Tarefa } from '@/lib/tasks/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Agenda assinável de uma pessoa: as tarefas dela com vencimento, no
 * formato que o Google Calendar, a Apple e o Outlook assinam por URL.
 *
 * Não há sessão aqui — programas de agenda não fazem login. O que
 * autentica é o TOKEN secreto do endereço, gerado por pessoa e
 * renovável em /tasks/preferencias. Quem tem o endereço vê só os
 * títulos, listas e datas das tarefas dessa pessoa; nunca anexos,
 * comentários ou descrições.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: bruto } = await params
  const token = bruto.replace(/\.ics$/i, '')
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new NextResponse('Não encontrado', { status: 404 })

  const supabase = getSupabaseAdminClient()
  if (!supabase) return new NextResponse('Indisponível', { status: 503 })

  const { data: pref } = await supabase
    .from('tarefas_preferencias')
    .select('email')
    .eq('agenda_token', token)
    .maybeSingle()
  if (!pref) return new NextResponse('Não encontrado', { status: 404 })

  const { data: colab } = await supabase
    .from('colaboradores_autorizados')
    .select('ativo')
    .ilike('email', String(pref.email))
    .maybeSingle()
  if (!colab?.ativo) return new NextResponse('Não encontrado', { status: 404 })

  // Só o que ainda importa: abertas, ou concluídas nos últimos 30 dias.
  const limite = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data } = await supabase
    .from('v_tarefas')
    .select('*')
    .contains('responsaveis', [String(pref.email)])
    .not('data_vencimento', 'is', null)
    .or(`concluida_em.is.null,concluida_em.gte.${limite}`)
    .order('data_vencimento')
    .limit(500)

  const url = new URL(request.url)
  const origem = `${url.protocol}//${request.headers.get('x-forwarded-host') ?? url.host}`
  const ics = gerarAgendaICS((data ?? []) as Tarefa[], origem)

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="tasks-canali.ics"',
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  })
}
