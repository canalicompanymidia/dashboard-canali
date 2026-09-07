-- =====================================================================
--  MIGRATION 0004b — Fecha o acesso anônimo  (PARTE 2 de 2)
-- ---------------------------------------------------------------------
--  ⚠️  SÓ RODE DEPOIS DE:
--      1. ter rodado a 0004a
--      2. ter publicado o código com a tela de login
--      3. ter entrado no Hub com seu e-mail e confirmado que funciona
--
--  Rodar antes disso deixa o Hub em branco para todo mundo, inclusive
--  para você. Se isso acontecer, o rollback está no fim do arquivo.
--
--  O que muda: a chave pública que vai no navegador deixa de ler
--  qualquer coisa. Só um colaborador logado E na lista enxerga dados.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. GUARDA DAS VIEWS
--
--  As views agregadas são SECURITY DEFINER (ignoram o RLS das tabelas de
--  baixo) — é o que permite mostrar faturamento sem expor a tabela de
--  transações. Só que isso também significa que o acesso a elas é
--  decidido por GRANT, e não por policy. Um GRANT para `authenticated`
--  liberaria QUALQUER pessoa que criasse conta no Supabase.
--
--  Por isso a checagem entra dentro da própria view.
-- ---------------------------------------------------------------------

create or replace function public.pode_ver_agregados()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- O servidor do Hub (service_role). Já ignora RLS por definição;
    -- liberá-lo aqui não aumenta a superfície pública.
    coalesce(auth.role(), '') = 'service_role'
    -- O caso normal: colaborador logado e ativo na lista.
    or public.eh_colaborador();
$$;

-- NOTA: uma versão anterior desta função também liberava
-- `session_user in ('postgres','supabase_admin')`, para o SQL Editor
-- continuar enxergando as views. Foi removido de propósito: a cláusula
-- depende de um detalhe interno do Supabase (a API entra como
-- 'authenticator') que não dá para verificar de fora e pode mudar. Um
-- controle de segurança que não se consegue testar não vale o conforto.
--
-- Efeito prático: consultar as views pelo SQL Editor devolve zero linhas.
-- Para conferir número no dashboard, consulte as TABELAS de baixo
-- (sales_transactions, ad_spend, manual_platform_revenue) — lá o
-- postgres continua enxergando tudo.

revoke all on function public.pode_ver_agregados() from public;
grant execute on function public.pode_ver_agregados() to authenticated, service_role;

-- ---------------------------------------------------------------------
--  2. VIEWS RECRIADAS COM A GUARDA
--  Mesma definição de sempre, mais um `where` que zera o retorno para
--  quem não pode ver. Nenhum cálculo mudou.
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
    m.year, m.month, m.platform, m.sales_count::bigint, m.gross_revenue,
    coalesce(m.net_revenue, m.gross_revenue - m.platform_fees),
    m.platform_fees, 0::numeric, 0::bigint
  from public.manual_platform_revenue m
)
select
  make_date(c.year, c.month, 1)     as month_start,
  c.year, c.month, c.platform,
  sum(c.approved_count)::bigint     as approved_count,
  sum(c.gross_revenue)              as gross_revenue,
  sum(c.net_revenue)                as net_revenue,
  sum(c.platform_fees)              as platform_fees,
  sum(c.refunded_amount)            as refunded_amount,
  sum(c.refund_count)::bigint       as refund_count
from combinado c
where public.pode_ver_agregados()
group by 1, 2, 3, 4;

create or replace view public.v_monthly_ad_spend as
select
  (date_trunc('month', s.spend_date))::date as month_start,
  extract(year  from s.spend_date)::int     as year,
  extract(month from s.spend_date)::int     as month,
  s.platform,
  coalesce(sum(s.spend), 0)                 as total_spend,
  coalesce(sum(s.impressions), 0)           as impressions,
  coalesce(sum(s.clicks), 0)                as clicks,
  coalesce(sum(s.conversions), 0)           as conversions
from public.ad_spend s
where public.pode_ver_agregados()
group by 1, 2, 3, 4;

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

-- ---------------------------------------------------------------------
--  3. POLICIES: de "qualquer um" para "colaborador da lista"
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'annual_goals', 'monthly_financials', 'marketing_actions',
    'document_categories', 'documents'
  ]
  loop
    -- A antiga liberava para anon. Sai.
    execute format('drop policy if exists "public_read_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "colaborador_le_%1$s" on public.%1$s', t);
    execute format(
      'create policy "colaborador_le_%1$s" on public.%1$s
         for select to authenticated using (public.eh_colaborador())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  4. REVOGAR OS GRANTS DO ANÔNIMO
--  Defesa em profundidade: mesmo que uma policy volte por engano, o
--  papel anon não tem mais permissão de tabela para exercê-la.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'annual_goals', 'monthly_financials', 'marketing_actions',
    'document_categories', 'documents', 'sales_transactions', 'ad_spend',
    'manual_platform_revenue', 'platform_fees', 'webhook_events',
    'vault_credentials', 'vault_access_log', 'app_settings', 'cofre_perfis',
    'colaboradores_autorizados'
  ]
  loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on public.v_monthly_revenue  from anon;
revoke all on public.v_monthly_ad_spend from anon;
revoke all on public.v_annual_summary   from anon;

grant select on public.v_monthly_revenue  to authenticated;
grant select on public.v_monthly_ad_spend to authenticated;
grant select on public.v_annual_summary   to authenticated;

-- As tabelas sem policy (cofre, vendas, etc.) continuam invisíveis mesmo
-- para `authenticated`: o grant acima é inócuo sem uma policy que o
-- acompanhe. O RLS é que manda, e ele segue fechado.

-- =====================================================================
--  ROLLBACK DE EMERGÊNCIA
--  Se algo der errado e você precisar do Hub no ar AGORA, rode isto no
--  SQL Editor. Ele reabre o acesso público — use só como ponte, e
--  lembre que volta a expor os dados.
-- ---------------------------------------------------------------------
--  do $$ declare t text; begin
--    foreach t in array array['annual_goals','monthly_financials',
--      'marketing_actions','document_categories','documents'] loop
--      execute format('drop policy if exists "colaborador_le_%1$s" on public.%1$s', t);
--      execute format('create policy "public_read_%1$s" on public.%1$s
--        for select to anon, authenticated using (true)', t);
--      execute format('grant select on public.%I to anon', t);
--    end loop;
--  end $$;
--  create or replace function public.pode_ver_agregados()
--    returns boolean language sql stable as $f$ select true $f$;
--  grant select on public.v_monthly_revenue, public.v_monthly_ad_spend,
--    public.v_annual_summary to anon;
-- =====================================================================
