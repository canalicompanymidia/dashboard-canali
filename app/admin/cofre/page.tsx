import { AlertTriangle, KeyRound, Plus, ShieldCheck } from 'lucide-react'

import {
  CredentialEditor,
  MasterPasswordForm,
  VaultLockButton,
  VaultUnlockGate,
} from '@/components/admin/vault-admin'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isVaultEncryptionConfigured } from '@/lib/crypto'
import { getVaultCredentialsMetadata, hasVaultSession, isVaultConfigured } from '@/lib/vault'
import { formatDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function AdminVaultPage() {
  const encryptionReady = isVaultEncryptionConfigured()
  const [unlocked, vaultReady] = await Promise.all([hasVaultSession(), isVaultConfigured()])

  // Sem chave de criptografia não há como cifrar nada — bloqueia antes de tudo.
  if (!encryptionReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning-foreground dark:text-warning" />
            Cofre não configurado
          </CardTitle>
          <CardDescription>
            Falta a chave de criptografia. Sem ela nenhuma senha pode ser gravada com segurança.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          <ol className="space-y-2">
            <li className="flex gap-2">
              <span className="font-semibold text-muted-foreground tabular">1.</span>
              <span>
                Gere a chave:{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  npm run vault:keygen
                </code>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-muted-foreground tabular">2.</span>
              <span>
                Copie o valor para{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  VAULT_ENCRYPTION_KEY
                </code>{' '}
                no <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-muted-foreground tabular">3.</span>
              <span>
                Gere o hash da Senha Mestre:{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  npm run vault:hash
                </code>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-muted-foreground tabular">4.</span>
              <span>Reinicie o servidor.</span>
            </li>
          </ol>

          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Guarde a <code className="font-mono">VAULT_ENCRYPTION_KEY</code> em local seguro. Trocá-la
            torna ilegíveis todas as senhas já cifradas.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!vaultReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Defina a Senha Mestre
          </CardTitle>
          <CardDescription>
            A chave de criptografia já está configurada. Falta cadastrar a senha que libera o
            cofre para o time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MasterPasswordForm envOverride={false} />
        </CardContent>
      </Card>
    )
  }

  if (!unlocked) {
    return (
      <Card>
        <CardContent className="pt-5">
          <VaultUnlockGate />
        </CardContent>
      </Card>
    )
  }

  const credentials = await getVaultCredentialsMetadata()
  const byCategory = new Map<string, typeof credentials>()
  for (const credential of credentials) {
    const list = byCategory.get(credential.category) ?? []
    list.push(credential)
    byCategory.set(credential.category, list)
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4" />
                Credenciais do cofre
              </CardTitle>
              <CardDescription>
                As senhas são cifradas com AES-256-GCM antes de ir para o banco e nunca aparecem
                nesta tela.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="positive">{credentials.length} credencial(is)</Badge>
              <VaultLockButton />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {credentials.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhuma credencial cadastrada. Adicione a primeira no formulário abaixo.
            </p>
          ) : (
            [...byCategory.entries()].map(([category, items]) => (
              <section key={category}>
                <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {category}
                </h3>

                <ul className="space-y-2">
                  {items.map((credential) => (
                    <li key={credential.id} className="rounded-lg border border-border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{credential.service_name}</span>
                        {credential.username ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                            {credential.username}
                          </code>
                        ) : null}
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          atualizado em {formatDateTime(credential.updated_at)}
                        </span>
                      </div>

                      <details className="group">
                        <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">
                          Editar credencial
                        </summary>
                        <div className="mt-3">
                          <CredentialEditor credential={credential} />
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Plus className="size-4" />
              Nova credencial
            </h3>
            <CredentialEditor />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Senha Mestre
          </CardTitle>
          <CardDescription>
            Trocar a Senha Mestre não afeta as credenciais já cifradas — são chaves independentes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MasterPasswordForm envOverride={Boolean(process.env.VAULT_MASTER_PASSWORD_HASH)} />
        </CardContent>
      </Card>
    </div>
  )
}
