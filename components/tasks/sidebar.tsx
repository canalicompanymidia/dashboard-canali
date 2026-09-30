'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
  SlidersHorizontal,
  Star,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react'

import { excluirEspaco, excluirLista, excluirPasta } from '@/app/tasks/actions'
import { ConfirmarExclusao, EspacoDialog, ListaDialog, PastaDialog } from '@/components/tasks/dialogs'
import { Avatar, MarcaEspaco } from '@/components/tasks/pecas'
import { useOnlineTodos } from '@/components/tasks/presenca'
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
import type { EspacoComArvore, Favorito, Lista, PastaComListas, TipoFavorito } from '@/lib/tasks/types'
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

/**
 * Para onde ir depois de excluir algo que está aberto na tela. Sem isto
 * a rota atual re-renderiza como "não encontrado" e a pessoa fica presa
 * numa página que não existe mais.
 */
function destinoAposExcluir(pathname: string, alvo: Dialogo): string | null {
  if (alvo.tipo === 'excluir-lista') {
    return pathname === `/tasks/l/${alvo.lista.id}` ? `/tasks/e/${alvo.lista.espaco_id}` : null
  }
  if (alvo.tipo === 'excluir-pasta') {
    const dentro = pathname === `/tasks/p/${alvo.pasta.id}` || alvo.pasta.listas.some((l) => pathname === `/tasks/l/${l.id}`)
    return dentro ? `/tasks/e/${alvo.pasta.espaco_id}` : null
  }
  if (alvo.tipo === 'excluir-espaco') {
    const e = alvo.espaco
    const dentro =
      pathname === `/tasks/e/${e.id}` ||
      e.listas.some((l) => pathname === `/tasks/l/${l.id}`) ||
      e.pastas.some((p) => pathname === `/tasks/p/${p.id}` || p.listas.some((l) => pathname === `/tasks/l/${l.id}`))
    return dentro ? '/tasks' : null
  }
  return null
}

function Conteudo() {
  const pathname = usePathname()
  const router = useRouter()
  const { arvore, colab } = useTasks()
  const [dialogo, setDialogo] = React.useState<Dialogo | null>(null)
  const [fechados, setFechados] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    setFechados(lerFechados())
  }, [])

  /** Depois de excluir: sai da tela do item apagado, se era ela que estava aberta. */
  function aoExcluir(alvo: Dialogo) {
    const destino = destinoAposExcluir(pathname, alvo)
    if (destino) router.push(destino)
  }

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
        <ItemNav href="/tasks/equipes" icone={Users} ativo={pathname.startsWith('/tasks/equipes')}>
          Equipes
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

      <Favoritos pathname={pathname} />

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

      <footer className="shrink-0 space-y-1 border-t border-border px-2 py-2">
        <OnlineAgora />
        <ItemNav href="/tasks/preferencias" icone={SlidersHorizontal} ativo={pathname.startsWith('/tasks/preferencias')}>
          Preferências
        </ItemNav>
      </footer>

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
          aoConcluir={() => aoExcluir(dialogo)}
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
          aoConcluir={() => aoExcluir(dialogo)}
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
          aoConcluir={() => aoExcluir(dialogo)}
        />
      ) : null}
    </div>
  )
}

interface FavoritoResolvido {
  tipo: TipoFavorito
  id: string
  nome: string
  cor: string | null
  href: string
  subtitulo: string | null
}

/** Casa os favoritos com a árvore: o que foi apagado (ou a pessoa deixou de ver) some sozinho. */
function resolverFavoritos(favoritos: Favorito[], arvore: EspacoComArvore[]): FavoritoResolvido[] {
  const saida: FavoritoResolvido[] = []
  for (const f of favoritos) {
    if (f.tipo === 'espaco') {
      const e = arvore.find((x) => x.id === f.item_id)
      if (e) saida.push({ tipo: 'espaco', id: e.id, nome: e.nome, cor: e.cor, href: `/tasks/e/${e.id}`, subtitulo: null })
      continue
    }
    for (const e of arvore) {
      const l = e.listas.find((x) => x.id === f.item_id) ?? e.pastas.flatMap((p) => p.listas).find((x) => x.id === f.item_id)
      if (l) {
        saida.push({ tipo: 'lista', id: l.id, nome: l.nome, cor: l.cor, href: `/tasks/l/${l.id}`, subtitulo: e.nome })
        break
      }
    }
  }
  return saida
}

/** Espaços e listas fixados pela pessoa, no topo da barra. Some quando não há nenhum. */
function Favoritos({ pathname }: { pathname: string }) {
  const { arvore, favoritos, alternarFavorito } = useTasks()
  const itens = React.useMemo(() => resolverFavoritos(favoritos, arvore), [favoritos, arvore])
  if (itens.length === 0) return null

  return (
    <div className="px-2 pt-2">
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <Star className="size-3 fill-current text-warning-foreground dark:text-warning" aria-hidden />
        <span className="rotulo">Favoritos</span>
      </div>
      <ul className="space-y-0.5" aria-label="Favoritos">
        {itens.map((f) => (
          <li key={`${f.tipo}-${f.id}`}>
            <div className={cn(LINHA, 'pl-1', pathname === f.href && 'bg-accent')}>
              <Link href={f.href} className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-1">
                {f.tipo === 'espaco' ? (
                  <MarcaEspaco nome={f.nome} cor={f.cor ?? '#62676f'} />
                ) : (
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: f.cor ?? 'var(--muted-foreground)' }} aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{f.nome}</span>
                {f.subtitulo ? <span className="max-w-20 truncate text-[11px] text-muted-foreground">{f.subtitulo}</span> : null}
              </Link>
              <button
                type="button"
                onClick={() => void alternarFavorito(f.tipo, f.id)}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-warning-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 dark:text-warning"
                aria-label={`Remover ${f.nome} dos favoritos`}
                title="Remover dos favoritos"
              >
                <Star className="size-3.5 fill-current" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Item de menu que fixa/solta um espaço ou lista. */
function ItemFavoritar({ tipo, id }: { tipo: TipoFavorito; id: string }) {
  const { ehFavorito, alternarFavorito } = useTasks()
  const fav = ehFavorito(tipo, id)
  return (
    <DropdownMenuItem onSelect={() => void alternarFavorito(tipo, id)}>
      <Star className={cn(fav && 'fill-current text-warning-foreground dark:text-warning')} />
      {fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
    </DropdownMenuItem>
  )
}

/** Quem está com o Tasks aberto agora (presença do Realtime). */
function OnlineAgora() {
  const { pessoas, colab } = useTasks()
  const online = useOnlineTodos()
  const outros = pessoas.filter((p) => p.email !== colab.email && online.has(p.email))

  return (
    <div className="px-2 py-1" title={outros.length ? outros.map((p) => p.nome || p.email).join(', ') : 'Só você está no Tasks agora'}>
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="size-1.5 rounded-full bg-positive" aria-hidden />
        Online agora · {outros.length + 1}
      </p>
      {outros.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Pessoas online">
          {outros.slice(0, 8).map((p) => (
            <li key={p.email}>
              <Avatar email={p.email} tamanho="sm" />
            </li>
          ))}
          {outros.length > 8 ? <li className="self-center text-[11px] text-muted-foreground">+{outros.length - 8}</li> : null}
        </ul>
      ) : (
        <p className="mt-0.5 text-[11px] text-muted-foreground/70">Só você, por enquanto.</p>
      )}
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
          <ItemFavoritar tipo="espaco" id={espaco.id} />
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
          <ItemFavoritar tipo="lista" id={lista.id} />
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
