import type { Metadata } from 'next'

import { AdminNav } from '@/components/admin/admin-nav'

export const metadata: Metadata = {
  title: 'Painel Administrativo',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Painel Administrativo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alimente os dados que aparecem na Home: metas, ações, documentos e credenciais.
        </p>
      </header>

      <AdminNav />

      <div className="mt-5">{children}</div>
    </div>
  )
}
