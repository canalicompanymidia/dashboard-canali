-- =====================================================================
--  MIGRATION 0015 — Chat: reações com emoji e grupos silenciados
-- ---------------------------------------------------------------------
--  • tarefas_chat_reacoes: uma reação por pessoa por mensagem, como no
--    WhatsApp (reagir de novo troca; o mesmo emoji remove).
--  • tarefas_chat_membros.silenciado: a pessoa silenciou o grupo. Só
--    grupos podem ser silenciados; o servidor recusa em conversa
--    individual e o CHECK abaixo garante isso no banco.
--  • chat_nao_lidas passa a devolver se a conversa está silenciada, para
--    o contador da barra lateral (e o som) ignorarem esses grupos.
--
--  Mesma regra do resto do Tasks: RLS ligada e nenhuma policy.
--  Idempotente.
-- =====================================================================

create table if not exists public.tarefas_chat_reacoes (
  mensagem_id uuid not null references public.tarefas_chat_mensagens(id) on delete cascade,
  email       text not null,
  emoji       text not null check (char_length(emoji) between 1 and 16),
  created_at  timestamptz not null default now(),
  primary key (mensagem_id, email)
);

alter table public.tarefas_chat_reacoes enable row level security;
revoke all on public.tarefas_chat_reacoes from anon, authenticated;

alter table public.tarefas_chat_membros
  add column if not exists silenciado boolean not null default false;

-- Silenciar só vale para grupo.
create or replace function public.chat_silenciar_so_grupo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.silenciado and (select tipo from public.tarefas_chat_conversas where id = new.conversa_id) <> 'grupo' then
    raise exception 'Só grupos podem ser silenciados.';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_silenciar_so_grupo on public.tarefas_chat_membros;
create trigger chat_silenciar_so_grupo
  before insert or update of silenciado on public.tarefas_chat_membros
  for each row execute function public.chat_silenciar_so_grupo();

drop function if exists public.chat_nao_lidas(text);
create function public.chat_nao_lidas(p_email text)
returns table (conversa_id uuid, nao_lidas bigint, silenciado boolean)
language sql
stable
set search_path = public
as $$
  select m.conversa_id, count(g.id), m.silenciado
  from public.tarefas_chat_membros m
  join public.tarefas_chat_mensagens g
    on g.conversa_id = m.conversa_id and g.created_at > m.lida_ate and g.autor <> m.email
  where m.email = p_email
  group by m.conversa_id, m.silenciado;
$$;
revoke all on function public.chat_nao_lidas(text) from public, anon, authenticated;
grant execute on function public.chat_nao_lidas(text) to service_role;
