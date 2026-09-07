-- =====================================================================
--  HUB DE MARKETING UNIFICADO — CANALI COMPANY
--  Schema PostgreSQL / Supabase
-- ---------------------------------------------------------------------
--  Como aplicar:
--    Supabase Studio > SQL Editor > cole este arquivo > Run
--    ou:  psql "$DATABASE_URL" -f supabase/schema.sql
--
--  Fuso horário de referência: America/Sao_Paulo (todo o negócio é BR).
--  Valores monetários: numeric(14,2) — nunca float (erro de arredondamento).
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
--  1. TIPOS
-- =====================================================================

do $$ begin
  create type public.platform_source as enum ('hotmart', 'onprofit', 'tmb', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.transaction_status as enum (
    'approved',    -- venda aprovada, entra no faturamento
    'pending',     -- boleto/pix aguardando compensação
    'refunded',    -- reembolso processado
    'chargeback',  -- estorno via operadora
    'canceled',    -- cancelada antes da aprovação
    'expired'      -- boleto/pix não pago
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.action_status as enum ('active', 'paused', 'draft', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ad_platform as enum ('meta_ads', 'google_ads', 'tiktok_ads', 'manual');
exception when duplicate_object then null; end $$;

-- =====================================================================
--  2. FUNÇÃO UTILITÁRIA — updated_at automático
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
--  BLOCO 1 — METAS ANUAIS & EBITDA
-- =====================================================================

-- Metas anuais de faturamento + objetivo de EBITDA.
create table if not exists public.annual_goals (
  id                uuid primary key default gen_random_uuid(),
  year              integer      not null,
  label             text         not null,                 -- "META 1" / "META 2"
  target_revenue    numeric(14,2) not null check (target_revenue > 0),
  target_ebitda_pct numeric(5,2)  not null check (target_ebitda_pct between 0 and 100),
  description       text,
  accent            text         not null default 'emerald', -- cor do painel na Home
  sort_order        integer      not null default 0,
  is_active         boolean      not null default true,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now(),
  unique (year, label)
);

comment on table public.annual_goals is
  'Metas anuais exibidas no Bloco 1 da Home. Ex.: META 1 = R$ 12.168.000,00 @ 22,5% EBITDA.';

-- EBITDA acumulado, inserido manualmente pelo time no painel admin (mês a mês).
create table if not exists public.monthly_financials (
  id             uuid primary key default gen_random_uuid(),
  year           integer      not null,
  month          integer      not null check (month between 1 and 12),
  ebitda_pct     numeric(5,2),                   -- % de EBITDA do mês
  ebitda_value   numeric(14,2),                  -- valor absoluto de EBITDA
  revenue_manual numeric(14,2),                  -- faturamento oficial (fechamento contábil)
  costs          numeric(14,2),                  -- custos/despesas do mês
  notes          text,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now(),
  unique (year, month)
);

comment on table public.monthly_financials is
  'Fechamento financeiro mensal inserido manualmente. Alimenta o % de EBITDA acumulado do ano.';

-- =====================================================================
--  BLOCO 2 — VENDAS (WEBHOOKS) & TRÁFEGO
-- =====================================================================

-- Uma linha por transação. Reembolso/chargeback ATUALIZA a linha original
-- (não cria outra), então o faturamento sai automaticamente dos agregados.
create table if not exists public.sales_transactions (
  id              uuid primary key default gen_random_uuid(),
  platform        public.platform_source     not null,
  external_id     text                       not null,  -- id da transação na plataforma
  status          public.transaction_status  not null default 'approved',
  gross_amount    numeric(14,2)              not null default 0 check (gross_amount >= 0),
  platform_fee    numeric(14,2)              not null default 0 check (platform_fee >= 0),
  net_amount      numeric(14,2)              not null default 0,
  refunded_amount numeric(14,2)              not null default 0 check (refunded_amount >= 0),
  currency        text                       not null default 'BRL',
  product_name    text,
  product_id      text,
  offer_code      text,
  payment_method  text,
  installments    integer,
  buyer_name      text,
  buyer_email     text,
  affiliate       text,
  occurred_at     timestamptz                not null,   -- data da VENDA (não do webhook)
  refunded_at     timestamptz,
  raw_payload     jsonb,
  created_at      timestamptz                not null default now(),
  updated_at      timestamptz                not null default now(),
  unique (platform, external_id)
);

comment on table public.sales_transactions is
  'Vendas normalizadas de Hotmart, OnProfit e TMB. Chave natural: (platform, external_id) — garante idempotência dos webhooks.';
comment on column public.sales_transactions.net_amount is
  'Faturamento líquido da transação = gross_amount - platform_fee. Zerado em reembolso/chargeback.';

create index if not exists idx_sales_occurred_at on public.sales_transactions (occurred_at desc);
create index if not exists idx_sales_status      on public.sales_transactions (status);
create index if not exists idx_sales_platform    on public.sales_transactions (platform);
-- Índice parcial: a query mais quente é "vendas aprovadas do período".
create index if not exists idx_sales_approved_period
  on public.sales_transactions (occurred_at desc)
  where status = 'approved';

-- Faturamento lançado à mão, por plataforma e mês.
-- Existe porque nem toda plataforma entrega webhook utilizável (OnProfit e
-- TMB não entregaram). É um AGREGADO do mês, não uma transação: por isso
-- fica fora de sales_transactions, que guarda uma linha por venda real.
create table if not exists public.manual_platform_revenue (
  id            uuid primary key default gen_random_uuid(),
  year          integer                not null,
  month         integer                not null check (month between 1 and 12),
  platform      public.platform_source not null,
  gross_revenue numeric(14,2)          not null default 0 check (gross_revenue >= 0),
  platform_fees numeric(14,2)          not null default 0 check (platform_fees >= 0),
  net_revenue   numeric(14,2)                   check (net_revenue >= 0),
  sales_count   integer                not null default 0 check (sales_count >= 0),
  notes         text,
  created_at    timestamptz            not null default now(),
  updated_at    timestamptz            not null default now(),
  -- Um lançamento por plataforma por mês: é o que faz o upsert do admin
  -- substituir o valor em vez de acumular duplicatas.
  unique (year, month, platform)
);

comment on table public.manual_platform_revenue is
  'Faturamento mensal lançado à mão, por plataforma. Somado às transações reais dentro de v_monthly_revenue e v_annual_summary.';
comment on column public.manual_platform_revenue.net_revenue is
  'Líquido informado manualmente. NULL faz o cálculo cair para gross_revenue - platform_fees.';

create index if not exists idx_manual_revenue_periodo
  on public.manual_platform_revenue (year, month);

-- Investimento em tráfego, granularidade diária por campanha.
create table if not exists public.ad_spend (
  id             uuid primary key default gen_random_uuid(),
  platform       public.ad_platform not null default 'meta_ads',
  account_id     text               not null default 'default',
  campaign_id    text               not null default 'all',
  campaign_name  text,
  spend_date     date               not null,
  spend          numeric(14,2)      not null default 0 check (spend >= 0),
  impressions    bigint             not null default 0,
  clicks         bigint             not null default 0,
  conversions    numeric(12,2)      not null default 0,
  revenue_attributed numeric(14,2)  not null default 0,
  raw_payload    jsonb,
  created_at     timestamptz        not null default now(),
  updated_at     timestamptz        not null default now(),
  unique (platform, account_id, campaign_id, spend_date)
);

comment on table public.ad_spend is
  'Gasto de mídia por dia/campanha. Sincronizado do Meta Ads via /api/integrations/meta-ads/sync ou lançado manualmente no admin.';

create index if not exists idx_ad_spend_date on public.ad_spend (spend_date desc);

-- Taxas padrão por plataforma — usadas quando o webhook não informa a taxa.
create table if not exists public.platform_fees (
  platform      public.platform_source primary key,
  fee_percent   numeric(5,2)  not null default 0 check (fee_percent between 0 and 100),
  fee_fixed     numeric(10,2) not null default 0 check (fee_fixed >= 0),
  updated_at    timestamptz   not null default now()
);

comment on table public.platform_fees is
  'Fallback de taxa por plataforma. Só é aplicado quando o payload do webhook não traz a taxa real.';

-- Log bruto de TODO webhook recebido — auditoria e reprocessamento.
create table if not exists public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  platform        text        not null,
  event_type      text,
  external_id     text,
  signature_valid boolean     not null default false,
  processed       boolean     not null default false,
  error_message   text,
  payload         jsonb       not null,
  received_at     timestamptz not null default now()
);

create index if not exists idx_webhook_received on public.webhook_events (received_at desc);
create index if not exists idx_webhook_platform on public.webhook_events (platform, processed);

-- =====================================================================
--  BLOCO 3 — AÇÕES DE MARKETING ATIVAS
-- =====================================================================

create table if not exists public.marketing_actions (
  id              uuid primary key default gen_random_uuid(),
  title           text                 not null,
  slug            text                 not null unique,
  subtitle        text,
  description     text,                                  -- descrição detalhada (modal)
  how_it_works    text,                                  -- funcionamento do fluxo
  image_url       text,                                  -- imagem de capa do card
  flow_image_url  text,                                  -- fluxograma exibido no modal
  status          public.action_status not null default 'active',
  category        text,                                  -- Funil, Webinário, Consultoria...
  target_audience text,
  -- Dia da semana de uma ação recorrente. Código curto e sem acento ('SAB',
  -- não 'SÁB'): estável, cabe no CHECK e não depende de collation. O texto
  -- exibido ("Toda Quinta") é montado na aplicação. NULL = não se aplica.
  dia_semana      text
    check (dia_semana is null or dia_semana in ('SEG','TER','QUA','QUI','SEX','SAB','DOM')),
  owner_name      text,
  owner_email     text,
  accent          text                 not null default 'emerald',
  links           jsonb                not null default '[]'::jsonb,     -- [{label,url,type}]
  briefings       jsonb                not null default '[]'::jsonb,     -- [{label,url}]
  metrics         jsonb                not null default '{}'::jsonb,     -- KPIs livres do card
  sort_order      integer              not null default 0,
  created_at      timestamptz          not null default now(),
  updated_at      timestamptz          not null default now()
);

comment on table public.marketing_actions is
  'Cards do Bloco 3. links/briefings são arrays JSON de {label, url}.';

create index if not exists idx_actions_status on public.marketing_actions (status, sort_order);

-- =====================================================================
--  BLOCO 4a — REPOSITÓRIO DE DOCUMENTOS
-- =====================================================================

create table if not exists public.document_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        not null unique,
  description text,
  icon        text        not null default 'Folder',   -- nome do ícone lucide-react
  accent      text        not null default 'slate',
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid        not null references public.document_categories (id) on delete cascade,
  title       text        not null,
  description text,
  url         text        not null,
  provider    text        not null default 'link',  -- google_drive | clickup | vturb | curseduca | notion | link
  tags        text[]      not null default '{}',
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_documents_category on public.documents (category_id, sort_order);

-- =====================================================================
--  BLOCO 4b — COFRE DE SENHAS
-- =====================================================================
--  A senha é gravada CIFRADA (AES-256-GCM, chave em VAULT_ENCRYPTION_KEY,
--  fora do banco). Um vazamento do banco não expõe credenciais.
--  RLS bloqueia anon/authenticated: só a service_role lê, e só depois da
--  validação da Senha Mestre no servidor.
-- =====================================================================

create table if not exists public.vault_credentials (
  id                 uuid primary key default gen_random_uuid(),
  service_name       text        not null,
  category           text        not null default 'Geral',
  -- Subcategoria opcional: base do controle de acesso por perfil.
  -- NULL = visível somente no acesso Master.
  subcategoria       text,
  username           text,
  password_encrypted text,                       -- payload AES-256-GCM (iv:tag:ciphertext)
  url                text,
  notes              text,
  extra              jsonb       not null default '{}'::jsonb,
  sort_order         integer     not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column public.vault_credentials.password_encrypted is
  'NUNCA gravar senha em texto puro aqui. Formato: base64(iv):base64(authTag):base64(ciphertext).';

create index if not exists idx_vault_category on public.vault_credentials (category, sort_order);
create index if not exists idx_vault_subcategoria
  on public.vault_credentials (subcategoria) where subcategoria is not null;

-- Auditoria de acesso ao cofre.
create table if not exists public.vault_access_log (
  id          uuid primary key default gen_random_uuid(),
  success     boolean     not null,
  perfil_id   uuid,
  escopo      text,
  ip_address  text,
  user_agent  text,
  accessed_at timestamptz not null default now()
);

create index if not exists idx_vault_log_time on public.vault_access_log (accessed_at desc);

-- Perfis de acesso ao cofre: cada colaborador tem um PIN e enxerga apenas
-- as subcategorias liberadas para ele.
create table if not exists public.cofre_perfis (
  id                       uuid primary key default gen_random_uuid(),
  nome_colaborador         text        not null,
  pin_hash                 text        not null,
  subcategorias_permitidas text[]      not null default '{}',
  ativo                    boolean     not null default true,
  -- Um PIN de 4 dígitos tem só 10.000 combinações. Sem bloqueio por
  -- tentativas, a força bruta é trivial.
  tentativas_falhas        integer     not null default 0,
  bloqueado_ate            timestamptz,
  ultimo_acesso_em         timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.cofre_perfis is
  'Colaboradores com acesso ao Cofre. O PIN é guardado como hash scrypt — nunca em texto puro.';

create unique index if not exists idx_cofre_perfis_nome
  on public.cofre_perfis (lower(nome_colaborador));
create index if not exists idx_cofre_perfis_ativo
  on public.cofre_perfis (ativo, nome_colaborador);

-- Contagem atômica de tentativas: dois PINs errados simultâneos não podem
-- se perder numa atualização sobrescrevendo a outra.
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
as $fn$
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
$fn$;

revoke all on function public.cofre_registrar_tentativa from public, anon, authenticated;

-- =====================================================================
--  CONFIGURAÇÕES DA APLICAÇÃO
-- =====================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is
  'Config chave/valor. Guarda o hash scrypt da Senha Mestre em key = vault_master_password.';

-- =====================================================================
--  TRIGGERS updated_at
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'annual_goals', 'monthly_financials', 'sales_transactions', 'ad_spend',
    'marketing_actions', 'document_categories', 'documents',
    'vault_credentials', 'app_settings', 'platform_fees', 'cofre_perfis',
    'manual_platform_revenue'
  ]
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- =====================================================================
--  CONTROLE DE ACESSO
-- ---------------------------------------------------------------------
--  Precede as views porque elas chamam estas funções.
-- =====================================================================

-- Quem pode entrar no Hub. Estar autenticado no Supabase NÃO basta:
-- qualquer pessoa consegue criar uma conta lá. O que autoriza é constar
-- aqui, ativo.
create table if not exists public.colaboradores_autorizados (
  id               uuid primary key default gen_random_uuid(),
  email            text        not null,
  papel            text        not null default 'colaborador'
                   check (papel in ('admin', 'colaborador')),
  nome             text,
  ativo            boolean     not null default true,
  ultimo_acesso_em timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists idx_colaboradores_email_unico
  on public.colaboradores_autorizados (lower(email));

-- Contador de tentativas da Senha Mestre. Linha única — o cofre é um.
create table if not exists public.cofre_master_tentativas (
  id                boolean primary key default true check (id),
  tentativas_falhas integer not null default 0,
  bloqueado_ate     timestamptz,
  ultima_tentativa  timestamptz
);
insert into public.cofre_master_tentativas (id) values (true) on conflict do nothing;

-- SECURITY DEFINER de propósito: precisam ler a tabela acima, que o
-- próprio usuário não enxerga. Devolvem só true/false, nunca conteúdo.
-- search_path fixo fecha o sequestro de nome de tabela, que é o risco
-- real de uma função SECURITY DEFINER.
create or replace function public.eh_colaborador()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.colaboradores_autorizados c
    where lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and c.ativo
  );
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.colaboradores_autorizados c
    where lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and c.ativo and c.papel = 'admin'
  );
$$;

-- Guarda das views agregadas. Ver comentário na seção de GRANTS.
create or replace function public.pode_ver_agregados()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(auth.role(), '') = 'service_role'
      or public.eh_colaborador();
$$;

revoke all on function public.eh_colaborador()      from public;
revoke all on function public.eh_admin()            from public;
revoke all on function public.pode_ver_agregados()  from public;
grant execute on function public.eh_colaborador()     to authenticated;
grant execute on function public.eh_admin()           to authenticated;
grant execute on function public.pode_ver_agregados() to authenticated, service_role;

-- =====================================================================
--  VIEWS AGREGADAS
-- ---------------------------------------------------------------------
--  security_invoker = off (padrão): as views expõem SOMENTE números
--  agregados, nunca linhas individuais. É intencional — permite que o
--  painel público leia métricas sem dar acesso à tabela de transações.
-- =====================================================================

create or replace view public.v_monthly_revenue as
with combinado as (
  select
    extract(year  from (t.occurred_at at time zone 'America/Sao_Paulo'))::int as year,
    extract(month from (t.occurred_at at time zone 'America/Sao_Paulo'))::int as month,
    t.platform,
    count(*) filter (where t.status = 'approved')                                           as approved_count,
    coalesce(sum(t.gross_amount)    filter (where t.status = 'approved'), 0)                as gross_revenue,
    coalesce(sum(t.net_amount)      filter (where t.status = 'approved'), 0)                as net_revenue,
    coalesce(sum(t.platform_fee)    filter (where t.status = 'approved'), 0)                as platform_fees,
    coalesce(sum(t.refunded_amount) filter (where t.status in ('refunded','chargeback')), 0) as refunded_amount,
    count(*) filter (where t.status in ('refunded','chargeback'))                           as refund_count
  from public.sales_transactions t
  group by 1, 2, 3

  union all

  select
    m.year,
    m.month,
    m.platform,
    m.sales_count::bigint,
    m.gross_revenue,
    coalesce(m.net_revenue, m.gross_revenue - m.platform_fees),
    m.platform_fees,
    -- O lançamento manual pede o bruto já sem reembolsos.
    0::numeric,
    0::bigint
  from public.manual_platform_revenue m
)
-- O group by externo é essencial: uma plataforma com webhook E lançamento
-- manual no mesmo mês precisa sair em UMA linha, senão o Bloco 2 mostraria
-- a mesma plataforma duas vezes.
select
  make_date(c.year, c.month, 1)     as month_start,
  c.year,
  c.month,
  c.platform,
  sum(c.approved_count)::bigint     as approved_count,
  sum(c.gross_revenue)              as gross_revenue,
  sum(c.net_revenue)                as net_revenue,
  sum(c.platform_fees)              as platform_fees,
  sum(c.refunded_amount)            as refunded_amount,
  sum(c.refund_count)::bigint       as refund_count
from combinado c
where public.pode_ver_agregados()
group by 1, 2, 3, 4;

comment on view public.v_monthly_revenue is
  'Faturamento bruto/líquido por mês e plataforma, somando webhooks e lançamentos manuais. Reembolsos saem do agregado porque mudam o status da linha original.';

create or replace view public.v_monthly_ad_spend as
select
  (date_trunc('month', s.spend_date))::date                as month_start,
  extract(year  from s.spend_date)::int                    as year,
  extract(month from s.spend_date)::int                    as month,
  s.platform,
  coalesce(sum(s.spend), 0)                                as total_spend,
  coalesce(sum(s.impressions), 0)                          as impressions,
  coalesce(sum(s.clicks), 0)                               as clicks,
  coalesce(sum(s.conversions), 0)                          as conversions
from public.ad_spend s
where public.pode_ver_agregados()
group by 1, 2, 3, 4;

-- Consolidado anual: alimenta a barra de progresso e a projeção linear do Bloco 1.
create or replace view public.v_annual_summary as
with combinado as (
  select
    extract(year from (t.occurred_at at time zone 'America/Sao_Paulo'))::int as year,
    coalesce(sum(t.gross_amount) filter (where t.status = 'approved'), 0)    as gross_revenue,
    coalesce(sum(t.net_amount)   filter (where t.status = 'approved'), 0)    as net_revenue,
    count(*) filter (where t.status = 'approved')                            as approved_count
  from public.sales_transactions t
  group by 1

  union all

  select
    m.year,
    coalesce(sum(m.gross_revenue), 0),
    coalesce(sum(coalesce(m.net_revenue, m.gross_revenue - m.platform_fees)), 0),
    coalesce(sum(m.sales_count), 0)::bigint
  from public.manual_platform_revenue m
  group by 1
)
select
  c.year,
  sum(c.gross_revenue)          as gross_revenue,
  sum(c.net_revenue)            as net_revenue,
  sum(c.approved_count)::bigint as approved_count
from combinado c
where public.pode_ver_agregados()
group by 1;

-- =====================================================================
--  INGESTÃO ATÔMICA DE VENDAS
-- ---------------------------------------------------------------------
--  Plataformas não garantem ordem de entrega dos webhooks: um
--  PURCHASE_APPROVED atrasado pode chegar DEPOIS do reembolso da mesma
--  transação. Fazer "select, decide, update" no app abriria janela de
--  corrida entre dois webhooks simultâneos — então a decisão acontece
--  aqui dentro, sob um FOR UPDATE que serializa por transação.
-- =====================================================================

create or replace function public.status_rank(s public.transaction_status)
returns integer
language sql
immutable
as $$
  select case s
    when 'expired'    then 0
    when 'canceled'   then 1
    when 'pending'    then 2
    when 'approved'   then 3
    when 'refunded'   then 4
    when 'chargeback' then 5
    else 0
  end;
$$;

create or replace function public.ingest_sales_transaction(
  p_platform       public.platform_source,
  p_external_id    text,
  p_status         public.transaction_status,
  p_gross          numeric,
  p_fee            numeric,
  p_net            numeric,
  p_currency       text,
  p_product_name   text,
  p_product_id     text,
  p_offer_code     text,
  p_payment_method text,
  p_installments   integer,
  p_buyer_name     text,
  p_buyer_email    text,
  p_affiliate      text,
  p_occurred_at    timestamptz,
  p_refunded_at    timestamptz,
  p_raw            jsonb
)
-- Os parâmetros de saída NÃO se chamam "id": em plpgsql eles viram variáveis,
-- e um nome igual ao da coluna deixaria toda referência a `id` ambígua.
returns table (transaction_id uuid, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id         uuid;
  v_cur_status public.transaction_status;
  v_is_refund  boolean := p_status in ('refunded', 'chargeback');
begin
  select t.id, t.status
    into v_id, v_cur_status
    from public.sales_transactions t
   where t.platform = p_platform
     and t.external_id = p_external_id
   for update;

  -- Primeira vez que vemos esta transação.
  if v_id is null then
    insert into public.sales_transactions (
      platform, external_id, status, gross_amount, platform_fee, net_amount,
      refunded_amount, currency, product_name, product_id, offer_code,
      payment_method, installments, buyer_name, buyer_email, affiliate,
      occurred_at, refunded_at, raw_payload
    ) values (
      p_platform, p_external_id, p_status, p_gross, p_fee,
      case when v_is_refund then 0 else p_net end,
      case when v_is_refund then p_gross else 0 end,
      coalesce(p_currency, 'BRL'), p_product_name, p_product_id, p_offer_code,
      p_payment_method, p_installments, p_buyer_name, p_buyer_email, p_affiliate,
      p_occurred_at, p_refunded_at, p_raw
    )
    returning sales_transactions.id into v_id;

    return query select v_id, true;
    return;
  end if;


  -- Evento fora de ordem (ex.: "aprovado" chegando após o reembolso): ignora.
  if public.status_rank(p_status) < public.status_rank(v_cur_status) then
    return query select v_id, false;
    return;
  end if;

  update public.sales_transactions t
     set status          = p_status,
         gross_amount    = case when p_gross > 0 then p_gross else t.gross_amount end,
         platform_fee    = case when v_is_refund then t.platform_fee else p_fee end,
         net_amount      = case when v_is_refund then 0 else p_net end,
         refunded_amount = case
                             when v_is_refund then greatest(p_gross, t.gross_amount)
                             else t.refunded_amount
                           end,
         refunded_at     = coalesce(p_refunded_at, t.refunded_at),
         product_name    = coalesce(p_product_name, t.product_name),
         buyer_name      = coalesce(p_buyer_name, t.buyer_name),
         buyer_email     = coalesce(p_buyer_email, t.buyer_email),
         payment_method  = coalesce(p_payment_method, t.payment_method),
         -- occurred_at nunca é sobrescrito: a venda pertence ao mês em que
         -- aconteceu, mesmo que o reembolso chegue meses depois.
         raw_payload     = p_raw
   where t.id = v_id;

  return query select v_id, true;
end;
$$;

revoke all on function public.ingest_sales_transaction from public, anon, authenticated;

-- =====================================================================
--  ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
--  Painel é público para o time, então conteúdo editorial é leitura
--  aberta. Dados sensíveis (transações, cofre, settings, logs) ficam
--  acessíveis apenas à service_role, que roda somente no servidor.
-- =====================================================================

alter table public.annual_goals        enable row level security;
alter table public.monthly_financials  enable row level security;
alter table public.marketing_actions   enable row level security;
alter table public.document_categories enable row level security;
alter table public.documents           enable row level security;
alter table public.sales_transactions  enable row level security;
alter table public.ad_spend            enable row level security;
alter table public.manual_platform_revenue enable row level security;
alter table public.platform_fees       enable row level security;
alter table public.webhook_events      enable row level security;
alter table public.vault_credentials   enable row level security;
alter table public.vault_access_log    enable row level security;
alter table public.app_settings        enable row level security;
alter table public.colaboradores_autorizados enable row level security;
alter table public.cofre_master_tentativas   enable row level security;

-- Leitura liberada SOMENTE para colaborador autorizado e ativo.
--
-- O papel `anon` (a chave que vai dentro do JavaScript do navegador) não
-- aparece em nenhuma policy: quem extrair essa chave do bundle e chamar a
-- API REST do Supabase direto não lê linha nenhuma. Estar autenticado
-- também não basta — qualquer um pode criar conta no Supabase; o que vale
-- é constar em colaboradores_autorizados.
do $$
declare
  t text;
begin
  foreach t in array array[
    'annual_goals', 'monthly_financials', 'marketing_actions',
    'document_categories', 'documents'
  ]
  loop
    -- Remove a policy pública de versões anteriores deste arquivo.
    execute format('drop policy if exists "public_read_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "colaborador_le_%1$s" on public.%1$s', t);
    execute format(
      'create policy "colaborador_le_%1$s" on public.%1$s
         for select to authenticated using (public.eh_colaborador())', t);
  end loop;
end $$;

-- Tabelas sensíveis: nenhuma policy = nenhum acesso, nem para colaborador
-- logado. A service_role ignora RLS por definição, e só roda no servidor.

-- =====================================================================
--  GRANTS
-- =====================================================================

-- As views são SECURITY DEFINER (ignoram o RLS das tabelas de baixo), então
-- quem decide o acesso a elas é o GRANT — e o GRANT sozinho liberaria
-- qualquer conta autenticada. Por isso a checagem também está DENTRO da
-- definição de cada view, via public.pode_ver_agregados().
grant select on public.v_monthly_revenue  to authenticated;
grant select on public.v_monthly_ad_spend to authenticated;
grant select on public.v_annual_summary   to authenticated;

-- Revoga o que versões anteriores deste arquivo concederam ao anônimo.
do $$
declare t text;
begin
  foreach t in array array[
    'annual_goals', 'monthly_financials', 'marketing_actions',
    'document_categories', 'documents', 'sales_transactions', 'ad_spend',
    'manual_platform_revenue', 'platform_fees', 'webhook_events',
    'vault_credentials', 'vault_access_log', 'app_settings', 'cofre_perfis',
    'colaboradores_autorizados', 'cofre_master_tentativas'
  ]
  loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

revoke all on public.v_monthly_revenue  from anon;
revoke all on public.v_monthly_ad_spend from anon;
revoke all on public.v_annual_summary   from anon;

-- =====================================================================
--  REALTIME — atualiza a Home sem refresh quando um webhook chega
-- =====================================================================

do $$
begin
  alter publication supabase_realtime add table public.sales_transactions;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.ad_spend;
exception when duplicate_object then null; when undefined_object then null; end $$;
