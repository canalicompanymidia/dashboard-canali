'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { FolderPlus, ListPlus, MoreHorizontal, Pencil, Settings2, Trash2 } from 'lucide-react'

import { excluirEspaco, excluirPasta } from '@/app/tasks/actions'
import { ConfirmarExclusao, EspacoDialog, ListaDialog, PastaDialog } from '@/components/tasks/dialogs'
import { useTasks } from '@/components/tasks/provider'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { podeAdministrarEspaco, podeApagarItem } from '@/lib/tasks/permissoes'
import type { EspacoComArvore, PastaComListas } from '@/lib/tasks/types'

/** Botões da visão geral do espaço: nova lista, nova pasta, configurar, excluir. */
export function EspacoAcoes({ espaco }: { espaco: EspacoComArvore }) {
  const router = useRouter()
  const { colab } = useTasks()
  const [dialogo, setDialogo] = React.useState<'lista' | 'pasta' | 'config' | 'excluir' | null>(null)
  const admin = podeAdministrarEspaco(colab, espaco)

  return (
    <>
      <Button size="sm" onClick={() => setDialogo('lista')}>
        <ListPlus className="size-4" />
        <span className="hidden sm:inline">Lista</span>
      </Button>
      <Button size="sm" variant="outline" onClick={() => setDialogo('pasta')}>
        <FolderPlus className="size-4" />
        <span className="hidden sm:inline">Pasta</span>
      </Button>
      {admin ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Mais opções">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setDialogo('config')}>
              <Settings2 />
              Configurar espaço
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setDialogo('excluir')}>
              <Trash2 />
              Excluir espaço
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {dialogo === 'lista' ? <ListaDialog aberto onOpenChange={(o) => !o && setDialogo(null)} espacoId={espaco.id} /> : null}
      {dialogo === 'pasta' ? <PastaDialog aberto onOpenChange={(o) => !o && setDialogo(null)} espacoId={espaco.id} /> : null}
      <EspacoDialog aberto={dialogo === 'config'} onOpenChange={(o) => !o && setDialogo(null)} espaco={espaco} />
      <ConfirmarExclusao
        aberto={dialogo === 'excluir'}
        onOpenChange={(o) => !o && setDialogo(null)}
        titulo={`Excluir o espaço “${espaco.nome}”?`}
        descricao={
          <>
            Todas as pastas, listas e tarefas dele serão apagadas, com anexos e comentários.{' '}
            <strong className="text-destructive">Não dá para desfazer.</strong>
          </>
        }
        onConfirmar={() => excluirEspaco(espaco.id)}
        aoConcluir={() => router.push('/tasks')}
      />
    </>
  )
}

/** Botões da visão geral da pasta: nova lista, renomear, excluir. */
export function PastaAcoes({ pasta, espaco }: { pasta: PastaComListas; espaco: EspacoComArvore }) {
  const router = useRouter()
  const { colab } = useTasks()
  const [dialogo, setDialogo] = React.useState<'lista' | 'renomear' | 'excluir' | null>(null)
  const podeApagar = podeApagarItem(colab, pasta, espaco)

  return (
    <>
      <Button size="sm" onClick={() => setDialogo('lista')}>
        <ListPlus className="size-4" />
        <span className="hidden sm:inline">Lista</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Mais opções">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setDialogo('renomear')}>
            <Pencil />
            Renomear pasta
          </DropdownMenuItem>
          {podeApagar ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDialogo('excluir')}>
                <Trash2 />
                Excluir pasta
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialogo === 'lista' ? (
        <ListaDialog aberto onOpenChange={(o) => !o && setDialogo(null)} espacoId={espaco.id} pastaId={pasta.id} />
      ) : null}
      {dialogo === 'renomear' ? (
        <PastaDialog aberto onOpenChange={(o) => !o && setDialogo(null)} espacoId={espaco.id} pasta={pasta} />
      ) : null}
      <ConfirmarExclusao
        aberto={dialogo === 'excluir'}
        onOpenChange={(o) => !o && setDialogo(null)}
        titulo={`Excluir a pasta “${pasta.nome}”?`}
        descricao={
          <>
            As {pasta.listas.length} lista(s) dela e todas as tarefas serão apagadas.{' '}
            <strong className="text-destructive">Não dá para desfazer.</strong>
          </>
        }
        onConfirmar={() => excluirPasta(pasta.id)}
        aoConcluir={() => router.push(`/tasks/e/${espaco.id}`)}
      />
    </>
  )
}
