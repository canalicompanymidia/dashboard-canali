import { FolderOpen, Plus } from 'lucide-react'

import { CategoryEditor, DocumentEditor } from '@/components/admin/document-editors'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getDocumentCategories } from '@/lib/data'
import { getProviderMeta, resolveIcon } from '@/lib/icons'

export const dynamic = 'force-dynamic'

export default async function AdminDocumentsPage() {
  const categories = await getDocumentCategories()
  const totalDocuments = categories.reduce((sum, category) => sum + category.documents.length, 0)

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="size-4" />
                Repositório de documentos
              </CardTitle>
              <CardDescription>
                Categorias e links exibidos nas abas do Bloco 4 da Home.
              </CardDescription>
            </div>
            <Badge variant="muted">
              {categories.length} categoria(s) · {totalDocuments} documento(s)
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {categories.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhuma categoria cadastrada. Crie a primeira no formulário abaixo.
            </p>
          ) : (
            categories.map((category) => {
              const Icon = resolveIcon(category.icon)

              return (
                <details key={category.id} className="group rounded-lg border border-border">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3 select-none">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="font-medium">{category.name}</span>
                    <Badge variant="outline">{category.documents.length} doc(s)</Badge>
                    <span className="ml-auto text-xs text-muted-foreground group-open:hidden">
                      Gerenciar
                    </span>
                  </summary>

                  <div className="space-y-4 border-t border-border p-4">
                    <section>
                      <h4 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        Dados da categoria
                      </h4>
                      <CategoryEditor category={category} />
                    </section>

                    <section>
                      <h4 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        Documentos
                      </h4>

                      {category.documents.length === 0 ? (
                        <p className="mb-3 text-sm text-muted-foreground">
                          Nenhum documento nesta categoria.
                        </p>
                      ) : (
                        <ul className="mb-3 space-y-2">
                          {category.documents.map((document) => {
                            const provider = getProviderMeta(document.provider)

                            return (
                              <li
                                key={document.id}
                                className="rounded-lg border border-border bg-card p-3"
                              >
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${provider.className}`}
                                  >
                                    {provider.label}
                                  </span>
                                  <a
                                    href={document.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="max-w-full truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
                                  >
                                    {document.url}
                                  </a>
                                </div>

                                <DocumentEditor
                                  categoryId={category.id}
                                  document={document}
                                  compact
                                />
                              </li>
                            )
                          })}
                        </ul>
                      )}

                      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                        <h5 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                          <Plus className="size-3.5" />
                          Adicionar documento em {category.name}
                        </h5>
                        <DocumentEditor categoryId={category.id} />
                      </div>
                    </section>
                  </div>
                </details>
              )
            })
          )}

          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Plus className="size-4" />
              Nova categoria
            </h3>
            <CategoryEditor />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
