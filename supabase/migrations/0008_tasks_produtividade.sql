-- =====================================================================
--  MIGRATION 0008 — Tasks: visualização padrão, reuniões e links,
--  agenda assinável, quem está online
-- ---------------------------------------------------------------------
--  1. Visualização padrão por espaço e por lista (Quadro é o padrão
--     geral do Tasks quando nada está definido).
--  2. Link da reunião e lista de links (Drive, Meet, Zoom...) na tarefa.
--  3. Preferências por pessoa: o endereço secreto da agenda assinável
--     (.ics) e, opcionalmente, o endereço iCal do Google Calendar dela,
--     guardado cifrado.
--  4. Canal privado de presença no Realtime: só colaborador logado
--     enxerga e informa quem está online.
--
--  Recria as views v_tarefas e v_tarefas_listas_resumo para expor as
--  colunas novas. Não apaga dado.
--  Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. VISUALIZAÇÃO PADRÃO
-- ---------------------------------------------------------------------

alter table public.tarefas_espacos
  add column if not exists visualizacao_padrao text
  check (visualizacao_padrao is null or visualizacao_padrao in ('lista', 'quadro', 'calendario'));

alter table public.tarefas_listas
  add column if not exists visualizacao_padrao text
  check (visualizacao_padrao is null or visualizacao_padrao in ('lista', 'quadro', 'calendario'));

comment on column public.tarefas_espacos.visualizacao_padrao is
  'Visualização com que as listas deste espaço abrem. NULL = padrão geral do Tasks (quadro).';
comment on column public.tarefas_listas.visualizacao_padrao is
  'Visualização com que esta lista abre. NULL = herda do espaço.';

-- ---------------------------------------------------------------------
--  2. REUNIÃO E LINKS NA TAREFA
-- ---------------------------------------------------------------------

alter table public.tarefas
  add column if not exists reuniao_url text
  check (reuniao_url is null or (length(reuniao_url) <= 500 and reuniao_url ~* '^https?://'));

alter table public.tarefas
  add column if not exists links jsonb not null default '[]'::jsonb;

comment on column public.tarefas.reuniao_url is 'Link da reunião (Meet, Zoom, Teams...) ligada à tarefa.';
comment on column public.tarefas.links is 'Links úteis da tarefa: [{ "url": "...", "titulo": "..." }]. Drive, Docs, Figma...';

-- A view lista colunas explicitamente: recriada com as duas novas.
drop view if exists public.v_tarefas;
create view public.v_tarefas
with (security_invoker = true)
as
select
  t.id,
  t.lista_id,
  t.status_id,
  t.pai_id,
  t.titulo,
  t.descricao,
  t.prioridade,
  t.data_inicio,
  t.data_vencimento,
  t.estimativa_minutos,
  t.etiquetas,
  t.campos,
  t.posicao,
  t.criado_por,
  t.concluida_em,
  t.created_at,
  t.updated_at,
  t.reuniao_url,
  t.links,
  s.nome      as status_nome,
  s.cor       as status_cor,
  s.tipo      as status_tipo,
  s.posicao   as status_posicao,
  l.nome      as lista_nome,
  l.cor       as lista_cor,
  l.pasta_id,
  p.nome      as pasta_nome,
  l.espaco_id,
  e.nome      as espaco_nome,
  e.cor       as espaco_cor,
  e.privado   as espaco_privado,
  pai.titulo  as pai_titulo,
  coalesce(
    (select array_agg(r.email order by r.email)
       from public.tarefas_responsaveis r
      where r.tarefa_id = t.id),
    '{}'::text[]
  ) as responsaveis,
  (select count(*) from public.tarefas st where st.pai_id = t.id)::int as subtarefas_total,
  (select count(*)
     from public.tarefas st
     join public.tarefas_status ss on ss.id = st.status_id
    where st.pai_id = t.id
      and ss.tipo in ('concluido', 'fechado'))::int                     as subtarefas_concluidas,
  (select count(*) from public.tarefas_comentarios c where c.tarefa_id = t.id)::int as comentarios_total,
  (select count(*) from public.tarefas_anexos a where a.tarefa_id = t.id)::int      as anexos_total,
  (select count(*) from public.tarefas_checklist k where k.tarefa_id = t.id)::int   as checklist_total,
  (select count(*) from public.tarefas_checklist k
    where k.tarefa_id = t.id and k.feito)::int                                     as checklist_feitos
from public.tarefas t
join public.tarefas_status  s   on s.id = t.status_id
join public.tarefas_listas  l   on l.id = t.lista_id
join public.tarefas_espacos e   on e.id = l.espaco_id
left join public.tarefas_pastas p   on p.id = l.pasta_id
left join public.tarefas        pai on pai.id = t.pai_id;

revoke all on public.v_tarefas from anon, authenticated;
grant  select on public.v_tarefas to service_role;

-- A view-resumo das listas também lista colunas uma a uma: entra a
-- visualização padrão, que a tela de lista lê para decidir como abrir.
drop view if exists public.v_tarefas_listas_resumo;
create view public.v_tarefas_listas_resumo
with (security_invoker = true)
as
select
  l.id,
  l.espaco_id,
  l.pasta_id,
  l.nome,
  l.cor,
  l.descricao,
  l.visualizacao_padrao,
  l.posicao,
  l.criado_por,
  l.created_at,
  l.updated_at,
  (select count(*) from public.tarefas t
    where t.lista_id = l.id and t.pai_id is null)::int                      as tarefas_total,
  (select count(*) from public.tarefas t
    where t.lista_id = l.id and t.pai_id is null
      and t.concluida_em is not null)::int                                  as tarefas_concluidas,
  (select count(*) from public.tarefas t
    where t.lista_id = l.id
      and t.concluida_em is null
      and t.data_vencimento < (now() at time zone 'America/Sao_Paulo')::date)::int as tarefas_atrasadas
from public.tarefas_listas l;

revoke all on public.v_tarefas_listas_resumo from anon, authenticated;
grant  select on public.v_tarefas_listas_resumo to service_role;

-- ---------------------------------------------------------------------
--  3. PREFERÊNCIAS POR PESSOA
-- ---------------------------------------------------------------------

create table if not exists public.tarefas_preferencias (
  email               text primary key check (email = lower(email)),
  -- Segredo do endereço da agenda assinável (/api/tasks/agenda/<token>.ics).
  agenda_token        text unique,
  -- Endereço iCal secreto do Google Calendar da pessoa, cifrado com a
  -- chave do cofre (VAULT_ENCRYPTION_KEY). Quem tem esse endereço lê a
  -- agenda dela; por isso nunca fica em texto puro.
  google_ics_cifrado  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.tarefas_preferencias is
  'Tasks: preferências por colaborador (agenda assinável, Google Calendar).';

drop trigger if exists trg_tarefas_preferencias_updated_at on public.tarefas_preferencias;
create trigger trg_tarefas_preferencias_updated_at
  before update on public.tarefas_preferencias
  for each row execute function public.set_updated_at();

alter table public.tarefas_preferencias enable row level security;
revoke all on public.tarefas_preferencias from anon, authenticated;
grant all on public.tarefas_preferencias to service_role;

-- ---------------------------------------------------------------------
--  4. PRESENÇA (quem está online)
--  Canal privado "tasks:presenca". As policies vivem em realtime.messages
--  e valem só para a extensão de presença desse tópico, para colaborador
--  logado e ativo. Nada de dado de tarefa passa por aqui: só e-mail e
--  nome de quem está com o Tasks aberto.
--  Roda só onde o Realtime existe (Supabase).
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute 'drop policy if exists "tasks_presenca_le" on realtime.messages';
    execute $p$
      create policy "tasks_presenca_le" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() = 'tasks:presenca'
          and realtime.messages.extension = 'presence'
          and public.eh_colaborador()
        )
    $p$;
    execute 'drop policy if exists "tasks_presenca_envia" on realtime.messages';
    execute $p$
      create policy "tasks_presenca_envia" on realtime.messages
        for insert to authenticated
        with check (
          realtime.topic() = 'tasks:presenca'
          and realtime.messages.extension = 'presence'
          and public.eh_colaborador()
        )
    $p$;
  end if;
end $$;
