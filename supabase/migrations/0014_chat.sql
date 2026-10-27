-- =====================================================================
--  MIGRATION 0014 — Chat do Tasks (conversas individuais e em grupo)
-- ---------------------------------------------------------------------
--  • tarefas_chat_conversas: 'dm' (duas pessoas) ou 'grupo' (com nome).
--    dm_chave = os dois e-mails em ordem, para não abrir a mesma
--    conversa individual duas vezes.
--  • tarefas_chat_membros: quem participa e até quando já leu.
--  • tarefas_chat_mensagens: o texto de cada mensagem.
--
--  Como o resto do Tasks: RLS ligada e NENHUMA policy. Só o servidor
--  (service_role) lê e grava, depois de conferir que a pessoa é membro.
--  O aviso em tempo real vai pela presença ("tasks:presenca") e leva só
--  o id da conversa, nunca o texto. Idempotente.
-- =====================================================================

create table if not exists public.tarefas_chat_conversas (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('dm', 'grupo')),
  nome        text check (nome is null or char_length(nome) between 1 and 80),
  dm_chave    text unique,
  criado_por  text not null,
  created_at  timestamptz not null default now(),
  -- Hora da última mensagem: ordena a lista de conversas.
  ultima_em   timestamptz not null default now(),
  check ((tipo = 'dm') = (dm_chave is not null))
);

create table if not exists public.tarefas_chat_membros (
  conversa_id uuid not null references public.tarefas_chat_conversas(id) on delete cascade,
  email       text not null,
  lida_ate    timestamptz not null default now(),
  entrou_em   timestamptz not null default now(),
  primary key (conversa_id, email)
);
create index if not exists tarefas_chat_membros_email_idx on public.tarefas_chat_membros (email);

create table if not exists public.tarefas_chat_mensagens (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.tarefas_chat_conversas(id) on delete cascade,
  autor       text not null,
  texto       text not null check (char_length(texto) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists tarefas_chat_mensagens_conversa_idx
  on public.tarefas_chat_mensagens (conversa_id, created_at desc);

alter table public.tarefas_chat_conversas enable row level security;
alter table public.tarefas_chat_membros   enable row level security;
alter table public.tarefas_chat_mensagens enable row level security;

revoke all on public.tarefas_chat_conversas, public.tarefas_chat_membros, public.tarefas_chat_mensagens
  from anon, authenticated;

-- Não lidas por conversa de uma pessoa, numa ida ao banco.
create or replace function public.chat_nao_lidas(p_email text)
returns table (conversa_id uuid, nao_lidas bigint)
language sql
stable
set search_path = public
as $$
  select m.conversa_id, count(g.id)
  from public.tarefas_chat_membros m
  join public.tarefas_chat_mensagens g
    on g.conversa_id = m.conversa_id and g.created_at > m.lida_ate and g.autor <> m.email
  where m.email = p_email
  group by m.conversa_id;
$$;
revoke all on function public.chat_nao_lidas(text) from public, anon, authenticated;
grant execute on function public.chat_nao_lidas(text) to service_role;
