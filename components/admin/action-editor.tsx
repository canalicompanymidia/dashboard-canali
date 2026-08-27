'use client'

import * as React from 'react'
import { PauseCircle, PlayCircle, Plus, Save } from 'lucide-react'

import { ActionForm, FormFeedback } from '@/components/admin/action-form'
import { ConfirmDelete } from '@/components/admin/confirm-delete'
import { Field, FieldGrid } from '@/components/admin/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { deleteMarketingAction, saveMarketingAction, setActionStatus } from '@/app/admin/actions'
import { ACCENT_OPTIONS } from '@/lib/accents'
import { DIAS_SEMANA } from '@/lib/dias-semana'
import type { ActionLink, MarketingAction } from '@/lib/types'

const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25'

/** Converte a lista de links em texto editável, um por linha. */
function linksToText(links: ActionLink[] | undefined): string {
  if (!links || links.length === 0) return ''
  return links.map((link) => `${link.label} | ${link.url}`).join('\n')
}

/** Formulário completo de uma ação de marketing (cria e edita). */
export function ActionEditor({ action }: { action?: MarketingAction }) {
  const isEdit = Boolean(action)
  const uid = action?.id ?? 'new'

  return (
    <ActionForm action={saveMarketingAction} resetOnSuccess={!isEdit} className="space-y-3">
      {(pending, state) => (
        <>
          {action ? (
            <>
              <input type="hidden" name="id" value={action.id} />
              {/* Reenvia o slug atual para que editar o título não mude o
                  identificador de uma ação já publicada. */}
              <input type="hidden" name="slug" value={action.slug} />
            </>
          ) : null}

          <FieldGrid columns={2}>
            <Field label="Título" htmlFor={`title-${uid}`} required>
              <Input
                id={`title-${uid}`}
                name="title"
                defaultValue={action?.title ?? ''}
                placeholder="Funil de Entrada (VSL)"
                required
              />
            </Field>

            <Field label="Subtítulo" htmlFor={`subtitle-${uid}`} hint="Aparece abaixo do título no card.">
              <Input
                id={`subtitle-${uid}`}
                name="subtitle"
                defaultValue={action?.subtitle ?? ''}
                placeholder="Aquisição fria via vídeo de vendas"
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={3}>
            <Field label="Categoria" htmlFor={`category-${uid}`}>
              <Input
                id={`category-${uid}`}
                name="category"
                defaultValue={action?.category ?? ''}
                placeholder="Funil, Webinário..."
              />
            </Field>

            <Field
              label="Dia da semana"
              htmlFor={`dia-${uid}`}
              hint="Para ações recorrentes. Vira uma tag no card da Home."
            >
              <select
                id={`dia-${uid}`}
                name="dia_semana"
                defaultValue={action?.dia_semana ?? ''}
                className={SELECT_CLASS}
              >
                <option value="">Não se aplica</option>
                {DIAS_SEMANA.map((dia) => (
                  <option key={dia.codigo} value={dia.codigo}>
                    {dia.nome}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status" htmlFor={`status-${uid}`}>
              <select
                id={`status-${uid}`}
                name="status"
                defaultValue={action?.status ?? 'active'}
                className={SELECT_CLASS}
              >
                <option value="active">Ativa</option>
                <option value="paused">Pausada</option>
                <option value="draft">Rascunho</option>
                <option value="archived">Arquivada</option>
              </select>
            </Field>

            <Field label="Cor do card" htmlFor={`accent-${uid}`}>
              <select
                id={`accent-${uid}`}
                name="accent"
                defaultValue={action?.accent ?? 'emerald'}
                className={SELECT_CLASS}
              >
                {ACCENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ordem" htmlFor={`order-${uid}`}>
              <Input
                id={`order-${uid}`}
                name="sort_order"
                defaultValue={action?.sort_order ?? 0}
                inputMode="numeric"
              />
            </Field>
          </FieldGrid>

          <Field
            label="Descrição detalhada"
            htmlFor={`description-${uid}`}
            hint="Texto exibido no modal, explicando o funcionamento da ação."
          >
            <Textarea
              id={`description-${uid}`}
              name="description"
              defaultValue={action?.description ?? ''}
              rows={3}
            />
          </Field>

          <Field
            label="Fluxo da operação"
            htmlFor={`how-${uid}`}
            hint="Uma etapa por linha. Cada linha vira um passo numerado no modal."
          >
            <Textarea
              id={`how-${uid}`}
              name="how_it_works"
              defaultValue={action?.how_it_works ?? ''}
              rows={5}
              placeholder={'Anúncio no Meta Ads leva à landing page\nLead assiste à VSL\nCTA libera o checkout'}
            />
          </Field>

          <FieldGrid columns={2}>
            <Field label="Imagem de capa (URL)" htmlFor={`image-${uid}`}>
              <Input
                id={`image-${uid}`}
                name="image_url"
                defaultValue={action?.image_url ?? ''}
                placeholder="https://..."
              />
            </Field>

            <Field
              label="Fluxograma (URL)"
              htmlFor={`flow-${uid}`}
              hint="Imagem exibida no modal. Se vazio, usa a capa."
            >
              <Input
                id={`flow-${uid}`}
                name="flow_image_url"
                defaultValue={action?.flow_image_url ?? ''}
                placeholder="https://..."
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={3}>
            <Field label="Público-alvo" htmlFor={`audience-${uid}`}>
              <Input
                id={`audience-${uid}`}
                name="target_audience"
                defaultValue={action?.target_audience ?? ''}
                placeholder="Público frio, empreendedores..."
              />
            </Field>

            <Field label="Responsável interno" htmlFor={`owner-${uid}`}>
              <Input
                id={`owner-${uid}`}
                name="owner_name"
                defaultValue={action?.owner_name ?? ''}
                placeholder="Time de Tráfego"
              />
            </Field>

            <Field label="E-mail do responsável" htmlFor={`owner-email-${uid}`}>
              <Input
                id={`owner-email-${uid}`}
                name="owner_email"
                type="email"
                defaultValue={action?.owner_email ?? ''}
                placeholder="time@canali.com"
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={2}>
            <Field
              label="Links úteis"
              htmlFor={`links-${uid}`}
              hint="Um por linha, no formato: Rótulo | https://url"
            >
              <Textarea
                id={`links-${uid}`}
                name="links"
                defaultValue={linksToText(action?.links)}
                rows={3}
                placeholder={'Landing Page | https://exemplo.com\nPainel Vturb | https://vturb.com.br'}
              />
            </Field>

            <Field
              label="Briefings associados"
              htmlFor={`briefings-${uid}`}
              hint="Um por linha, no formato: Rótulo | https://url"
            >
              <Textarea
                id={`briefings-${uid}`}
                name="briefings"
                defaultValue={linksToText(action?.briefings)}
                rows={3}
                placeholder="Briefing de Copy | https://drive.google.com/..."
              />
            </Field>
          </FieldGrid>

          <FormFeedback state={state} />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {isEdit ? <Save className="size-4" /> : <Plus className="size-4" />}
              {pending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar ação'}
            </Button>

            {/* ConfirmDelete só renderiza um botão aqui — o <form> dele vive
                dentro do Dialog, que o Radix monta em portal fora deste form. */}
            {action ? (
              <ConfirmDelete
                action={deleteMarketingAction}
                id={action.id}
                itemName={action.title}
                label="ação"
              />
            ) : null}
          </div>
        </>
      )}
    </ActionForm>
  )
}

/**
 * Pausar/reativar em um clique.
 *
 * Componente separado, renderizado FORA do ActionEditor: um <form> não pode
 * conter outro, então este precisa ser irmão do formulário de edição.
 */
export function ActionStatusToggle({ action }: { action: MarketingAction }) {
  const isActive = action.status === 'active'

  return (
    <ActionForm action={setActionStatus}>
      {(pending) => (
        <>
          <input type="hidden" name="id" value={action.id} />
          <input type="hidden" name="status" value={isActive ? 'paused' : 'active'} />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {isActive ? <PauseCircle className="size-4" /> : <PlayCircle className="size-4" />}
            {pending ? '...' : isActive ? 'Pausar' : 'Reativar'}
          </Button>
        </>
      )}
    </ActionForm>
  )
}
