'use client'

import { Check, Plus, Trash2, UserRound } from 'lucide-react'

import { ActionForm, FormFeedback } from '@/components/admin/action-form'
import { Field, FieldGrid } from '@/components/admin/field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteColaborador, saveColaborador } from '@/app/admin/actions'
import { cn, formatDateTime } from '@/lib/utils'

export interface ColaboradorRow {
  id: string
  email: string
  nome: string | null
  papel: 'admin' | 'colaborador'
  ativo: boolean
  ultimo_acesso_em: string | null
}

const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

/** Cadastro de quem pode entrar. É a lista que o banco consulta no RLS. */
export function ColaboradoresAdmin({
  colaboradores,
  emailAtual,
}: {
  colaboradores: ColaboradorRow[]
  emailAtual: string
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Plus className="size-4" />
          Liberar acesso
        </h3>

        <ActionForm action={saveColaborador} resetOnSuccess className="space-y-3">
          {(pending, state) => (
            <>
              <FieldGrid columns={4}>
                <Field label="E-mail" htmlFor="novo-email" required>
                  <Input
                    id="novo-email"
                    name="email"
                    type="email"
                    placeholder="pessoa@canalicompany.com"
                    required
                  />
                </Field>

                <Field label="Nome" htmlFor="novo-nome">
                  <Input id="novo-nome" name="nome" placeholder="Nome da pessoa" />
                </Field>

                <Field
                  label="Papel"
                  htmlFor="novo-papel"
                  hint="Admin também abre este painel."
                >
                  <select id="novo-papel" name="papel" className={SELECT_CLASS}>
                    <option value="colaborador">Colaborador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </Field>

                <div className="flex items-end">
                  <Button type="submit" className="w-full" disabled={pending}>
                    {pending ? 'Salvando...' : 'Liberar acesso'}
                  </Button>
                </div>
              </FieldGrid>

              <input type="hidden" name="ativo" value="on" />
              <FormFeedback state={state} />
            </>
          )}
        </ActionForm>
      </div>

      {colaboradores.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Ninguém cadastrado ainda.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {colaboradores.map((pessoa) => {
            const ehVoce = pessoa.email === emailAtual

            return (
              <li key={pessoa.id} className="p-3">
                <ActionForm action={saveColaborador} className="space-y-2">
                  {(pending, state) => (
                    <>
                      <input type="hidden" name="id" value={pessoa.id} />
                      <input type="hidden" name="email" value={pessoa.email} />

                      <div className="flex flex-wrap items-center gap-2">
                        <UserRound
                          className={cn(
                            'size-4 shrink-0',
                            pessoa.ativo ? 'text-positive' : 'text-muted-foreground',
                          )}
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {pessoa.nome || pessoa.email}
                            {ehVoce ? (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                (você)
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {pessoa.email}
                          </p>
                        </div>

                        <span className="text-[11px] text-muted-foreground">
                          {pessoa.ultimo_acesso_em
                            ? `Último acesso ${formatDateTime(pessoa.ultimo_acesso_em)}`
                            : 'Nunca entrou'}
                        </span>

                        <Badge variant={pessoa.papel === 'admin' ? 'default' : 'muted'}>
                          {pessoa.papel === 'admin' ? 'Admin' : 'Colaborador'}
                        </Badge>

                        {pessoa.ativo ? null : <Badge variant="warning">Desativado</Badge>}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          name="nome"
                          defaultValue={pessoa.nome ?? ''}
                          placeholder="Nome"
                          className="h-8 max-w-48 text-xs"
                          aria-label={`Nome de ${pessoa.email}`}
                        />

                        <select
                          name="papel"
                          defaultValue={pessoa.papel}
                          className={cn(SELECT_CLASS, 'h-8 max-w-40 text-xs')}
                          aria-label={`Papel de ${pessoa.email}`}
                        >
                          <option value="colaborador">Colaborador</option>
                          <option value="admin">Administrador</option>
                        </select>

                        <label className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            name="ativo"
                            defaultChecked={pessoa.ativo}
                            className="size-3.5 accent-current"
                          />
                          Ativo
                        </label>

                        <Button type="submit" size="sm" variant="outline" disabled={pending}>
                          {pending ? '...' : 'Salvar'}
                        </Button>

                        {state?.ok ? (
                          <Check className="size-3.5 shrink-0 text-positive" aria-label="Salvo" />
                        ) : null}
                      </div>

                      {state && !state.ok ? <FormFeedback state={state} /> : null}
                    </>
                  )}
                </ActionForm>

                {ehVoce ? null : (
                  <ActionForm action={deleteColaborador} className="mt-2">
                    {(pending, state) => (
                      <>
                        <input type="hidden" name="id" value={pessoa.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                          Remover acesso
                        </Button>
                        {state && !state.ok ? <FormFeedback state={state} /> : null}
                      </>
                    )}
                  </ActionForm>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
