'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getColaborador } from '@/lib/auth'
import { ClickupErro } from '@/lib/clickup/api'
import {
  conectar,
  finalizarLista,
  importarComentarios,
  importarPagina,
  type ArvoreClickup,
  type ResultadoPagina,
} from '@/lib/clickup/importar'
import { isServiceRoleConfigured } from '@/lib/supabase/config'

/**
 * Server Actions da importação do ClickUp. Só admin; o token viaja em
 * cada chamada e não é guardado. Um 429 do ClickUp volta como
 * `aguardar` (segundos) para o navegador esperar e repetir.
 */

export type RespostaClickup<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; aguardar?: number }

const token = z.string().trim().min(10, { message: 'Cole o token do ClickUp.' }).max(300)

const alvoSchema = z.object({
  espaco: z.object({ id: z.string().min(1), nome: z.string().trim().min(1).max(80), privado: z.boolean() }),
  pasta: z.object({ id: z.string().min(1), nome: z.string().trim().min(1).max(80) }).nullable(),
  lista: z.object({ id: z.string().min(1), nome: z.string().trim().min(1).max(80) }),
})

const paginaSchema = z.object({
  token,
  alvo: alvoSchema,
  pagina: z.number().int().min(0).max(1000),
  /** 'AAAA-MM-DD' — só tarefas criadas a partir deste dia (São Paulo). */
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  incluirFechadas: z.boolean(),
})

async function exigirAdmin(): Promise<string | null> {
  const colab = await getColaborador()
  if (!colab) return 'Sua sessão expirou. Entre novamente.'
  if (colab.papel !== 'admin') return 'Apenas administradores podem importar.'
  if (!isServiceRoleConfigured()) return 'Supabase não configurado (SUPABASE_SERVICE_ROLE_KEY).'
  return null
}

function traduzir(e: unknown): RespostaClickup<never> {
  if (e instanceof ClickupErro) {
    return { ok: false, message: e.message, aguardar: e.status === 429 ? e.aguardar : undefined }
  }
  return { ok: false, message: e instanceof Error ? e.message : 'Falha inesperada.' }
}

export async function clickupConectar(input: unknown): Promise<RespostaClickup<ArvoreClickup>> {
  const bloqueio = await exigirAdmin()
  if (bloqueio) return { ok: false, message: bloqueio }

  const parsed = token.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Token inválido.' }

  try {
    return { ok: true, data: await conectar(parsed.data) }
  } catch (e) {
    return traduzir(e)
  }
}

export async function clickupImportarPagina(input: unknown): Promise<RespostaClickup<ResultadoPagina>> {
  const bloqueio = await exigirAdmin()
  if (bloqueio) return { ok: false, message: bloqueio }

  const parsed = paginaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }

  const { desde } = parsed.data
  // Meia-noite em São Paulo (fuso fixo -03:00).
  const desdeMs = new Date(`${desde}T00:00:00-03:00`).getTime()

  try {
    const resultado = await importarPagina(parsed.data.token, parsed.data.alvo, parsed.data.pagina, {
      desdeMs,
      incluirFechadas: parsed.data.incluirFechadas,
    })
    return { ok: true, data: resultado }
  } catch (e) {
    return traduzir(e)
  }
}

export async function clickupFinalizarLista(input: unknown): Promise<RespostaClickup<{ subtarefas: number }>> {
  const bloqueio = await exigirAdmin()
  if (bloqueio) return { ok: false, message: bloqueio }

  const parsed = z.string().uuid().safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Lista inválida.' }

  try {
    const subtarefas = await finalizarLista(parsed.data)
    revalidatePath('/tasks', 'layout')
    return { ok: true, data: { subtarefas } }
  } catch (e) {
    return traduzir(e)
  }
}

export async function clickupImportarComentarios(
  input: unknown,
): Promise<RespostaClickup<{ processadas: number; comentarios: number; restantes: number }>> {
  const bloqueio = await exigirAdmin()
  if (bloqueio) return { ok: false, message: bloqueio }

  const parsed = z.object({ token, lote: z.number().int().min(1).max(40) }).safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Dados inválidos.' }

  try {
    const resultado = await importarComentarios(parsed.data.token, parsed.data.lote)
    if (resultado.restantes === 0) revalidatePath('/tasks', 'layout')
    return { ok: true, data: resultado }
  } catch (e) {
    return traduzir(e)
  }
}
