import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'

import { AdminLoginForm } from '@/components/admin/admin-login-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isAdminGateEnabled } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  // Sem ADMIN_PASSWORD não existe login a fazer — volta direto ao painel.
  if (!isAdminGateEnabled()) redirect('/admin')

  const { from } = await searchParams

  return (
    <div className="mx-auto max-w-sm py-8">
      <Card>
        <CardHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/8 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <CardTitle>Acesso ao painel</CardTitle>
          <CardDescription>
            Informe a senha do painel administrativo para continuar.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <AdminLoginForm redirectTo={from && from.startsWith('/admin') ? from : '/admin'} />
        </CardContent>
      </Card>
    </div>
  )
}
