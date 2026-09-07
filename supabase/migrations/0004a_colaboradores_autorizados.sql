-- =====================================================================
--  MIGRATION 0004a — Lista de colaboradores autorizados  (PARTE 1 de 2)
-- ---------------------------------------------------------------------
--  NÃO QUEBRA NADA. Só cria a lista de quem pode entrar e as funções que
--  a consultam. O Hub continua funcionando exatamente como hoje.
--
--  A parte 0004b é que fecha o acesso anônimo — e ela SÓ pode rodar
--  depois que o login estiver no ar. Ordem obrigatória:
--    1. rodar esta (0004a)
--    2. publicar o código com a tela de login
--    3. entrar no Hub e confirmar que funciona
--    4. rodar a 0004b
--
--  Idempotente: pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. QUEM PODE ENTRAR
-- ---------------------------------------------------------------------

create table if not exists public.colaboradores_autorizados (
  id               uuid primary key default gen_random_uuid(),
  email            text        not null,
  nome             text,
  -- 'admin' abre o /admin; 'colaborador' só enxerga a Home.
  papel            text        not null default 'colaborador'
                   check (papel in ('admin', 'colaborador')),
  ativo            boolean     not null default true,
  ultimo_acesso_em timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.colaboradores_autorizados is
  'Lista de e-mails com permissão de entrar no Hub. Estar autenticado no Supabase NÃO basta: o e-mail precisa estar aqui e ativo.';

-- Índice funcional em lower(): "Joao@..." e "joao@..." são a mesma pessoa,
-- e é assim que as funções abaixo comparam.
create unique index if not exists idx_colaboradores_email_unico
  on public.colaboradores_autorizados (lower(email));

drop trigger if exists trg_colaboradores_autorizados_updated_at on public.colaboradores_autorizados;
create trigger trg_colaboradores_autorizados_updated_at
  before update on public.colaboradores_autorizados
  for each row execute function public.set_updated_at();

-- RLS ligado sem policy: a tabela de permissões não é legível por ninguém
-- via API pública. O app a lê pela service_role, e as funções abaixo
-- alcançam-na por serem SECURITY DEFINER.
alter table public.colaboradores_autorizados enable row level security;

-- ---------------------------------------------------------------------
--  2. AS FUNÇÕES QUE AS POLICIES VÃO USAR
--
--  SECURITY DEFINER de propósito: precisam ler a tabela acima, que o
--  usuário logado não enxerga. É o padrão de "checagem de permissão" —
--  a função devolve só true/false, nunca o conteúdo da lista.
--
--  search_path fixo fecha o vetor de sequestro de nome de tabela, que é
--  o risco real de uma SECURITY DEFINER.
-- ---------------------------------------------------------------------

create or replace function public.eh_colaborador()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.colaboradores_autorizados c
    where lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and c.ativo
  );
$$;

comment on function public.eh_colaborador() is
  'true quando o e-mail do usuário logado está na lista de autorizados e ativo.';

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.colaboradores_autorizados c
    where lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and c.ativo
      and c.papel = 'admin'
  );
$$;

revoke all on function public.eh_colaborador() from public;
revoke all on function public.eh_admin()       from public;
grant execute on function public.eh_colaborador() to authenticated;
grant execute on function public.eh_admin()       to authenticated;

-- ---------------------------------------------------------------------
--  3. O PRIMEIRO ADMIN
--  Sem esta linha ninguém consegue entrar depois que a 0004b rodar.
--  Troque o e-mail se quiser outro dono, e adicione o resto do time
--  pela tela /admin/colaboradores.
-- ---------------------------------------------------------------------

insert into public.colaboradores_autorizados (email, nome, papel)
values ('canalicompanymidia@gmail.com', 'Canali Company', 'admin')
on conflict do nothing;

-- ---------------------------------------------------------------------
--  4. CORREÇÃO DE AVISO DO LINTER
--  set_updated_at e status_rank estavam com search_path mutável — mesmo
--  vetor descrito acima. Não muda comportamento.
-- ---------------------------------------------------------------------

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.status_rank(public.transaction_status) set search_path = public, pg_temp;
