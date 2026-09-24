import { Download } from 'lucide-react'

import { ClickupImport } from '@/components/admin/clickup-import'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Cada passo da importação é uma chamada curta, mas uma página de 100
// tarefas com muitos campos pode passar do padrão da Vercel.
export const maxDuration = 60

export default async function AdminClickupPage() {
  await requireAdmin()

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="size-4" />
            Importar do ClickUp
          </CardTitle>
          <CardDescription>
            Traz espaços, pastas, listas e tarefas do ClickUp para o Tasks. Pode rodar mais de uma vez:
            o que já veio é atualizado, não duplicado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClickupImport />
        </CardContent>
      </Card>
    </div>
  )
}
