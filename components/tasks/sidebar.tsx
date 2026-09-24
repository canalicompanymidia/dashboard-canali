'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Home,
  ListPlus,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'

import { excluirEspaco, excluirLista, excluirPasta } from '@/app/tasks/actions'
import { ConfirmarExclusao, EspacoDialog, ListaDialog, PastaDialog } from '@/components/tasks/dialogs'
import { MarcaEspaco } from '@/components/tasks/pecas'
import { useTasks } from '@/components/tasks/provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { podeAdministrarEspaco, podeApagarItem } from '@/lib/tasks/permissoes'
import type { EspacoComArvore, Lista, PastaComListas } from '@/lib/tasks/types'
import { cn } from '@/lib/utils'

/**
 * Barra lateral: Início, Minhas tarefas, busca e a árvore
 * Espaço → Pasta → Lista, com os menus de criar/editar/excluir.
 *
 * No desktop fica fixa à esquerda; no celular vira uma gaveta aberta
 * pelo botão da barra superior.
 */

type Dialogo =
  | { tipo: 'espaco'; espaco?: EspacoComArvore }
  | { tipo: 'pasta'; espacoId: string; pasta?: PastaComListas }
  | { tipo: 'lista'; espacoId: string; pastaId?: string | null; lista?: Lista }
  | { tipo: 'excluir-espaco'; espaco: EspacoComArvore }
  | { tipo: 'excluir-pasta'; pasta: PastaComListas }
  | { tipo: 'excluir-lista'; lista: Lista }

const CHAVE_FECHADOS = 'canali-tasks-fechados'

function lerFechados(): Set<string> {
  try {
    const bruto = localStorage.getItem(CHAVE_FECHADOS)
    return new Set(bruto ? (JSON.parse(bruto) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function TasksSidebar() {
  const { sidebarAberta, setSidebarAberta } = useTasks()

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card/60 lg:flex lg:flex-col">
        <Conteudo />
      </aside>

      {sidebarAberta ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navegação do Tasks">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setSidebarAberta(false)}
            aria-label="Fechar navegação"
          />
          <aside className="relative flex h-full w-[min(20rem,85vw)] flex-col border-r border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="rotulo">Tasks</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setSidebarAberta(false)} aria-label="Fechar">
                <X className="size-4" />
              </Button>
            </div>
            <Conteudo />
          </aside>
        </div>
      ) : null}
    </>
  )
}

function Conteudo() {
  const pathname = usePathname()
  const { arvore, colab } = useTasks()
  const [dialogo, setDialogo] = React.useState<Dialogo | null>(null)
  const [fechados, setFechados] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    setFechados(lerFechados())
  }, [])

  function alternar(id: string) {
    setFechados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      try {
        localStorage.setItem(CHAVE_FECHADOS, JSON.stringify([...novo]))
      } catch {
        // Sem storage o estado vive só nesta visita.
      }
      return novo
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="space-y-0.5 p-2" aria-label="Atalhos">
        <ItemNav href="/tasks" icone={Home} ativo={pathname === '/tasks'}>
          Início
        </ItemNav>
        <ItemNav href="/tasks/minhas" icone={UserRound} ativo={pathname.startsWith('/tasks/minhas')}>
          Minhas tarefas
        </ItemNav>
        <form action="/tasks/busca" className="relative px-1 pt-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            placeholder="Buscar tarefas"
            className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring"
            aria-label="Buscar tarefas"
          />
        </form>
      </nav>

      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="rotulo">Espaços</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          onClick={() => setDialogo({ tipo: 'espaco' })}
          aria-label="Novo espaço"
          title="Novo espaço"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {arvore.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Nenhum espaço ainda. Crie o primeiro no “+” acima.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {arvore.map((espaco) => (
              <EspacoItem
                key={espaco.id}
                espaco={espaco}
                fechado={fechados.has(espaco.id)}
                fechados={fechados}
                onAlternar={alternar}
                pathname={pathname}
                onDialogo={setDialogo}
                podeAdministrar={podeAdministrarEspaco(colab, espaco)}
              />
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setDialogo({ tipo: 'espaco' })}
          className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Novo espaço
        </button>
      </div>

      {/* Diálogos, um de cada vez. */}
      <EspacoDialog
        aberto={dialogo?.tipo === 'espaco'}
        onOpenChange={(o) => !o && setDialogo(null)}
        espaco={dialogo?.tipo === 'espaco' ? dialogo.espaco : null}
      />
      {dialogo?.tipo === 'pasta' ? (
        <PastaDialog aberto onOpenChange={(o) => !o && setDialogo(null)} espacoId={dialogo.espacoId} pasta={dialogo.pasta} />
      ) : null}
      {dialogo?.tipo === 'lista' ? (
        <ListaDialog
          aberto
          onOpenChange={(o) => !o && setDialogo(null)}
          espacoId={dialogo.espacoId}
          pastaId={dialogo.pastaId}
          lista={dialogo.lista}
        />
      ) : null}
      {dialogo?.tipo === 'excluir-espaco' ? (
        <ConfirmarExclusao
          aberto
          onOpenChange={(o) => !o && setDialogo(null)}
          titulo={`Excluir o espaço “${dialogo.espaco.nome}”?`}
          descricao={
            <>
              Todas as pastas, listas e tarefas dele serão apagadas, com anexos e comentários.{' '}
              <strong className="text-destructive">Não dá para desfazer.</strong>
            </>
          }
          onConfirmar={() => excluirEspaco(dialogo.espaco.id)}
        />
      ) : null}
      {dialogo?.tipo === 'excluir-pasta' ? (
        <ConfirmarExclusao
          aberto
          onOpenChange={(o) => !o && setDialogo(null)}
          titulo={`Excluir a pasta “${dialogo.pasta.nome}”?`}
          descricao={
            <>
              As {dialogo.pasta.listas.length} lista(s) dela e todas as tarefas serão apagadas.{' '}
              <strong className="text-destructive">Não dá para desfazer.</strong>
            </>
          }
          onConfirmar={() => excluirPasta(dialogo.pasta.id)}
        />
      ) : null}
      {dialogo?.tipo === 'excluir-lista' ? (
        <ConfirmarExclusao
          aberto
          onOpenChange={(o) => !o && setDialogo(null)}
          titulo={`Excluir a lista “${dialogo.lista.nome}”?`}
          descricao={
            <>
              As {dialogo.lista.tarefas_total} tarefa(s) dela serão apagadas, com anexos e comentários.{' '}
              <strong className="text-destructive">Não dá para desfazer.</strong>
            </>
          }
          onConfirmar={() => excluirLista(dialogo.lista.id)}
        />
      ) : null}
    </div>
  )
}

function ItemNav({
  href,
  icone: Icone,
  ativo,
  children,
}: {
  href: string
  icone: React.ComponentType<{ className?: string }>
  ativo: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors',
        ativo ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <Icone className="size-4" />
      {children}
    </Link>
  )
}

const LINHA =
  'group flex h-8 items-center gap-1.5 rounded-md pr-1 text-[13px] transition-colors hover:bg-accent/60'

function BotaoMenu({ children, rotulo }: { children: React.ReactNode; rotulo: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
          aria-label={rotulo}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

function EspacoItem({
  espaco,
  fechado,
  fechados,
  onAlternar,
  pathname,
  onDialogo,
  podeAdministrar,
}: {
  espaco: EspacoComArvore
  fechado: boolean
  fechados: Set<string>
  onAlternar: (id: string) => void
  pathname: string
  onDialogo: (d: Dialogo) => void
  podeAdministrar: boolean
}) {
  const { colab } = useTasks()
  const ativo = pathname === `/tasks/e/${espaco.id}`
  const vazio = espaco.pastas.length === 0 && espaco.listas.length === 0

  return (
    <li>
      <div className={cn(LINHA, ativo && 'bg-accent')}>
        <button
          type="button"
          onClick={() => onAlternar(espaco.id)}
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label={fechado ? `Expandir ${espaco.nome}` : `Recolher ${espaco.nome}`}
          aria-expanded={!fechado}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', !fechado && 'rotate-90')} />
        </button>
        <Link href={`/tasks/e/${espaco.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-1">
          <MarcaEspaco nome={espaco.nome} cor={espaco.cor} />
          <span className="truncate font-medium">{espaco.nome}</span>
          {espaco.privado ? <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Privado" /> : null}
        </Link>
        <BotaoMenu rotulo={`Opções de ${espaco.nome}`}>
          <DropdownMenuItem onSelect={() => onDialogo({ tipo: 'lista', espacoId: espaco.id, pastaId: null })}>
            <ListPlus />
            Nova lista
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDialogo({ tipo: 'pasta', espacoId: espaco.id })}>
            <FolderPlus />
            Nova pasta
          </DropdownMenuItem>
          {podeAdministrar ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onDialogo({ tipo: 'espaco', espaco })}>
                <Settings2 />
                Configurar espaço
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => onDialogo({ tipo: 'excluir-espaco', espaco })}>
                <Trash2 />
                Excluir espaço
              </DropdownMenuItem>
            </>
          ) : null}
        </BotaoMenu>
      </div>

      {!fechado ? (
        <ul className="ml-3 border-l border-border pl-1.5">
          {espaco.pastas.map((pasta) => (
            <PastaItem
              key={pasta.id}
              pasta={pasta}
              espaco={espaco}
              fechado={fechados.has(pasta.id)}
              onAlternar={onAlternar}
              pathname={pathname}
              onDialogo={onDialogo}
              podeApagar={podeApagarItem(colab, pasta, espaco)}
            />
          ))}
          {espaco.listas.map((lista) => (
            <ListaItem
              key={lista.id}
              lista={lista}
              pathname={pathname}
              onDialogo={onDialogo}
              podeApagar={podeApagarItem(colab, lista, espaco)}
            />
          ))}
          {vazio ? (
            <li>
              <button
                type="button"
                onClick={() => onDialogo({ tipo: 'lista', espacoId: espaco.id, pastaId: null })}
                className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              >
                <Plus className="size-3" />
                Criar lista
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}

function PastaItem({
  pasta,
  espaco,
  fechado,
  onAlternar,
  pathname,
  onDialogo,
  podeApagar,
}: {
  pasta: PastaComListas
  espaco: EspacoComArvore
  fechado: boolean
  onAlternar: (id: string) => void
  pathname: string
  onDialogo: (d: Dialogo) => void
  podeApagar: boolean
}) {
  const { colab } = useTasks()
  const ativo = pathname === `/tasks/p/${pasta.id}`

  return (
    <li>
      <div className={cn(LINHA, ativo && 'bg-accent')}>
        <button
          type="button"
          onClick={() => onAlternar(pasta.id)}
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label={fechado ? `Expandir ${pasta.nome}` : `Recolher ${pasta.nome}`}
          aria-expanded={!fechado}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', !fechado && 'rotate-90')} />
        </button>
        <Link href={`/tasks/p/${pasta.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-1">
          <FolderOpen className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
          <span className="truncate">{pasta.nome}</span>
        </Link>
        <BotaoMenu rotulo={`Opções de ${pasta.nome}`}>
          <DropdownMenuItem onSelect={() => onDialogo({ tipo: 'lista', espacoId: espaco.id, pastaId: pasta.id })}>
            <ListPlus />
            Nova lista
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDialogo({ tipo: 'pasta', espacoId: espaco.id, pasta })}>
            <Pencil />
            Renomear
          </DropdownMenuItem>
          {podeApagar ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => onDialogo({ tipo: 'excluir-pasta', pasta })}>
                <Trash2 />
                Excluir pasta
              </DropdownMenuItem>
            </>
          ) : null}
        </BotaoMenu>
      </div>
      {!fechado ? (
        <ul className="ml-3 border-l border-border pl-1.5">
          {pasta.listas.map((lista) => (
            <ListaItem
              key={lista.id}
              lista={lista}
              pathname={pathname}
              onDialogo={onDialogo}
              podeApagar={podeApagarItem(colab, lista, espaco)}
            />
          ))}
          {pasta.listas.length === 0 ? (
            <li>
              <button
                type="button"
                onClick={() => onDialogo({ tipo: 'lista', espacoId: espaco.id, pastaId: pasta.id })}
                className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              >
                <Plus className="size-3" />
                Criar lista
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}

function ListaItem({
  lista,
  pathname,
  onDialogo,
  podeApagar,
}: {
  lista: Lista
  pathname: string
  onDialogo: (d: Dialogo) => void
  podeApagar: boolean
}) {
  const ativo = pathname === `/tasks/l/${lista.id}`
  const pendentes = Math.max(0, lista.tarefas_total - lista.tarefas_concluidas)

  return (
    <li>
      <div className={cn(LINHA, 'pl-1', ativo && 'bg-accent')}>
        <Link href={`/tasks/l/${lista.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-1">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: lista.cor ?? 'var(--muted-foreground)' }}
            aria-hidden
          />
          <span className="truncate">{lista.nome}</span>
          {pendentes > 0 ? (
            <span className="ml-auto text-[11px] text-muted-foreground tabular">{pendentes}</span>
          ) : null}
        </Link>
        <BotaoMenu rotulo={`Opções de ${lista.nome}`}>
          <DropdownMenuItem onSelect={() => onDialogo({ tipo: 'lista', espacoId: lista.espaco_id, lista })}>
            <Pencil />
            Editar lista
          </DropdownMenuItem>
          {podeApagar ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => onDialogo({ tipo: 'excluir-lista', lista })}>
                <Trash2 />
                Excluir lista
              </DropdownMenuItem>
            </>
          ) : null}
        </BotaoMenu>
      </div>
    </li>
  )
}
