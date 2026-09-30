-- =====================================================================
--  MIGRATION 0009 — Favoritos, perfis (foto e cargo) e equipes
-- ---------------------------------------------------------------------
--  1. Favoritos por pessoa: espaços e listas em destaque na barra
--     lateral do Tasks.
--  2. Perfil do colaborador: foto (bucket privado "avatares"), cargo e
--     gestor — a base do organograma.
--  3. Equipes com líder e membros.
--
--  Como o resto do Hub: RLS ligado e SEM policy — só o servidor
--  (service_role) lê e grava. Não apaga dado. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. FAVORITOS
-- ---------------------------------------------------------------------

create table if not exists public.tarefas_favoritos (
  email      text        not null check (email = lower(email)),
  tipo       text        not null check (tipo in ('espaco', 'lista')),
  item_id    uuid        not null,
  created_at timestamptz not null default now(),
  primary key (email, tipo, item_id)
);

comment on table public.tarefas_favoritos is
  'Tasks: espaços e listas que cada pessoa fixou na barra lateral.';

-- Sem chave estrangeira (a coluna aponta para duas tabelas); quando o
-- espaço ou a lista some, os favoritos que apontavam para eles saem junto.
create or replace function public.tarefas_favoritos_limpar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.tarefas_favoritos where item_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_tarefas_favoritos_espaco on public.tarefas_espacos;
create trigger trg_tarefas_favoritos_espaco
  after delete on public.tarefas_espacos
  for each row execute function public.tarefas_favoritos_limpar();

drop trigger if exists trg_tarefas_favoritos_lista on public.tarefas_listas;
create trigger trg_tarefas_favoritos_lista
  after delete on public.tarefas_listas
  for each row execute function public.tarefas_favoritos_limpar();

alter table public.tarefas_favoritos enable row level security;
revoke all on public.tarefas_favoritos from anon, authenticated;
grant all on public.tarefas_favoritos to service_role;

-- ---------------------------------------------------------------------
--  2. PERFIS
--  Separado de colaboradores_autorizados (a lista de quem pode entrar):
--  aqui é o que a própria pessoa edita (foto, cargo) e o que o admin
--  define para o organograma (gestor).
-- ---------------------------------------------------------------------

create table if not exists public.colaboradores_perfis (
  email        text primary key check (email = lower(email)),
  -- Caminho do objeto no bucket privado "avatares".
  avatar_path  text,
  cargo        text check (cargo is null or length(cargo) <= 80),
  gestor_email text check (gestor_email is null or gestor_email = lower(gestor_email)),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint colaboradores_perfis_gestor_diferente check (gestor_email is null or gestor_email <> email)
);

comment on table public.colaboradores_perfis is
  'Perfil de cada colaborador: foto, cargo e gestor (organograma).';

drop trigger if exists trg_colaboradores_perfis_updated_at on public.colaboradores_perfis;
create trigger trg_colaboradores_perfis_updated_at
  before update on public.colaboradores_perfis
  for each row execute function public.set_updated_at();

alter table public.colaboradores_perfis enable row level security;
revoke all on public.colaboradores_perfis from anon, authenticated;
grant all on public.colaboradores_perfis to service_role;

-- Bucket privado das fotos: só o servidor gera URLs (de leitura e de
-- upload). Roda só onde o schema storage existe (Supabase).
do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatares', 'avatares', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])  -- 2 MB
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  3. EQUIPES
-- ---------------------------------------------------------------------

create table if not exists public.equipes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(nome) between 1 and 80),
  cor         text not null default '#1f6feb' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  descricao   text check (descricao is null or length(descricao) <= 300),
  lider_email text check (lider_email is null or lider_email = lower(lider_email)),
  posicao     integer not null default 0,
  criado_por  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.equipes is 'Equipes do Hub: nome, cor, líder e membros (equipe_membros).';

create unique index if not exists idx_equipes_nome_unico on public.equipes (lower(nome));

drop trigger if exists trg_equipes_updated_at on public.equipes;
create trigger trg_equipes_updated_at
  before update on public.equipes
  for each row execute function public.set_updated_at();

create table if not exists public.equipe_membros (
  equipe_id  uuid not null references public.equipes(id) on delete cascade,
  email      text not null check (email = lower(email)),
  created_at timestamptz not null default now(),
  primary key (equipe_id, email)
);

create index if not exists idx_equipe_membros_email on public.equipe_membros (email);

alter table public.equipes        enable row level security;
alter table public.equipe_membros enable row level security;
revoke all on public.equipes, public.equipe_membros from anon, authenticated;
grant all on public.equipes, public.equipe_membros to service_role;
