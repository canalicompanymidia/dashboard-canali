import Link from 'next/link'
import {
  CheckCircle2,
  CircleAlert,
  FolderOpen,
  KeyRound,
  Layers,
  Megaphone,
  ShieldAlert,
  Target,
  Webhook,
} from 'lucide-react'

import { MetaSyncButton } from '@/components/admin/meta-sync-button'
import { isAdminGateEnabled } from '@/lib/admin/auth'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isVaultEncryptionConfigured } from '@/lib/crypto'
import { isMetaAdsConfigured } from '@/lib/integrations/meta-ads'
import { isServiceRoleConfigured, isSupabaseConfigured } from '@/lib/supabase/config'
import { isVaultConfigured } from '@/lib/vault'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const SHORTCUTS = [
  {
    href: '/admin/metas',
    icon: Target,
    title: 'Metas & EBITDA',
    description: 'Metas anuais e o fechamento financeiro mês a mês que alimenta o EBITDA.',
  },
  {
    href: '/admin/acoes',
    icon: Layers,
    title: 'Ações de marketing',
    description: 'Campanhas, funis e webinários exibidos no Bloco 3 da Home.',
  },
  {
    href: '/admin/documentos',
    icon: FolderOpen,
    title: 'Documentos',
    description: 'Categorias e links do repositório de materiais do time.',
  },
  {
    href: '/admin/cofre',
    icon: KeyRound,
    title: 'Cofre de senhas',
    description: 'Credenciais cifradas e troca da Senha Mestre.',
  },
]

export default async function AdminOverviewPage() {
  const vaultReady = await isVaultConfigured()

  const integrations = [
    {
      name: 'Supabase (leitura)',
      ok: isSupabaseConfigured(),
      hint: 'NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY',
    },
    {
      name: 'Supabase (escrita)',
      ok: isServiceRoleConfigured(),
      hint: 'SUPABASE_SERVICE_ROLE_KEY — necessária para webhooks e admin',
    },
    {
      name: 'Webhook Hotmart',
      ok: Boolean(process.env.HOTMART_HOTTOK),
      hint: 'HOTMART_HOTTOK',
    },
    {
      name: 'Webhook OnProfit',
      ok: Boolean(process.env.ONPROFIT_WEBHOOK_TOKEN || process.env.ONPROFIT_WEBHOOK_SECRET),
      hint: 'ONPROFIT_WEBHOOK_TOKEN ou ONPROFIT_WEBHOOK_SECRET',
    },
    {
      name: 'Webhook TMB',
      ok: Boolean(process.env.TMB_WEBHOOK_TOKEN || process.env.TMB_WEBHOOK_SECRET),
      hint: 'TMB_WEBHOOK_TOKEN ou TMB_WEBHOOK_SECRET',
    },
    {
      name: 'Meta Ads',
      ok: isMetaAdsConfigured(),
      hint: 'META_ADS_ACCESS_TOKEN + META_ADS_ACCOUNT_ID',
    },
    {
      name: 'Chave do cofre',
      ok: isVaultEncryptionConfigured(),
      hint: 'VAULT_ENCRYPTION_KEY — gere com npm run vault:keygen',
    },
    {
      name: 'Senha Mestre',
      ok: vaultReady,
      hint: 'VAULT_MASTER_PASSWORD_HASH ou cadastro pelo cofre',
    },
    {
      name: 'Job agendado',
      ok: Boolean(process.env.CRON_SECRET),
      hint: 'CRON_SECRET — protege a sincronização do Meta Ads',
    },
  ]

  const pending = integrations.filter((item) => !item.ok).length

  return (
    <div className="space-y-5">
      {isAdminGateEnabled() ? null : (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4">
          <ShieldAlert className="mt-0.5 size-4.5 shrink-0 text-warning-foreground dark:text-warning" />
          <div className="text-sm">
            <p className="font-semibold">Painel administrativo sem senha</p>
            <p className="mt-1 text-muted-foreground">
              Qualquer pessoa com o link consegue alterar metas, ações e documentos. Para exigir
              login, defina a variável{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                ADMIN_PASSWORD
              </code>{' '}
              e reinicie o servidor. O cofre de senhas já é protegido pela Senha Mestre,
              independentemente desta configuração.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map((shortcut) => (
          <Link
            key={shortcut.href}
            href={shortcut.href}
            className="group rounded-xl border border-border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
              <shortcut.icon className="size-4.5" />
            </span>
            <h2 className="mt-3 text-sm font-semibold">{shortcut.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{shortcut.description}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Status das integrações</CardTitle>
                <CardDescription>
                  Variáveis de ambiente detectadas neste servidor.
                </CardDescription>
              </div>
              <Badge variant={pending === 0 ? 'positive' : 'warning'}>
                {pending === 0 ? 'Tudo configurado' : `${pending} pendente(s)`}
              </Badge>
            </div>
          </CardHeader>

          <CardContent>
            <ul className="divide-y divide-border">
              {integrations.map((item) => (
                <li key={item.name} className="flex items-start gap-3 py-2.5">
                  {item.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        !item.ok && 'text-muted-foreground',
                      )}
                    >
                      {item.name}
                    </p>
                    <p className="font-mono text-[11px] break-words text-muted-foreground">
                      {item.hint}
                    </p>
                  </div>
                  <Badge variant={item.ok ? 'positive' : 'muted'}>
                    {item.ok ? 'OK' : 'Pendente'}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="size-4" />
                Meta Ads
              </CardTitle>
              <CardDescription>
                O gasto é puxado por job a cada 3 horas. Use o botão para atualizar na hora.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetaSyncButton disabled={!isMetaAdsConfigured() || !isServiceRoleConfigured()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="size-4" />
                Endpoints de webhook
              </CardTitle>
              <CardDescription>Cadastre estas URLs em cada plataforma.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {['hotmart', 'onprofit', 'tmb'].map((platform) => (
                <code
                  key={platform}
                  className="block rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] break-all"
                >
                  POST /api/webhooks/{platform}
                </code>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
