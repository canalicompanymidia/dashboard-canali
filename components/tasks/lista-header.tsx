'use client'

import * as React from 'react'
import { CalendarDays, List, MoreHorizontal, Pencil, Plus, Settings2, SquareKanban } from 'lucide-react'

import { ListaDialog, NovaTarefaDialog } from '@/components/tasks/dialogs'
import { ListaConfigDialog } from '@/components/tasks/lista-config'
import { AbasDeVisualizacao, Topbar, type Crumb } from '@/components/tasks/topbar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { ListaContexto } from '@/lib/tasks/types'

export type VisualizacaoLista = 'lista' | 'quadro' | 'calendario'

/** Barra superior da tela de lista: trilha, abas de visualização e ações. */
export function ListaHeader({ contexto, view }: { contexto: ListaContexto; view: VisualizacaoLista }) {
  const { lista, espaco, pasta } = contexto
  const [novaTarefa, setNovaTarefa] = React.useState(false)
  const [config, setConfig] = React.useState(false)
  const [editar, setEditar] = React.useState(false)

  const crumbs: Crumb[] = [
    { label: espaco.nome, href: `/tasks/e/${espaco.id}`, tipo: 'espaco', cor: espaco.cor, privado: espaco.privado },
    ...(pasta ? [{ label: pasta.nome, href: `/tasks/p/${pasta.id}`, tipo: 'pasta' as const }] : []),
    { label: lista.nome, tipo: 'lista', cor: lista.cor },
  ]

  const base = `/tasks/l/${lista.id}`

  return (
    <>
      <Topbar
        crumbs={crumbs}
        abaixo={
          <AbasDeVisualizacao
            atual={view}
            itens={[
              { chave: 'lista', label: 'Lista', href: `${base}?view=lista`, icone: List },
              { chave: 'quadro', label: 'Quadro', href: `${base}?view=quadro`, icone: SquareKanban },
              { chave: 'calendario', label: 'Calendário', href: `${base}?view=calendario`, icone: CalendarDays },
            ]}
          />
        }
      >
        <Button size="sm" onClick={() => setNovaTarefa(true)}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Tarefa</span>
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => setConfig(true)} aria-label="Configurações da lista" title="Status, campos e dados da lista">
          <Settings2 className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Mais opções">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setEditar(true)}>
              <Pencil />
              Editar lista
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setConfig(true)}>
              <Settings2 />
              Status e campos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Topbar>

      <NovaTarefaDialog aberto={novaTarefa} onOpenChange={setNovaTarefa} listaId={lista.id} statuses={contexto.statuses} />
      <ListaConfigDialog aberto={config} onOpenChange={setConfig} contexto={contexto} />
      <ListaDialog aberto={editar} onOpenChange={setEditar} espacoId={espaco.id} lista={lista} />
    </>
  )
}
