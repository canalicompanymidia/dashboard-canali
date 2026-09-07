-- =====================================================================
--  MIGRATION 0005 — Bloqueio por tentativas na Senha Mestre
-- ---------------------------------------------------------------------
--  O PIN de perfil já tinha bloqueio (5 erros → 15 min, contados
--  atomicamente). A Senha Mestre não tinha nada: tentativas ilimitadas,
--  e é ela que abre TODAS as credenciais de uma vez. A porta mais
--  valiosa era a menos protegida.
--
--  Pode rodar a qualquer momento, independente da 0004. Idempotente.
-- =====================================================================

create table if not exists public.cofre_master_tentativas (
  id               boolean primary key default true check (id),  -- linha única
  tentativas_falhas integer     not null default 0,
  bloqueado_ate     timestamptz,
  ultima_tentativa  timestamptz
);

comment on table public.cofre_master_tentativas is
  'Contador de tentativas da Senha Mestre. Uma linha só — o cofre é um.';

alter table public.cofre_master_tentativas enable row level security;

insert into public.cofre_master_tentativas (id) values (true) on conflict do nothing;

/**
 * Registra uma tentativa e devolve o estado do bloqueio.
 *
 * Todo o cálculo acontece em UMA instrução, sob FOR UPDATE: duas
 * tentativas simultâneas não conseguem ler o mesmo contador e gravar 1
 * cada uma. Sem isso, disparar requisições em paralelo furaria o limite.
 */
create or replace function public.cofre_registrar_master(
  p_sucesso          boolean,
  p_max_falhas       integer default 5,
  p_bloqueio_minutos integer default 15
)
returns table (bloqueado boolean, minutos_restantes integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_falhas integer;
  v_ate    timestamptz;
begin
  select t.tentativas_falhas, t.bloqueado_ate
    into v_falhas, v_ate
  from public.cofre_master_tentativas t
  where t.id
  for update;

  -- Bloqueio em vigor: não conta a tentativa, só informa o tempo restante.
  if v_ate is not null and v_ate > now() then
    return query select true, greatest(1, ceil(extract(epoch from (v_ate - now())) / 60)::int);
    return;
  end if;

  if p_sucesso then
    update public.cofre_master_tentativas
       set tentativas_falhas = 0, bloqueado_ate = null, ultima_tentativa = now()
     where id;
    return query select false, 0;
    return;
  end if;

  v_falhas := coalesce(v_falhas, 0) + 1;

  if v_falhas >= p_max_falhas then
    update public.cofre_master_tentativas
       set tentativas_falhas = 0,
           bloqueado_ate     = now() + make_interval(mins => p_bloqueio_minutos),
           ultima_tentativa  = now()
     where id;
    return query select true, p_bloqueio_minutos;
  else
    update public.cofre_master_tentativas
       set tentativas_falhas = v_falhas, ultima_tentativa = now()
     where id;
    return query select false, 0;
  end if;
end $$;

revoke all on function public.cofre_registrar_master(boolean, integer, integer) from public, anon;
