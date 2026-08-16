import { Database, TriangleAlert } from 'lucide-react'

/**
 * Aviso de configuração pendente.
 *
 * Sem Supabase o painel ainda renderiza — zerado — em vez de estourar erro.
 * Este banner explica o que falta em vez de deixar o time olhando para zeros
 * sem contexto.
 */
export function SetupBanner() {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/8 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground dark:text-warning">
          <TriangleAlert className="size-4.5" />
        </span>

        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Conexão com o Supabase pendente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O painel está no ar, mas ainda não há banco conectado — por isso os números aparecem
            zerados. Para ativar:
          </p>

          <ol className="mt-3 space-y-1.5 text-sm">
            <li className="flex gap-2">
              <span className="font-semibold text-muted-foreground tabular">1.</span>
              <span>
                Crie um projeto em <span className="font-medium">supabase.com</span> e rode{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  supabase/schema.sql
                </code>{' '}
                seguido de{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  supabase/seed.sql
                </code>{' '}
                no SQL Editor.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-muted-foreground tabular">2.</span>
              <span>
                Copie{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.example</code>{' '}
                para <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.local</code>{' '}
                e preencha as chaves do projeto.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-muted-foreground tabular">3.</span>
              <span>Reinicie o servidor. Os dados passam a carregar automaticamente.</span>
            </li>
          </ol>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Database className="size-3.5" />O passo a passo completo está no README.md.
          </p>
        </div>
      </div>
    </div>
  )
}
