'use client'

import * as React from 'react'
import { ExternalLink, FolderOpen, Search, Sparkles } from 'lucide-react'

import { Section } from '@/components/home/section'
import { VaultPanel } from '@/components/home/vault-panel'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAccent } from '@/lib/accents'
import { getProviderMeta, resolveIcon } from '@/lib/icons'
import type { CategoryWithDocuments, DocumentItem } from '@/lib/types'
import { cn } from '@/lib/utils'

interface QuickAccessBlockProps {
  categories: CategoryWithDocuments[]
  vaultConfigured: boolean
}

/**
 * BLOCO 4 — Hub de acesso rápido.
 * Documentos organizados por categoria em abas, e o Cofre de Senhas logo
 * abaixo com largura total para a tabela de credenciais respirar.
 */
export function QuickAccessBlock({ categories, vaultConfigured }: QuickAccessBlockProps) {
  const [query, setQuery] = React.useState('')
  const [activeTab, setActiveTab] = React.useState(categories[0]?.slug ?? '')

  const totalDocuments = categories.reduce((sum, category) => sum + category.documents.length, 0)

  const filterDocuments = React.useCallback(
    (documents: DocumentItem[]) => {
      const term = query.trim().toLowerCase()
      if (!term) return documents

      return documents.filter((doc) =>
        [doc.title, doc.description, ...(doc.tags ?? [])]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term)),
      )
    },
    [query],
  )

  return (
    <Section
      id="hub"
      index="04"
      title="Hub de acesso rápido"
      description="Documentos, materiais e credenciais do time — tudo a um clique."
      icon={FolderOpen}
      actions={
        <div className="relative w-full sm:w-64">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar documento..."
            className="pl-9"
          />
        </div>
      }
    >
      {/* Faixa de destaque: o Hub é a área mais usada no dia a dia, então o
          fundo tingido a separa do resto da página sem competir com os
          números dos blocos de cima. */}
      <div
        className={cn(
          'space-y-3 rounded-2xl border p-3 sm:p-4',
          'border-indigo-200 bg-gradient-to-b from-indigo-100/70 to-indigo-50/30',
          'shadow-[0_1px_2px_rgba(15,23,42,.04),0_10px_30px_-18px_rgba(79,70,229,.45)]',
          'dark:border-indigo-400/30 dark:from-indigo-500/[0.16] dark:to-indigo-500/[0.05]',
          'dark:shadow-[0_10px_30px_-18px_rgba(129,140,248,.5)]',
        )}
      >
        {categories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
            <FolderOpen className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">Nenhuma categoria cadastrada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie categorias e adicione links no painel administrativo.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="overflow-x-auto border-b border-border p-3">
                <TabsList>
                  {categories.map((category) => {
                    const Icon = resolveIcon(category.icon)
                    const count = filterDocuments(category.documents).length

                    return (
                      <TabsTrigger key={category.slug} value={category.slug}>
                        <Icon className="size-4" />
                        {category.name}
                        <span className="ml-0.5 rounded-full bg-muted-foreground/12 px-1.5 text-[11px] tabular">
                          {count}
                        </span>
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </div>

              {categories.map((category) => {
                const documents = filterDocuments(category.documents)

                return (
                  <TabsContent key={category.slug} value={category.slug} className="p-4">
                    {category.description ? (
                      <p className="mb-3 text-sm text-muted-foreground">{category.description}</p>
                    ) : null}

                    {documents.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {category.documents.length === 0
                          ? 'Nenhum documento nesta categoria ainda.'
                          : 'Nenhum documento corresponde à busca.'}
                      </p>
                    ) : (
                      <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {documents.map((document) => (
                          <DocumentCard
                            key={document.id}
                            document={document}
                            accent={category.accent}
                          />
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                )
              })}
            </Tabs>

            <footer className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5" />
              {totalDocuments} documento(s) em {categories.length} categoria(s)
            </footer>
          </div>
        )}

        <VaultPanel configured={vaultConfigured} />
      </div>
    </Section>
  )
}

function DocumentCard({ document, accent }: { document: DocumentItem; accent: string }) {
  const theme = getAccent(accent)
  const provider = getProviderMeta(document.provider)

  return (
    <li>
      <a
        href={document.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'group flex h-full flex-col rounded-lg border border-border bg-background/60 p-3.5 transition-all',
          'hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
          theme.ring,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', provider.className)}>
            {provider.label}
          </span>
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>

        <p className="mt-2 text-sm leading-snug font-medium">{document.title}</p>

        {document.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{document.description}</p>
        ) : null}

        {document.tags && document.tags.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1 pt-2.5">
            {document.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </a>
    </li>
  )
}
