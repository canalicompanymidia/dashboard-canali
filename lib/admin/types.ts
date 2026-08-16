/** Retorno padrão das Server Actions, consumido por `useActionState`. */
export interface ActionState {
  ok: boolean
  message: string
}

export const IDLE_STATE: ActionState | null = null
