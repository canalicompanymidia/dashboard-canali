import { Layers, Plus } from 'lucide-react'

import { ActionEditor, ActionStatusToggle } from '@/components/admin/action-editor'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getMarketingActions } from '@/lib/data'

export const dynamic = 'force-dynamic'

const STATUS_LABEL = {
  active: 'Ativa',
  paused: 'Pausada',
  draft: 'Rascunho',
  archived: 'Arquivada',
} as const

export default async function AdminActionsPage() {
  const actions = await getMarketingActions({ includeInactive: true })

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-4" />
                Ações de marketing
              </CardTitle>
              <CardDescription>
                Campanhas, funis e webinários exibidos no Bloco 3. Rascunhos e arquivadas ficam
                ocultos na Home.
              </CardDescription>
            </div>
            <Badge variant="muted">{actions.length} ação(ões)</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {actions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhuma ação cadastrada. Crie a primeira no formulário abaixo.
            </p>
          ) : (
            actions.map((action) => (
              <details
                key={action.id}
                className="group rounded-lg border border-border open:bg-muted/20"
              >
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3 select-none">
                  <span className="font-medium">{action.title}</span>

                  {action.category ? (
                    <Badge variant="outline">{action.category}</Badge>
                  ) : null}

                  <Badge variant={action.status === 'active' ? 'positive' : 'muted'}>
                    {STATUS_LABEL[action.status]}
                  </Badge>

                  {action.owner_name ? (
                    <span className="text-xs text-muted-foreground">{action.owner_name}</span>
                  ) : null}

                  <span className="ml-auto text-xs text-muted-foreground group-open:hidden">
                    Editar
                  </span>
                </summary>

                <div className="space-y-3 border-t border-border p-4">
                  <ActionStatusToggle action={action} />
                  <ActionEditor action={action} />
                </div>
              </details>
            ))
          )}

          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Plus className="size-4" />
              Nova ação
            </h3>
            <ActionEditor />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
