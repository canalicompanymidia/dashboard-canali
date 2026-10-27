-- =====================================================================
--  MIGRATION 0011 — Caixa de Entrada do Tasks
-- ---------------------------------------------------------------------
--  Uma linha por aviso para uma pessoa. A tela agrupa por tarefa.
--   tipo: atribuida | mencao | comentario  → aba "Para você"
--         status | prazo                    → aba "Atualizações"
--  lida_em preenchido → aba "Feito". adiada_ate → some até essa hora.
--  RLS sem policy: só o servidor lê e grava. Idempotente.
-- =====================================================================

create table if not exists public.tarefas_notificacoes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email)),
  tarefa_id   uuid not null references public.tarefas(id) on delete cascade,
  tipo        text not null check (tipo in ('atribuida', 'mencao', 'comentario', 'status', 'prazo')),
  autor       text,
  detalhe     jsonb not null default '{}'::jsonb,
  lida_em     timestamptz,
  adiada_ate  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_tarefas_notificacoes_email
  on public.tarefas_notificacoes (email, created_at desc);
create index if not exists idx_tarefas_notificacoes_abertas
  on public.tarefas_notificacoes (email) where lida_em is null;

alter table public.tarefas_notificacoes enable row level security;
revoke all on public.tarefas_notificacoes from anon, authenticated;
grant all on public.tarefas_notificacoes to service_role;
