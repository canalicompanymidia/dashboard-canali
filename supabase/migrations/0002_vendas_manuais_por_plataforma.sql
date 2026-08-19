-- =====================================================================
--  MIGRATION 0002 — Lançamento manual de vendas por plataforma
-- ---------------------------------------------------------------------
--  Motivo: OnProfit e TMB não entregaram a integração automática. O time
--  precisa lançar o acumulado do mês à mão e ver esse faturamento somado
--  ao da Hotmart nos Blocos 1 e 2 da Home.
--
--  Estratégia: uma tabela de agregados mensais, unida às transações
--  DENTRO das views. Assim nenhuma consulta do painel muda — quem lê
--  v_monthly_revenue e v_annual_summary passa a ver os dois mundos
--  somados automaticamente.
--
--  Idempotente e não destrutivo: pode rodar mais de uma vez, e não toca
--  em nenhuma linha de sales_transactions.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. TABELA
-- ---------------------------------------------------------------------

create table if not exists public.manual_platform_revenue (
  id            uuid primary key default gen_random_uuid(),
  year          integer                not null,
  month         integer                not null check (month between 1 and 12),
  platform      public.platform_source not null,

  -- Faturamento bruto aprovado do mês, já sem reembolsos.
  gross_revenue numeric(14,2)          not null default 0 check (gross_revenue >= 0),
  -- Taxas/comissões retidas pela plataforma.
  platform_fees numeric(14,2)          not null default 0 check (platform_fees >= 0),
  -- Líquido informado à mão. NULL = derivar de bruto - taxas, que é a mesma
  -- regra de sales_transactions.net_amount. Preencher aqui tem precedência.
  net_revenue   numeric(14,2)                   check (net_revenue >= 0),
  -- Quantidade de vendas. Alimenta o contador de vendas do Bloco 2.
  sales_count   integer                not null default 0 check (sales_count >= 0),

  notes         text,
  created_at    timestamptz            not null default now(),
  updated_at    timestamptz            not null default now(),

  -- Um lançamento por plataforma por mês: o valor é acumulado, não incremental.
  -- É esta constraint que faz o upsert do admin substituir em vez de duplicar.
  unique (year, month, platform)
);

comment on table public.manual_platform_revenue is
  'Faturamento mensal lançado à mão, por plataforma. Usado quando não há integração automática (OnProfit, TMB). Somado às transações reais dentro de v_monthly_revenue e v_annual_summary.';
comment on column public.manual_platform_revenue.net_revenue is
  'Líquido informado manualmente. NULL faz o cálculo cair para gross_revenue - platform_fees.';

create index if not exists idx_manual_revenue_periodo
  on public.manual_platform_revenue (year, month);

drop trigger if exists trg_manual_platform_revenue_updated_at on public.manual_platform_revenue;
create trigger trg_manual_platform_revenue_updated_at
  before update on public.manual_platform_revenue
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  2. RLS
--  Mesma política de sales_transactions: RLS ligado, nenhuma policy.
--  O anônimo não lê a tabela; enxerga só o agregado, pelas views.
-- ---------------------------------------------------------------------

alter table public.manual_platform_revenue enable row level security;

-- ---------------------------------------------------------------------
--  3. VIEWS
--  Recriadas somando as duas origens. O group by externo é essencial:
--  uma plataforma com webhook E lançamento manual no mesmo mês precisa
--  sair em UMA linha, senão o Bloco 2 mostraria "OnProfit" duas vezes.
-- ---------------------------------------------------------------------

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
    -- O lançamento manual pede o bruto já sem reembolsos, então não há
    -- estorno a reportar separadamente.
    0::numeric,
    0::bigint
  from public.manual_platform_revenue m
)
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
group by 1, 2, 3, 4;

comment on view public.v_monthly_revenue is
  'Faturamento bruto/líquido por mês e plataforma, somando webhooks e lançamentos manuais. Reembolsos saem do agregado porque mudam o status da linha original.';

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
group by 1;

-- ---------------------------------------------------------------------
--  4. GRANTS
--  Recriar uma view com CREATE OR REPLACE preserva os grants, mas
--  reaplicar é barato e protege quem rodar isto num banco onde a view
--  precisou ser dropada antes.
-- ---------------------------------------------------------------------

grant select on public.v_monthly_revenue to anon, authenticated;
grant select on public.v_annual_summary  to anon, authenticated;
