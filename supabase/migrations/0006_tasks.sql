-- =====================================================================
--  MIGRATION 0006 — Tasks: gestão de demandas dos times
-- ---------------------------------------------------------------------
--  Cria o módulo de tarefas do Hub, inspirado no ClickUp:
--
--    Espaço  →  Pasta (opcional)  →  Lista  →  Tarefa  →  Subtarefa
--
--  Cada LISTA tem o próprio conjunto de status (é assim que o time já
--  trabalha no ClickUp: Design tem oito etapas, Conteúdo tem quatro).
--  Campos personalizados valem para um espaço inteiro ou para uma lista.
--
--  SEGURANÇA — mesmo modelo do resto do Hub:
--    • RLS ligado em todas as tabelas, SEM policy. A chave pública que vai
--      no navegador não lê nem grava nada aqui, nem logada.
--    • Toda leitura e escrita passa pelo servidor do Hub (service_role),
--      que confere o colaborador em cada operação.
--    • Anexos ficam num bucket PRIVADO; o navegador só recebe URLs
--      assinadas, com prazo, geradas pelo servidor.
--
--  Não toca em nenhuma tabela existente. Idempotente: pode rodar de novo.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. ESPAÇOS
-- ---------------------------------------------------------------------

create table if not exists public.tarefas_espacos (
  id          uuid primary key default gen_random_uuid(),
  nome        text        not null check (length(trim(nome)) between 1 and 80),
  cor         text        not null default '#62676f' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  -- Privado: só admins e os membros listados abaixo enxergam.
  privado     boolean     not null default false,
  posicao     integer     not null default 0,
  criado_por  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tarefas_espacos is
  'Tasks: nível mais alto da hierarquia (Marketing, Comercial, Gestão...). Privado = só admins e membros.';

create table if not exists public.tarefas_espaco_membros (
  espaco_id   uuid        not null references public.tarefas_espacos(id) on delete cascade,
  email       text        not null check (email = lower(email)),
  created_at  timestamptz not null default now(),
  primary key (espaco_id, email)
);

comment on table public.tarefas_espaco_membros is
  'Tasks: quem enxerga um espaço privado, além dos admins.';

-- ---------------------------------------------------------------------
--  2. PASTAS E LISTAS
-- ---------------------------------------------------------------------

create table if not exists public.tarefas_pastas (
  id          uuid primary key default gen_random_uuid(),
  espaco_id   uuid        not null references public.tarefas_espacos(id) on delete cascade,
  nome        text        not null check (length(trim(nome)) between 1 and 80),
  posicao     integer     not null default 0,
  criado_por  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Alvo da chave composta em tarefas_listas: garante que a pasta é do
  -- mesmo espaço da lista.
  unique (id, espaco_id)
);

create table if not exists public.tarefas_listas (
  id          uuid primary key default gen_random_uuid(),
  espaco_id   uuid        not null references public.tarefas_espacos(id) on delete cascade,
  -- Null = lista solta no espaço, fora de qualquer pasta.
  pasta_id    uuid,
  nome        text        not null check (length(trim(nome)) between 1 and 80),
  cor         text        check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$'),
  descricao   text,
  posicao     integer     not null default 0,
  criado_por  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (pasta_id, espaco_id)
    references public.tarefas_pastas(id, espaco_id) on delete cascade
);

comment on table public.tarefas_listas is
  'Tasks: onde as tarefas vivem. Cada lista tem os próprios status.';

-- ---------------------------------------------------------------------
--  3. STATUS (por lista)
--  tipo: aberto → ainda não começou · ativo → em andamento ·
--        concluido → terminou (feito, descartado) · fechado → encerrado
--  "Pendente" na Home = aberto + ativo. "Feito" = concluido + fechado.
-- ---------------------------------------------------------------------

create table if not exists public.tarefas_status (
  id          uuid primary key default gen_random_uuid(),
  lista_id    uuid        not null references public.tarefas_listas(id) on delete cascade,
  nome        text        not null check (length(trim(nome)) between 1 and 40),
  cor         text        not null default '#8a817c' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  tipo        text        not null default 'ativo'
              check (tipo in ('aberto', 'ativo', 'concluido', 'fechado')),
  posicao     integer     not null default 0,
  created_at  timestamptz not null default now(),
  -- Alvo da chave composta em tarefas: uma tarefa só pode usar status da
  -- própria lista.
  unique (id, lista_id)
);

create unique index if not exists idx_tarefas_status_nome_unico
  on public.tarefas_status (lista_id, lower(nome));

-- ---------------------------------------------------------------------
--  4. TAREFAS
-- ---------------------------------------------------------------------

create table if not exists public.tarefas (
  id                  uuid primary key default gen_random_uuid(),
  lista_id            uuid        not null references public.tarefas_listas(id) on delete cascade,
  status_id           uuid        not null,
  -- Subtarefa: aponta para a tarefa-mãe (um nível só, na mesma lista).
  pai_id              uuid        references public.tarefas(id) on delete cascade,
  titulo              text        not null check (length(trim(titulo)) between 1 and 300),
  descricao           text,
  prioridade          text        check (prioridade in ('urgente', 'alta', 'normal', 'baixa')),
  data_inicio         date,
  data_vencimento     date,
  estimativa_minutos  integer     check (estimativa_minutos is null or estimativa_minutos >= 0),
  etiquetas           text[]      not null default '{}',
  -- Valores dos campos personalizados: { "<id do campo>": valor }.
  campos              jsonb       not null default '{}'::jsonb,
  -- Ordem dentro da coluna do quadro. Fracionária: inserir entre duas
  -- tarefas não exige renumerar as outras.
  posicao             double precision not null default 0,
  criado_por          text,
  -- Preenchido por trigger quando o status é do tipo concluido/fechado.
  concluida_em        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (status_id, lista_id) references public.tarefas_status(id, lista_id)
);

comment on table public.tarefas is
  'Tasks: a tarefa. status_id precisa pertencer à lista da tarefa (chave composta).';

create index if not exists idx_tarefas_lista       on public.tarefas (lista_id);
create index if not exists idx_tarefas_status      on public.tarefas (status_id);
create index if not exists idx_tarefas_pai         on public.tarefas (pai_id);
create index if not exists idx_tarefas_vencimento  on public.tarefas (data_vencimento);
create index if not exists idx_tarefas_criado_por  on public.tarefas (criado_por);
create index if not exists idx_tarefas_updated     on public.tarefas (updated_at desc);

create table if not exists public.tarefas_responsaveis (
  tarefa_id   uuid        not null references public.tarefas(id) on delete cascade,
  email       text        not null check (email = lower(email)),
  created_at  timestamptz not null default now(),
  primary key (tarefa_id, email)
);

create index if not exists idx_tarefas_responsaveis_email on public.tarefas_responsaveis (email);

-- ---------------------------------------------------------------------
--  5. CAMPOS PERSONALIZADOS
--  lista_id nulo = vale para todas as listas do espaço.
-- ---------------------------------------------------------------------

create table if not exists public.tarefas_campos (
  id          uuid primary key default gen_random_uuid(),
  espaco_id   uuid        not null references public.tarefas_espacos(id) on delete cascade,
  lista_id    uuid        references public.tarefas_listas(id) on delete cascade,
  nome        text        not null check (length(trim(nome)) between 1 and 60),
  tipo        text        not null check (tipo in (
                'texto', 'numero', 'selecao', 'multiselecao', 'data', 'pessoa', 'checkbox', 'url'
              )),
  -- Para selecao/multiselecao: [{ "id": "...", "nome": "...", "cor": "#rrggbb" }]
  opcoes      jsonb       not null default '[]'::jsonb,
  posicao     integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tarefas_campos_espaco on public.tarefas_campos (espaco_id);
create index if not exists idx_tarefas_campos_lista  on public.tarefas_campos (lista_id);

-- ---------------------------------------------------------------------
--  6. CHECKLIST, COMENTÁRIOS, ATIVIDADE E ANEXOS
-- ---------------------------------------------------------------------

create table if not exists public.tarefas_checklist (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid        not null references public.tarefas(id) on delete cascade,
  texto       text        not null check (length(trim(texto)) between 1 and 300),
  feito       boolean     not null default false,
  posicao     integer     not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_tarefas_checklist_tarefa on public.tarefas_checklist (tarefa_id);

create table if not exists public.tarefas_comentarios (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid        not null references public.tarefas(id) on delete cascade,
  autor       text        not null,
  texto       text        not null check (length(trim(texto)) between 1 and 5000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tarefas_comentarios_tarefa on public.tarefas_comentarios (tarefa_id, created_at);

-- Histórico imutável: "Fabi alterou o status de Para revisão para Agendado".
create table if not exists public.tarefas_atividades (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid        not null references public.tarefas(id) on delete cascade,
  autor       text,
  tipo        text        not null,
  detalhe     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_tarefas_atividades_tarefa on public.tarefas_atividades (tarefa_id, created_at);

create table if not exists public.tarefas_anexos (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid        not null references public.tarefas(id) on delete cascade,
  nome        text        not null,
  -- Caminho do objeto no bucket tarefas-anexos.
  caminho     text        not null unique,
  tipo_mime   text,
  tamanho     bigint      check (tamanho is null or tamanho >= 0),
  enviado_por text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_tarefas_anexos_tarefa on public.tarefas_anexos (tarefa_id);

-- ---------------------------------------------------------------------
--  7. TRIGGERS
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'tarefas_espacos', 'tarefas_pastas', 'tarefas_listas', 'tarefas',
    'tarefas_campos', 'tarefas_comentarios'
  ]
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- concluida_em acompanha o TIPO do status: entra quando a tarefa vai para
-- um status concluido/fechado, sai quando volta para aberto/ativo.
create or replace function public.tarefas_marcar_conclusao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tipo text;
begin
  select s.tipo into v_tipo from public.tarefas_status s where s.id = new.status_id;

  if v_tipo in ('concluido', 'fechado') then
    if new.concluida_em is null then
      new.concluida_em := now();
    end if;
  else
    new.concluida_em := null;
  end if;

  return new;
end $$;

drop trigger if exists trg_tarefas_conclusao on public.tarefas;
create trigger trg_tarefas_conclusao
  before insert or update of status_id on public.tarefas
  for each row execute function public.tarefas_marcar_conclusao();

-- Quando o TIPO de um status muda (na tela de configuração da lista), as
-- tarefas que já estão nele precisam acompanhar.
create or replace function public.tarefas_recalcular_conclusao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.tipo is distinct from old.tipo then
    update public.tarefas t
       set concluida_em = case
             when new.tipo in ('concluido', 'fechado') then coalesce(t.concluida_em, now())
             else null
           end
     where t.status_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_tarefas_status_tipo on public.tarefas_status;
create trigger trg_tarefas_status_tipo
  after update of tipo on public.tarefas_status
  for each row execute function public.tarefas_recalcular_conclusao();

-- ---------------------------------------------------------------------
--  8. FUNÇÕES DE APOIO
-- ---------------------------------------------------------------------

-- Move a tarefa E as subtarefas dela para outra lista, numa transação só.
-- A chave composta (status_id, lista_id) exige que as duas colunas mudem
-- juntas, e a subtarefa precisa acompanhar a mãe.
create or replace function public.tarefas_mover_lista(
  p_tarefa uuid,
  p_lista  uuid,
  p_status uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.tarefas
     set lista_id  = p_lista,
         status_id = p_status
   where id = p_tarefa
      or pai_id = p_tarefa;
end $$;

revoke all on function public.tarefas_mover_lista(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  9. VIEWS
--  security_invoker: quem consulta a view é conferido pelo RLS das
--  tabelas de baixo. Sem policy, anon e authenticated recebem zero
--  linhas; a service_role (que ignora RLS) enxerga tudo.
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
--  10. RLS E GRANTS — tudo fechado para a API pública
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'tarefas_espacos', 'tarefas_espaco_membros', 'tarefas_pastas', 'tarefas_listas',
    'tarefas_status', 'tarefas', 'tarefas_responsaveis', 'tarefas_campos',
    'tarefas_checklist', 'tarefas_comentarios', 'tarefas_atividades', 'tarefas_anexos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- O Supabase concede acesso a anon/authenticated em toda tabela nova
    -- por padrão. Sem policy o RLS já barra; revogar é a segunda tranca.
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

revoke all on public.v_tarefas               from anon, authenticated;
revoke all on public.v_tarefas_listas_resumo from anon, authenticated;
grant  select on public.v_tarefas               to service_role;
grant  select on public.v_tarefas_listas_resumo to service_role;

-- ---------------------------------------------------------------------
--  11. BUCKET DE ANEXOS (privado)
--  Sem policy de storage: só a service_role grava e gera URLs assinadas.
--  O bloco só roda onde o schema storage existe (Supabase), para o
--  arquivo continuar válido num Postgres comum.
-- ---------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('tarefas-anexos', 'tarefas-anexos', false, 52428800)  -- 50 MB por arquivo
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  12. ESTRUTURA INICIAL
--  Espelha o que o time já usa no ClickUp, para o módulo não nascer
--  vazio. Chaves fixas: rodar de novo não duplica. Tudo pode ser
--  renomeado ou apagado pela própria interface.
-- ---------------------------------------------------------------------

insert into public.tarefas_espacos (id, nome, cor, privado, posicao) values
  ('5e000000-0000-4000-8000-000000000001', 'Marketing', '#1f3864', false, 0),
  ('5e000000-0000-4000-8000-000000000002', 'Comercial', '#1c7a55', false, 1),
  ('5e000000-0000-4000-8000-000000000003', 'Gestão',    '#8a5a00', true,  2)
on conflict (id) do nothing;

insert into public.tarefas_pastas (id, espaco_id, nome, posicao) values
  ('5f000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', 'Gestão do Time',                 0),
  ('5f000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000001', 'Processos de Automações',        1),
  ('5f000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000001', 'Reuniões | Atas | Transcrições', 2)
on conflict (id) do nothing;

insert into public.tarefas_listas (id, espaco_id, pasta_id, nome, cor, posicao) values
  ('51000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', 'DESENVOLVEDOR WEB',      null,      0),
  ('51000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', 'DESIGNER',               '#b3261e', 1),
  ('51000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', 'EDIÇÃO DE VÍDEOS',       '#8a5a00', 2),
  ('51000000-0000-4000-8000-000000000004', '5e000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', 'COPY E VÍDEO',           '#b3261e', 3),
  ('51000000-0000-4000-8000-000000000005', '5e000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', 'CONTEÚDO E COMUNICAÇÃO', null,      4),
  ('51000000-0000-4000-8000-000000000006', '5e000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000002', 'Gestão de WhatsApp',     null,      0),
  ('51000000-0000-4000-8000-000000000007', '5e000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000002', 'Gestão de Manychat',     null,      1),
  ('51000000-0000-4000-8000-000000000008', '5e000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000002', 'E-mail MKT',             null,      2),
  ('51000000-0000-4000-8000-000000000009', '5e000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'ATAS',                   null,      0),
  ('51000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'Transcrições',           null,      1),
  ('51000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000002', null,                                   'Demandas comerciais',    null,      0),
  ('51000000-0000-4000-8000-000000000012', '5e000000-0000-4000-8000-000000000003', null,                                   'Gestão',                 null,      0)
on conflict (id) do nothing;

-- Status por lista. A função existe só durante o seed.
create or replace function pg_temp.seed_status(
  p_lista uuid, p_nome text, p_cor text, p_tipo text, p_pos integer
)
returns void
language sql
as $$
  insert into public.tarefas_status (lista_id, nome, cor, tipo, posicao)
  values (p_lista, p_nome, p_cor, p_tipo, p_pos)
  on conflict (lista_id, lower(nome)) do nothing;
$$;

-- Fluxo das listas de produção (Design, Vídeo, Web, Copy) — o mesmo do ClickUp.
do $$
declare l uuid;
begin
  foreach l in array array[
    '51000000-0000-4000-8000-000000000001'::uuid,
    '51000000-0000-4000-8000-000000000002'::uuid,
    '51000000-0000-4000-8000-000000000003'::uuid,
    '51000000-0000-4000-8000-000000000004'::uuid
  ]
  loop
    perform pg_temp.seed_status(l, 'para fazer',             '#8a817c', 'aberto',    0);
    perform pg_temp.seed_status(l, 'em andamento',           '#1f6feb', 'ativo',     1);
    perform pg_temp.seed_status(l, 'feito',                  '#3db88b', 'ativo',     2);
    perform pg_temp.seed_status(l, 'em revisão',             '#7b2cbf', 'ativo',     3);
    perform pg_temp.seed_status(l, 'em alteração & ajustes', '#ef233c', 'ativo',     4);
    perform pg_temp.seed_status(l, 'aguardando informação',  '#ff8500', 'ativo',     5);
    perform pg_temp.seed_status(l, 'descartados',            '#6b717b', 'concluido', 6);
    perform pg_temp.seed_status(l, 'finalizada',             '#008844', 'fechado',   7);
  end loop;
end $$;

-- Conteúdo e Comunicação: o quadro de quatro colunas da captura de tela.
select pg_temp.seed_status('51000000-0000-4000-8000-000000000005', 'para fazer',    '#d33d44', 'aberto',  0);
select pg_temp.seed_status('51000000-0000-4000-8000-000000000005', 'em progresso',  '#1090e0', 'ativo',   1);
select pg_temp.seed_status('51000000-0000-4000-8000-000000000005', 'para revisão',  '#f8ae00', 'ativo',   2);
select pg_temp.seed_status('51000000-0000-4000-8000-000000000005', 'agendado',      '#008844', 'fechado', 3);

-- Demais listas: fluxo simples.
do $$
declare l uuid;
begin
  foreach l in array array[
    '51000000-0000-4000-8000-000000000006'::uuid,
    '51000000-0000-4000-8000-000000000007'::uuid,
    '51000000-0000-4000-8000-000000000008'::uuid,
    '51000000-0000-4000-8000-000000000009'::uuid,
    '51000000-0000-4000-8000-000000000010'::uuid,
    '51000000-0000-4000-8000-000000000011'::uuid,
    '51000000-0000-4000-8000-000000000012'::uuid
  ]
  loop
    perform pg_temp.seed_status(l, 'para fazer',   '#8a817c', 'aberto',  0);
    perform pg_temp.seed_status(l, 'em andamento', '#1f6feb', 'ativo',   1);
    perform pg_temp.seed_status(l, 'em revisão',   '#7b2cbf', 'ativo',   2);
    perform pg_temp.seed_status(l, 'concluído',    '#008844', 'fechado', 3);
  end loop;
end $$;

-- Campos personalizados do espaço Marketing (valem para todas as listas
-- dele) — os mesmos que o time usa hoje.
insert into public.tarefas_campos (id, espaco_id, lista_id, nome, tipo, opcoes, posicao) values
  ('5c000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', null, 'Produto', 'selecao', '[
      {"id":"n4r","nome":"Negócio de 4 Rendas","cor":"#2ecd6f"},
      {"id":"lvse","nome":"Loja Virtual Sem Estoque","cor":"#04a9f4"},
      {"id":"sellerup","nome":"SellerUp","cor":"#f9d900"},
      {"id":"150p","nome":"150 Produtos","cor":"#e65100"},
      {"id":"libertos","nome":"Libertos Mentoria","cor":"#067000"},
      {"id":"desbrava","nome":"Desbrava Mentoring","cor":"#e2a816"},
      {"id":"turbo","nome":"Turbo Vendas","cor":"#e50000"},
      {"id":"ebook-fn","nome":"Ebook Fornecedores Nacionais","cor":"#8a817c"},
      {"id":"libertos-replay","nome":"Libertos Mentoria Replay","cor":"#8a817c"},
      {"id":"destrava","nome":"DESTRAVA RENDA","cor":"#a16a2e"},
      {"id":"mlse","nome":"Mercado Livre Sem Estoque","cor":"#f9d900"},
      {"id":"shopee-se","nome":"Shopee Sem Estoque","cor":"#ff7800"},
      {"id":"conecta-moda","nome":"Conecta Moda","cor":"#b6b6ff"},
      {"id":"rota100k","nome":"Rota do 0 aos 100k - Evento","cor":"#aec0f5"},
      {"id":"lpse","nome":"Loja Pronta Sem Estoque","cor":"#96c7f2"}
    ]'::jsonb, 0),
  ('5c000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000001', null, 'Tipo do Conteúdo', 'selecao', '[
      {"id":"email","nome":"E-mail","cor":"#8a817c"},
      {"id":"post","nome":"Post","cor":"#8a817c"},
      {"id":"criativo","nome":"Criativo","cor":"#8a817c"},
      {"id":"mensagem","nome":"Mensagem","cor":"#8a817c"},
      {"id":"banner","nome":"Banner","cor":"#8a817c"},
      {"id":"live","nome":"Live","cor":"#8a817c"},
      {"id":"ligacao","nome":"Ligação","cor":"#8a817c"}
    ]'::jsonb, 1),
  ('5c000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000001', null, 'Formato de Conteúdo', 'selecao', '[
      {"id":"artigo","nome":"Artigo","cor":"#ff4081"},
      {"id":"video","nome":"Vídeo","cor":"#2ecd6f"},
      {"id":"infografico","nome":"Infográfico","cor":"#f9d900"},
      {"id":"podcast","nome":"Podcast","cor":"#7c4dff"},
      {"id":"webinar","nome":"Webinar","cor":"#1bbc9c"}
    ]'::jsonb, 2),
  ('5c000000-0000-4000-8000-000000000004', '5e000000-0000-4000-8000-000000000001', null, 'Formatos do Conteúdo', 'multiselecao', '[
      {"id":"feed","nome":"Feed","cor":"#e50000"},
      {"id":"story","nome":"Story","cor":"#7c4dff"},
      {"id":"reels","nome":"Reels","cor":"#ff7800"},
      {"id":"estatico","nome":"Estático","cor":"#ff7fab"},
      {"id":"video","nome":"Vídeo","cor":"#f9d900"},
      {"id":"carrossel","nome":"Carrossel","cor":"#2ecd6f"},
      {"id":"audio","nome":"Áudio","cor":"#af7e2e"},
      {"id":"texto","nome":"Texto","cor":"#ff7fab"},
      {"id":"capa-modulo","nome":"Capa de Módulo","cor":"#3397dd"},
      {"id":"thumb","nome":"Thumb","cor":"#04a9f4"},
      {"id":"slides","nome":"Slides","cor":"#7c4dff"},
      {"id":"shorts","nome":"Shorts","cor":"#ea80fc"},
      {"id":"id-visual","nome":"ID. Visual","cor":"#b6b6ff"},
      {"id":"banner","nome":"Banner","cor":"#aec0f5"}
    ]'::jsonb, 3),
  ('5c000000-0000-4000-8000-000000000005', '5e000000-0000-4000-8000-000000000001', null, 'Canais', 'multiselecao', '[
      {"id":"instagram","nome":"Instagram","cor":"#bf55ec"},
      {"id":"youtube","nome":"YouTube","cor":"#e50000"},
      {"id":"tiktok","nome":"TikTok","cor":"#7c4dff"},
      {"id":"facebook","nome":"Facebook","cor":"#81b1ff"},
      {"id":"curseduca","nome":"Curseduca","cor":"#667684"},
      {"id":"ig-channel","nome":"Ig. Channel","cor":"#8a817c"},
      {"id":"whatsapp","nome":"WhatsApp","cor":"#2ecd6f"},
      {"id":"whatsapp-grupo","nome":"WhatsApp Grupo","cor":"#2ecd6f"},
      {"id":"activecampaign","nome":"ActiveCampaign","cor":"#0231e8"},
      {"id":"manychat","nome":"Manychat","cor":"#8a817c"},
      {"id":"typebot","nome":"Typebot","cor":"#8a817c"},
      {"id":"make","nome":"Make","cor":"#8a817c"},
      {"id":"onprofit","nome":"OnProfit","cor":"#92ceac"},
      {"id":"criativos","nome":"Criativos","cor":"#81b1ff"},
      {"id":"linkedin","nome":"Linkedin","cor":"#f9d900"},
      {"id":"comercial","nome":"Comercial","cor":"#9b59b6"},
      {"id":"vsl","nome":"VSL","cor":"#800000"},
      {"id":"google-forms","nome":"Google Forms","cor":"#3397dd"},
      {"id":"reclame-aqui","nome":"Reclame Aqui","cor":"#1f5e41"},
      {"id":"slides","nome":"Slides","cor":"#b6b6ff"}
    ]'::jsonb, 4),
  ('5c000000-0000-4000-8000-000000000006', '5e000000-0000-4000-8000-000000000001', null, 'Evento', 'selecao', '[
      {"id":"bf2025","nome":"BLACK FRIDAY 2025","cor":"#f8106b"},
      {"id":"rota100k-presencial","nome":"ROTA 100K PRESENCIAL","cor":"#b6b6ff"}
    ]'::jsonb, 5),
  ('5c000000-0000-4000-8000-000000000007', '5e000000-0000-4000-8000-000000000001', null, 'Data de Publicação',       'data',   '[]'::jsonb, 6),
  ('5c000000-0000-4000-8000-000000000008', '5e000000-0000-4000-8000-000000000001', null, 'Feedback do Cliente',      'texto',  '[]'::jsonb, 7),
  ('5c000000-0000-4000-8000-000000000009', '5e000000-0000-4000-8000-000000000001', null, 'Copywriter',               'pessoa', '[]'::jsonb, 8),
  ('5c000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', null, 'Designer',                 'pessoa', '[]'::jsonb, 9),
  ('5c000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000001', null, 'Editor de Vídeos',         'pessoa', '[]'::jsonb, 10),
  ('5c000000-0000-4000-8000-000000000012', '5e000000-0000-4000-8000-000000000001', null, 'Webdesigner',              'pessoa', '[]'::jsonb, 11),
  ('5c000000-0000-4000-8000-000000000013', '5e000000-0000-4000-8000-000000000001', null, 'Social Media',             'pessoa', '[]'::jsonb, 12),
  ('5c000000-0000-4000-8000-000000000014', '5e000000-0000-4000-8000-000000000001', null, 'Gestor de Tráfego',        'pessoa', '[]'::jsonb, 13),
  ('5c000000-0000-4000-8000-000000000015', '5e000000-0000-4000-8000-000000000001', null, 'Gestor de Projetos',       'pessoa', '[]'::jsonb, 14),
  ('5c000000-0000-4000-8000-000000000016', '5e000000-0000-4000-8000-000000000001', null, 'Coordenador de Marketing', 'pessoa', '[]'::jsonb, 15),
  ('5c000000-0000-4000-8000-000000000017', '5e000000-0000-4000-8000-000000000001', null, 'Responsável pela Revisão', 'pessoa', '[]'::jsonb, 16)
on conflict (id) do nothing;

drop function if exists pg_temp.seed_status(uuid, text, text, text, integer);
