import { AlertTriangle, KeyRound, Lock, Plus, ShieldCheck, UserCog } from 'lucide-react'

import {
  CredentialEditor,
  DesbloquearPerfilButton,
  MasterPasswordForm,
  PerfilEditor,
  VaultLockButton,
  VaultUnlockGate,
} from '@/components/admin/vault-admin'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isVaultEncryptionConfigured } from '@/lib/crypto'
import {
  getVaultCredentialsMetadata,
  hasMasterSession,
  isVaultConfigured,
  listSubcategorias,
  listVaultProfiles,
} from '@/lib/vault'
import { formatDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function AdminVaultPage() {
  const encryptionReady = isVaultEncryptionConfigured()
  // Gerenciar o cofre exige acesso Master: um colaborador com PIN lê o que
  // foi liberado para ele, mas nunca administra credenciais ou permissões.
  const [unlocked, vaultReady] = await Promise.all([hasMasterSession(), isVaultConfigured()])

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
            A chave de criptografia já está configurada. Falta cadastrar a senha que dá acesso
            total ao cofre.
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

  const [credentials, subcategorias, perfis] = await Promise.all([
    getVaultCredentialsMetadata(),
    listSubcategorias(),
    listVaultProfiles(),
  ])

  const semSubcategoria = credentials.filter((c) => !c.subcategoria).length

  const byCategory = new Map<string, typeof credentials>()
  for (const credential of credentials) {
    const list = byCategory.get(credential.category) ?? []
    list.push(credential)
    byCategory.set(credential.category, list)
  }

  const agora = Date.now()

  return (
    <div className="space-y-5">
      {/* ---------------- Credenciais ---------------- */}
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
          {semSubcategoria > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Lock className="mt-px size-3.5 shrink-0" />
              <span>
                <strong className="text-foreground">
                  {semSubcategoria} credencial(is) sem subcategoria
                </strong>{' '}
                — visíveis apenas no acesso Master. Para liberar a alguém do time, atribua uma
                subcategoria e marque-a no perfil da pessoa.
              </span>
            </p>
          ) : null}

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

                        {credential.subcategoria ? (
                          <Badge variant="outline">{credential.subcategoria}</Badge>
                        ) : (
                          <Badge variant="muted">
                            <Lock className="size-3" />
                            só Master
                          </Badge>
                        )}

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
                          <CredentialEditor
                            credential={credential}
                            subcategorias={subcategorias}
                          />
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
            <CredentialEditor subcategorias={subcategorias} />
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Gestão de acessos ---------------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="size-4" />
                Gestão de Acessos do Cofre
              </CardTitle>
              <CardDescription>
                Cada colaborador entra na Home com o próprio nome e um PIN de 4 dígitos, e vê
                apenas as subcategorias liberadas aqui.
              </CardDescription>
            </div>
            <Badge variant="muted">{perfis.length} perfil(is)</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Um PIN de 4 dígitos tem 10.000 combinações. Para que isso não seja frágil, o cofre
            bloqueia o perfil por 15 minutos após 5 erros seguidos — e você pode liberar antes
            pelo botão <strong className="text-foreground">Desbloquear</strong>. Trocar o PIN
            também destrava.
          </p>

          {perfis.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhum perfil cadastrado. Enquanto isso, o cofre só abre pela Senha Mestre.
            </p>
          ) : (
            <ul className="space-y-2">
              {perfis.map((perfil) => {
                const bloqueado =
                  Boolean(perfil.bloqueado_ate) && new Date(perfil.bloqueado_ate!).getTime() > agora

                return (
                  <li key={perfil.id} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{perfil.nome_colaborador}</span>

                      {!perfil.ativo ? <Badge variant="muted">Inativo</Badge> : null}
                      {bloqueado ? <Badge variant="negative">Bloqueado</Badge> : null}

                      {perfil.subcategorias_permitidas.length === 0 ? (
                        <Badge variant="warning">Sem permissão</Badge>
                      ) : (
                        perfil.subcategorias_permitidas.map((sub) => (
                          <Badge key={sub} variant="outline">
                            {sub}
                          </Badge>
                        ))
                      )}

                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {perfil.ultimo_acesso_em
                          ? `último acesso em ${formatDateTime(perfil.ultimo_acesso_em)}`
                          : 'nunca acessou'}
                      </span>
                    </div>

                    {bloqueado ? (
                      <div className="mb-2">
                        <DesbloquearPerfilButton perfilId={perfil.id} />
                      </div>
                    ) : null}

                    <details className="group">
                      <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">
                        Editar perfil
                      </summary>
                      <div className="mt-3">
                        <PerfilEditor perfil={perfil} subcategorias={subcategorias} />
                      </div>
                    </details>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Plus className="size-4" />
              Novo colaborador
            </h3>
            <PerfilEditor subcategorias={subcategorias} />
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Senha Mestre ---------------- */}
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
