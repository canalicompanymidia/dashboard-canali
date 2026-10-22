/**
 * Esqueleto mostrado NO INSTANTE do clique enquanto o servidor monta a
 * próxima tela do Tasks. A barra lateral fica onde está; só a área de
 * conteúdo troca. É o que faz a navegação parecer imediata.
 */
export function TelaCarregando({ tipo = 'quadro' }: { tipo?: 'quadro' | 'lista' }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Carregando">
      <div className="shrink-0 border-b border-border bg-card/60 px-4">
        <div className="flex h-12 items-center gap-2">
          <span className="h-4 w-24 animate-pulse rounded bg-muted" />
          <span className="h-4 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex h-9 items-center gap-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-3 w-16 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
      {tipo === 'quadro' ? (
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden px-3 py-4 sm:px-6">
          {[0, 1, 2, 3].map((c) => (
            <div key={c} className="w-72 shrink-0 space-y-2 rounded-xl border border-border bg-muted/30 p-2">
              <span className="m-1 block h-5 w-24 animate-pulse rounded bg-muted" />
              {Array.from({ length: 4 - (c % 3) }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-card" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1200px] space-y-2 px-4 py-6 sm:px-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted/60" />
          ))}
        </div>
      )}
    </div>
  )
}
