-- =====================================================================
--  MIGRATION 0001 — Subcategorias e perfis de acesso do Cofre
-- ---------------------------------------------------------------------
--  Aplique no SQL Editor do Supabase. É idempotente e NÃO destrutiva:
--  nenhuma credencial já cadastrada é alterada ou apagada.
--
--  O que muda:
--    1. vault_credentials ganha a coluna opcional `subcategoria`
--    2. nasce a tabela cofre_perfis (colaborador + PIN + permissões)
--    3. o log de acesso passa a registrar QUEM entrou
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Subcategoria nas credenciais
-- ---------------------------------------------------------------------
--  Nullable de propósito: tudo que já existe continua válido, sem
--  subcategoria, e segue visível apenas para o acesso Master.

alter table public.vault_credentials
  add column if not exists subcategoria text;

comment on column public.vault_credentials.subcategoria is
  'Subcategoria opcional usada no controle de acesso por perfil. NULL = visível somente no acesso Master.';

create index if not exists idx_vault_subcategoria
  on public.vault_credentials (subcategoria)
  where subcategoria is not null;

-- ---------------------------------------------------------------------
--  2. Perfis de acesso ao cofre
-- ---------------------------------------------------------------------

create table if not exists public.cofre_perfis (
  id                       uuid primary key default gen_random_uuid(),
  nome_colaborador         text        not null,
  pin_hash                 text        not null,
  subcategorias_permitidas text[]      not null default '{}',
  ativo                    boolean     not null default true,

  -- Um PIN de 4 dígitos tem só 10.000 combinações. Estes campos sustentam
  -- o bloqueio por tentativas, sem o qual a força bruta é trivial.
  tentativas_falhas        integer     not null default 0,
  bloqueado_ate            timestamptz,

  ultimo_acesso_em         timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.cofre_perfis is
  'Colaboradores com acesso ao Cofre. O PIN é guardado como hash scrypt — nunca em texto puro.';
comment on column public.cofre_perfis.subcategorias_permitidas is
  'Subcategorias que este perfil enxerga. Vazio = nenhuma credencial visível.';

create unique index if not exists idx_cofre_perfis_nome
  on public.cofre_perfis (lower(nome_colaborador));

create index if not exists idx_cofre_perfis_ativo
  on public.cofre_perfis (ativo, nome_colaborador);

drop trigger if exists trg_cofre_perfis_updated_at on public.cofre_perfis;
create trigger trg_cofre_perfis_updated_at
  before update on public.cofre_perfis
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  3. Auditoria: registrar quem acessou
-- ---------------------------------------------------------------------

alter table public.vault_access_log
  add column if not exists perfil_id uuid references public.cofre_perfis (id) on delete set null;

alter table public.vault_access_log
  add column if not exists escopo text;

comment on column public.vault_access_log.escopo is
  'master (senha mestre) ou perfil (PIN individual).';

-- ---------------------------------------------------------------------
--  4. Contagem atômica de tentativas
-- ---------------------------------------------------------------------
--  Fica no banco para dois PINs errados ao mesmo tempo não se perderem
--  numa atualização sobrescrevendo a outra.

create or replace function public.cofre_registrar_tentativa(
  p_perfil  uuid,
  p_sucesso boolean,
  p_max_falhas integer default 5,
  p_bloqueio_minutos integer default 15
)
returns table (tentativas integer, bloqueado_ate timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sucesso then
    update public.cofre_perfis p
       set tentativas_falhas = 0,
           bloqueado_ate     = null,
           ultimo_acesso_em  = now()
     where p.id = p_perfil
    returning p.tentativas_falhas, p.bloqueado_ate into tentativas, bloqueado_ate;
  else
    update public.cofre_perfis p
       set tentativas_falhas = p.tentativas_falhas + 1,
           bloqueado_ate     = case
                                 when p.tentativas_falhas + 1 >= p_max_falhas
                                   then now() + make_interval(mins => p_bloqueio_minutos)
                                 else p.bloqueado_ate
                               end
     where p.id = p_perfil
    returning p.tentativas_falhas, p.bloqueado_ate into tentativas, bloqueado_ate;
  end if;

  return next;
end;
$$;

revoke all on function public.cofre_registrar_tentativa from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  5. RLS
-- ---------------------------------------------------------------------
--  Mesma política do resto do cofre: nenhuma policy = nenhum acesso para
--  anon/authenticated. Só a service_role lê, e só do servidor.

alter table public.cofre_perfis enable row level security;
