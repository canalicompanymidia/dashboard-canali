import Link from 'next/link'
import { FolderOpen } from 'lucide-react'

import { Progresso } from '@/components/tasks/pecas'
import type { Lista } from '@/lib/tasks/types'

/**
 * Tabela de listas da visão geral (espaço e pasta): nome, cor, progresso,
 * atrasadas e quem criou. Componente de servidor: só desenha.
 */
export function TabelaDeListas({
  grupos,
  nomes,
}: {
  grupos: { titulo?: string; href?: string; listas: Lista[] }[]
  /** e-mail → nome, resolvido no servidor. */
  nomes: Record<string, string>
}) {
  const vazio = grupos.every((g) => g.listas.length === 0)
  if (vazio) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
        Nenhuma lista ainda. Crie a primeira no botão “Lista”.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            <th className="px-3 py-2">Nome</th>
            <th className="hidden px-3 py-2 sm:table-cell">Progresso</th>
            <th className="hidden px-3 py-2 md:table-cell">Atrasadas</th>
            <th className="hidden px-3 py-2 lg:table-cell">Criada por</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g, gi) => (
            <GrupoLinhas key={g.titulo ?? gi} grupo={g} nomes={nomes} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GrupoLinhas({
  grupo,
  nomes,
}: {
  grupo: { titulo?: string; href?: string; listas: Lista[] }
  nomes: Record<string, string>
}) {
  return (
    <>
      {grupo.titulo ? (
        <tr className="bg-muted/40">
          <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold">
            {grupo.href ? (
              <Link href={grupo.href} className="inline-flex items-center gap-1.5 hover:underline">
                <FolderOpen className="size-3.5 text-warning-foreground dark:text-warning" />
                {grupo.titulo}
              </Link>
            ) : (
              grupo.titulo
            )}
          </td>
        </tr>
      ) : null}
      {grupo.listas.length === 0 ? (
        <tr>
          <td colSpan={4} className="px-3 py-2 text-xs text-muted-foreground">
            Pasta vazia.
          </td>
        </tr>
      ) : (
        grupo.listas.map((l) => (
          <tr key={l.id} className="border-t border-border hover:bg-accent/40">
            <td className="px-3 py-2">
              <Link href={`/tasks/l/${l.id}`} className="flex items-center gap-2 font-medium hover:underline">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.cor ?? 'var(--muted-foreground)' }} />
                {l.nome}
              </Link>
            </td>
            <td className="hidden px-3 py-2 sm:table-cell">
              <Progresso feitas={l.tarefas_concluidas} total={l.tarefas_total} />
            </td>
            <td className="hidden px-3 py-2 md:table-cell">
              {l.tarefas_atrasadas > 0 ? (
                <span className="font-medium text-negative tabular">{l.tarefas_atrasadas}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">
              {l.criado_por ? (nomes[l.criado_por] ?? l.criado_por) : '—'}
            </td>
          </tr>
        ))
      )}
    </>
  )
}
