'use client'

import { Plus, Save } from 'lucide-react'

import { ActionForm, FormFeedback } from '@/components/admin/action-form'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { Field, FieldGrid } from '@/components/admin/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  deleteDocument,
  deleteDocumentCategory,
  saveDocument,
  saveDocumentCategory,
} from '@/app/admin/actions'
import { ACCENT_OPTIONS } from '@/lib/accents'
import { ICON_OPTIONS, PROVIDER_OPTIONS } from '@/lib/icons'
import type { DocumentCategory, DocumentItem } from '@/lib/types'

const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25'

/** Formulário de categoria do repositório. */
export function CategoryEditor({ category }: { category?: DocumentCategory }) {
  const isEdit = Boolean(category)
  const uid = category?.id ?? 'new-category'

  return (
    <ActionForm action={saveDocumentCategory} resetOnSuccess={!isEdit} className="space-y-3">
      {(pending, state) => (
        <>
          {category ? <input type="hidden" name="id" value={category.id} /> : null}

          <FieldGrid columns={4}>
            <Field label="Nome" htmlFor={`cat-name-${uid}`} required>
              <Input
                id={`cat-name-${uid}`}
                name="name"
                defaultValue={category?.name ?? ''}
                placeholder="Copywriting"
                required
              />
            </Field>

            <Field label="Ícone" htmlFor={`cat-icon-${uid}`}>
              <select
                id={`cat-icon-${uid}`}
                name="icon"
                defaultValue={category?.icon ?? 'Folder'}
                className={SELECT_CLASS}
              >
                {ICON_OPTIONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Cor" htmlFor={`cat-accent-${uid}`}>
              <select
                id={`cat-accent-${uid}`}
                name="accent"
                defaultValue={category?.accent ?? 'slate'}
                className={SELECT_CLASS}
              >
                {ACCENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ordem" htmlFor={`cat-order-${uid}`}>
              <Input
                id={`cat-order-${uid}`}
                name="sort_order"
                defaultValue={category?.sort_order ?? 0}
                inputMode="numeric"
              />
            </Field>
          </FieldGrid>

          <Field label="Descrição" htmlFor={`cat-desc-${uid}`}>
            <Textarea
              id={`cat-desc-${uid}`}
              name="description"
              defaultValue={category?.description ?? ''}
              rows={2}
              placeholder="O que esta categoria reúne."
            />
          </Field>

          <FormFeedback state={state} />

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {isEdit ? <Save className="size-4" /> : <Plus className="size-4" />}
              {pending ? 'Salvando...' : isEdit ? 'Salvar categoria' : 'Criar categoria'}
            </Button>

            {category ? (
              <ConfirmDelete
                action={deleteDocumentCategory}
                id={category.id}
                itemName={category.name}
                label="categoria"
                warning="Todos os documentos desta categoria também serão excluídos."
              />
            ) : null}
          </div>
        </>
      )}
    </ActionForm>
  )
}

/** Formulário de documento/link. */
export function DocumentEditor({
  categoryId,
  document,
  compact = false,
}: {
  categoryId: string
  document?: DocumentItem
  compact?: boolean
}) {
  const isEdit = Boolean(document)
  const uid = document?.id ?? `new-doc-${categoryId}`

  return (
    <ActionForm action={saveDocument} resetOnSuccess={!isEdit} className="space-y-2.5">
      {(pending, state) => (
        <>
          {document ? <input type="hidden" name="id" value={document.id} /> : null}
          <input type="hidden" name="category_id" value={document?.category_id ?? categoryId} />

          <FieldGrid columns={compact ? 2 : 3}>
            <Field label="Título" htmlFor={`doc-title-${uid}`} required>
              <Input
                id={`doc-title-${uid}`}
                name="title"
                defaultValue={document?.title ?? ''}
                placeholder="Banco de Headlines"
                required
              />
            </Field>

            <Field label="URL" htmlFor={`doc-url-${uid}`} required>
              <Input
                id={`doc-url-${uid}`}
                name="url"
                type="url"
                defaultValue={document?.url ?? ''}
                placeholder="https://drive.google.com/..."
                required
              />
            </Field>

            <Field label="Origem" htmlFor={`doc-provider-${uid}`}>
              <select
                id={`doc-provider-${uid}`}
                name="provider"
                defaultValue={document?.provider ?? 'link'}
                className={SELECT_CLASS}
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </FieldGrid>

          <FieldGrid columns={3}>
            <Field label="Descrição" htmlFor={`doc-desc-${uid}`} className="sm:col-span-2">
              <Input
                id={`doc-desc-${uid}`}
                name="description"
                defaultValue={document?.description ?? ''}
                placeholder="Resumo do conteúdo."
              />
            </Field>

            <Field label="Tags" htmlFor={`doc-tags-${uid}`} hint="Separadas por vírgula.">
              <Input
                id={`doc-tags-${uid}`}
                name="tags"
                defaultValue={document?.tags?.join(', ') ?? ''}
                placeholder="copy, headline"
              />
            </Field>
          </FieldGrid>

          <input type="hidden" name="sort_order" value={document?.sort_order ?? 0} />

          <FormFeedback state={state} />

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant={isEdit ? 'outline' : 'default'} disabled={pending}>
              {isEdit ? <Save className="size-4" /> : <Plus className="size-4" />}
              {pending ? 'Salvando...' : isEdit ? 'Salvar' : 'Adicionar documento'}
            </Button>

            {document ? (
              <ConfirmDelete
                action={deleteDocument}
                id={document.id}
                itemName={document.title}
                label="documento"
              />
            ) : null}
          </div>
        </>
      )}
    </ActionForm>
  )
}
