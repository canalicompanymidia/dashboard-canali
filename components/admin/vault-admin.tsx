'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, KeyRound, Lock, LockOpen, Plus, Save, ShieldCheck } from 'lucide-react'

import { ActionForm, FormFeedback } from '@/components/admin/action-form'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { Field, FieldGrid } from '@/components/admin/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { deleteVaultCredential, saveVaultCredential, updateMasterPassword } from '@/app/admin/actions'
import type { VaultCredential } from '@/lib/types'

type CredentialMeta = Omit<VaultCredential, 'password'>

/**
 * Portão do cofre no admin.
 *
 * Gerenciar credenciais exige a mesma Senha Mestre que ler — não faria
 * sentido proteger a leitura e deixar a escrita aberta.
 */
export function VaultUnlockGate() {
  const router = useRouter()
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/vault/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const payload = (await response.json()) as { ok: boolean; error?: string }

      if (!payload.ok) {
        setError(payload.error ?? 'Não foi possível liberar o cofre.')
        return
      }

      setPassword('')
      // O cookie de sessão já foi gravado: recarregar a rota faz o servidor
      // renderizar a lista de credenciais.
      router.refresh()
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={unlock} className="mx-auto max-w-sm space-y-3 py-6 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-primary/8 text-primary">
        <Lock className="size-5" />
      </span>

      <div>
        <h3 className="text-base font-semibold">Cofre bloqueado</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe a Senha Mestre para gerenciar as credenciais.
        </p>
      </div>

      <Input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Senha Mestre"
        autoComplete="off"
        aria-label="Senha Mestre"
        aria-invalid={Boolean(error)}
      />

      {error ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-left text-xs text-destructive">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={loading || !password}>
        <LockOpen className="size-4" />
        {loading ? 'Validando...' : 'Liberar acesso'}
      </Button>
    </form>
  )
}

/** Formulário de credencial. A senha é cifrada no servidor antes de gravar. */
export function CredentialEditor({ credential }: { credential?: CredentialMeta }) {
  const isEdit = Boolean(credential)
  const uid = credential?.id ?? 'new-credential'

  return (
    <ActionForm action={saveVaultCredential} resetOnSuccess={!isEdit} className="space-y-3">
      {(pending, state) => (
        <>
          {credential ? <input type="hidden" name="id" value={credential.id} /> : null}

          <FieldGrid columns={4}>
            <Field label="Serviço" htmlFor={`cred-name-${uid}`} required>
              <Input
                id={`cred-name-${uid}`}
                name="service_name"
                defaultValue={credential?.service_name ?? ''}
                placeholder="Meta Business"
                required
              />
            </Field>

            <Field label="Categoria" htmlFor={`cred-cat-${uid}`} required>
              <Input
                id={`cred-cat-${uid}`}
                name="category"
                defaultValue={credential?.category ?? 'Geral'}
                placeholder="Tráfego"
                required
              />
            </Field>

            <Field label="Usuário / e-mail" htmlFor={`cred-user-${uid}`}>
              <Input
                id={`cred-user-${uid}`}
                name="username"
                defaultValue={credential?.username ?? ''}
                autoComplete="off"
                placeholder="time@canali.com"
              />
            </Field>

            <Field
              label="Senha"
              htmlFor={`cred-pass-${uid}`}
              hint={isEdit ? 'Deixe em branco para manter a atual.' : 'Cifrada com AES-256-GCM.'}
            >
              <Input
                id={`cred-pass-${uid}`}
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder={isEdit ? '••••••••' : 'Senha do serviço'}
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={3}>
            <Field label="URL de acesso" htmlFor={`cred-url-${uid}`} className="sm:col-span-2">
              <Input
                id={`cred-url-${uid}`}
                name="url"
                defaultValue={credential?.url ?? ''}
                placeholder="https://business.facebook.com"
              />
            </Field>

            <Field label="Ordem" htmlFor={`cred-order-${uid}`}>
              <Input
                id={`cred-order-${uid}`}
                name="sort_order"
                defaultValue={credential?.sort_order ?? 0}
                inputMode="numeric"
              />
            </Field>
          </FieldGrid>

          <Field label="Observações" htmlFor={`cred-notes-${uid}`}>
            <Textarea
              id={`cred-notes-${uid}`}
              name="notes"
              defaultValue={credential?.notes ?? ''}
              rows={2}
              placeholder="Autenticação em duas etapas no celular do gestor, etc."
            />
          </Field>

          <FormFeedback state={state} />

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant={isEdit ? 'outline' : 'default'} disabled={pending}>
              {isEdit ? <Save className="size-4" /> : <Plus className="size-4" />}
              {pending ? 'Salvando...' : isEdit ? 'Salvar credencial' : 'Adicionar credencial'}
            </Button>

            {credential ? (
              <ConfirmDelete
                action={deleteVaultCredential}
                id={credential.id}
                itemName={credential.service_name}
                label="credencial"
              />
            ) : null}
          </div>
        </>
      )}
    </ActionForm>
  )
}

/** Troca da Senha Mestre. Grava apenas o hash scrypt. */
export function MasterPasswordForm({ envOverride }: { envOverride: boolean }) {
  return (
    <ActionForm action={updateMasterPassword} resetOnSuccess className="space-y-3">
      {(pending, state) => (
        <>
          {envOverride ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2.5 text-xs">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning-foreground dark:text-warning" />
              <span>
                <code className="font-mono">VAULT_MASTER_PASSWORD_HASH</code> está definida no
                ambiente e tem precedência sobre o que for salvo aqui. Remova a variável para
                gerenciar a senha por esta tela.
              </span>
            </p>
          ) : null}

          <FieldGrid columns={2}>
            <Field label="Nova Senha Mestre" htmlFor="master-new" required>
              <Input
                id="master-new"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                placeholder="Mínimo de 8 caracteres"
                required
              />
            </Field>

            <Field label="Confirmar senha" htmlFor="master-confirm" required>
              <Input
                id="master-confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
          </FieldGrid>

          <FormFeedback state={state} />

          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            <ShieldCheck className="size-4" />
            {pending ? 'Salvando...' : 'Atualizar Senha Mestre'}
          </Button>
        </>
      )}
    </ActionForm>
  )
}

/** Botão de bloqueio manual do cofre no admin. */
export function VaultLockButton() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function lock() {
    startTransition(async () => {
      await fetch('/api/vault/lock', { method: 'POST' })
      router.refresh()
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={lock} disabled={pending}>
      <KeyRound className="size-3.5" />
      {pending ? 'Bloqueando...' : 'Bloquear cofre'}
    </Button>
  )
}
