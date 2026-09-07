import { ShieldCheck, Users } from 'lucide-react'

import {
  ColaboradoresAdmin,
  type ColaboradorRow,
} from '@/components/admin/colaboradores-admin'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function listarColaboradores(): Promise<ColaboradorRow[]> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('colaboradores_autorizados')
    .select('id, email, nome, papel, ativo, ultimo_acesso_em')
    .order('papel', { ascending: true })
    .order('email', { ascending: true })

  if (error || !data) return []
  return data as ColaboradorRow[]
}

export default async function AdminColaboradoresPage() {
  const admin = await requireAdmin()
  const colaboradores = await listarColaboradores()

  const ativos = colaboradores.filter((c) => c.ativo).length
  const admins = colaboradores.filter((c) => c.ativo && c.papel === 'admin').length

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" />
                Quem pode entrar no Hub
              </CardTitle>
              <CardDescription>
                Só os e-mails desta lista abrem o Hub. Estar logado no Supabase não basta.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="positive">{ativos} com acesso</Badge>
              <Badge variant="muted">{admins} admin</Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <p>
                <strong className="text-foreground">Adicione o e-mail e clique em Enviar
                convite.</strong> A pessoa recebe um link para criar a{' '}
                <strong className="text-foreground">senha individual dela</strong> — mínimo de 8
                caracteres, com maiúscula, minúscula, número e caractere especial. O link vale uma
                hora e só funciona uma vez.
              </p>
              <p>
                <strong className="text-foreground">Desmarcar &quot;Ativo&quot; corta o acesso na
                hora</strong>, inclusive de quem já está com a sessão aberta: a permissão é lida do
                banco a cada tela, nunca gravada no cookie. É o que usar quando alguém sai da
                empresa.
              </p>
              <p>
                Esta lista é a mesma que o banco de dados consulta. Quem não está aqui não lê nada,
                nem pelo Hub nem por fora dele.
              </p>
            </div>
          </div>

          <ColaboradoresAdmin colaboradores={colaboradores} emailAtual={admin.email} />
        </CardContent>
      </Card>
    </div>
  )
}
