'use client'

import * as React from 'react'
import { RefreshCw } from 'lucide-react'

import { FormFeedback } from '@/components/admin/action-form'
import { Button } from '@/components/ui/button'
import { runMetaAdsSync } from '@/app/admin/actions'
import type { ActionState } from '@/lib/admin/types'

/** Dispara a sincronização do Meta Ads sob demanda, sem esperar o cron. */
export function MetaSyncButton({ disabled }: { disabled?: boolean }) {
  const [state, setState] = React.useState<ActionState | null>(null)
  const [pending, startTransition] = React.useTransition()

  function sync() {
    startTransition(async () => {
      setState(await runMetaAdsSync())
    })
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={sync} disabled={pending || disabled}>
        <RefreshCw className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} />
        {pending ? 'Sincronizando...' : 'Sincronizar agora'}
      </Button>
      <FormFeedback state={state} />
    </div>
  )
}
