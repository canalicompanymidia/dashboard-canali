import { NextResponse } from 'next/server'

import { getColaborador } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { CAMINHO_IMAGEM } from '@/lib/tasks/descricao'
import { getEspacosVisiveis } from '@/lib/tasks/data'
import { BUCKET_ANEXOS } from '@/lib/tasks/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Imagem colada dentro da descrição de uma tarefa.
 *
 * O bucket é privado: a descrição guarda este endereço estável, e cada
 * vez que alguém abre a tarefa o servidor confere a sessão e se a pessoa
 * enxerga o espaço da imagem, e só então redireciona para uma URL
 * assinada de curta duração.
 */
export async function GET(request: Request) {
  const caminho = new URL(request.url).searchParams.get('c') ?? ''
  if (!CAMINHO_IMAGEM.test(caminho)) return new NextResponse('Não encontrado', { status: 404 })

  const colab = await getColaborador()
  if (!colab) return new NextResponse('Não autorizado', { status: 401 })

  const espacoId = caminho.split('/')[1]
  const espacos = await getEspacosVisiveis(colab)
  if (!espacos.some((e) => e.id === espacoId)) return new NextResponse('Não encontrado', { status: 404 })

  const supabase = getSupabaseAdminClient()
  if (!supabase) return new NextResponse('Indisponível', { status: 503 })

  const { data, error } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrl(caminho, 60 * 60)
  if (error || !data) return new NextResponse('Não encontrado', { status: 404 })

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    // O navegador reaproveita por 50 min (a URL assinada vale 60).
    headers: { 'Cache-Control': 'private, max-age=3000' },
  })
}
