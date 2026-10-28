'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'

import { statusEncerra, type Status, type Tarefa } from '@/lib/tasks/types'

/**
 * Tarefas fechadas (status concluído ou encerrado) ficam fora das visões
 * da lista. O filtro "Fechadas" as traz de volta e vive na URL
 * (?fechadas=1), então o link compartilhado abre do mesmo jeito.
 */
export function useMostrarFechadas(): [boolean, (mostrar: boolean) => void] {
  const params = useSearchParams()
  const mostrar = params.get('fechadas') === '1'

  const definir = React.useCallback((valor: boolean) => {
    // Só a URL muda: o Next sincroniza o useSearchParams sem ir ao servidor.
    const url = new URL(window.location.href)
    if (valor) url.searchParams.set('fechadas', '1')
    else url.searchParams.delete('fechadas')
    window.history.replaceState(window.history.state, '', url)
  }, [])

  return [mostrar, definir]
}

/** As tarefas e os status que a visão deve mostrar. */
export function useVisiveis(tarefas: Tarefa[], statuses: Status[]) {
  const [mostrar] = useMostrarFechadas()
  return React.useMemo(
    () =>
      mostrar
        ? { tarefas, statuses }
        : {
            tarefas: tarefas.filter((t) => !statusEncerra(t.status_tipo)),
            statuses: statuses.filter((s) => !statusEncerra(s.tipo)),
          },
    [mostrar, tarefas, statuses],
  )
}
