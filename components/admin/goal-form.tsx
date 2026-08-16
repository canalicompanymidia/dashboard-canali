'use client'

import * as React from 'react'
import { Plus, Save } from 'lucide-react'

import { ActionForm, FormFeedback } from '@/components/admin/action-form'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { Field, FieldGrid } from '@/components/admin/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { deleteAnnualGoal, saveAnnualGoal } from '@/app/admin/actions'
import { ACCENT_OPTIONS } from '@/lib/accents'
import type { AnnualGoal } from '@/lib/types'

interface GoalFormProps {
  goal?: AnnualGoal
  defaultYear: number
}

/** Formulário de meta anual — mesmo componente cria e edita. */
export function GoalForm({ goal, defaultYear }: GoalFormProps) {
  const isEdit = Boolean(goal)
  const [isActive, setIsActive] = React.useState(goal?.is_active ?? true)

  return (
    <ActionForm action={saveAnnualGoal} resetOnSuccess={!isEdit} className="space-y-3">
      {(pending, state) => (
        <>
          {goal ? <input type="hidden" name="id" value={goal.id} /> : null}
          {/* Switch do Radix não envia valor no form: o hidden carrega o estado. */}
          <input type="hidden" name="is_active" value={isActive ? 'on' : ''} />

          <FieldGrid columns={4}>
            <Field label="Identificação" htmlFor={`label-${goal?.id ?? 'new'}`} required>
              <Input
                id={`label-${goal?.id ?? 'new'}`}
                name="label"
                defaultValue={goal?.label ?? ''}
                placeholder="META 1"
                required
              />
            </Field>

            <Field label="Ano" htmlFor={`year-${goal?.id ?? 'new'}`} required>
              <Input
                id={`year-${goal?.id ?? 'new'}`}
                name="year"
                defaultValue={goal?.year ?? defaultYear}
                inputMode="numeric"
                required
              />
            </Field>

            <Field
              label="Meta de faturamento"
              htmlFor={`target-${goal?.id ?? 'new'}`}
              hint="Ex.: 12.168.000,00"
              required
            >
              <Input
                id={`target-${goal?.id ?? 'new'}`}
                name="target_revenue"
                defaultValue={goal?.target_revenue ?? ''}
                inputMode="decimal"
                placeholder="12.168.000,00"
                required
              />
            </Field>

            <Field
              label="Objetivo de EBITDA (%)"
              htmlFor={`ebitda-${goal?.id ?? 'new'}`}
              hint="Ex.: 22,5"
              required
            >
              <Input
                id={`ebitda-${goal?.id ?? 'new'}`}
                name="target_ebitda_pct"
                defaultValue={goal?.target_ebitda_pct ?? ''}
                inputMode="decimal"
                placeholder="22,5"
                required
              />
            </Field>
          </FieldGrid>

          <Field label="Descrição" htmlFor={`desc-${goal?.id ?? 'new'}`}>
            <Textarea
              id={`desc-${goal?.id ?? 'new'}`}
              name="description"
              defaultValue={goal?.description ?? ''}
              placeholder="Contexto da meta exibido no painel."
              rows={2}
            />
          </Field>

          <FieldGrid columns={3}>
            <Field label="Cor do painel" htmlFor={`accent-${goal?.id ?? 'new'}`}>
              <select
                id={`accent-${goal?.id ?? 'new'}`}
                name="accent"
                defaultValue={goal?.accent ?? 'emerald'}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
              >
                {ACCENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ordem" htmlFor={`order-${goal?.id ?? 'new'}`}>
              <Input
                id={`order-${goal?.id ?? 'new'}`}
                name="sort_order"
                defaultValue={goal?.sort_order ?? 0}
                inputMode="numeric"
              />
            </Field>

            <div className="flex items-end pb-1.5">
              <div className="flex items-center gap-2">
                <Switch
                  id={`active-${goal?.id ?? 'new'}`}
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label htmlFor={`active-${goal?.id ?? 'new'}`}>Exibir na Home</Label>
              </div>
            </div>
          </FieldGrid>

          <FormFeedback state={state} />

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending} size="sm">
              {isEdit ? <Save className="size-4" /> : <Plus className="size-4" />}
              {pending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar meta'}
            </Button>

            {goal ? (
              <ConfirmDelete
                action={deleteAnnualGoal}
                id={goal.id}
                itemName={`${goal.label} (${goal.year})`}
                label="meta"
              />
            ) : null}
          </div>
        </>
      )}
    </ActionForm>
  )
}
