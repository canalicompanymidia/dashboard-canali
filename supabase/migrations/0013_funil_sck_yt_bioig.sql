-- =====================================================================
--  MIGRATION 0013 — Funil de entrada: "yt" e "bioig" também contam como
--  YouTube e Instagram para Do Zero à Primeira Venda na Shopee e
--  DesbravadorIA. O resto da regra da 0012 segue igual. Idempotente.
-- =====================================================================

create or replace view public.v_monthly_revenue_segments
as
with base as (
  select
    extract(year  from (t.occurred_at at time zone 'America/Sao_Paulo'))::int as year,
    extract(month from (t.occurred_at at time zone 'America/Sao_Paulo'))::int as month,
    t.gross_amount,
    t.net_amount,
    upper(trim(coalesce(t.product_name, '')))                                  as produto,
    lower(trim(coalesce(
      t.raw_payload->'data'->'purchase'->'origin'->>'sck',
      t.raw_payload->>'sck',
      ''
    )))                                                                        as sck,
    case
      when coalesce(t.raw_payload->'data'->'purchase'->>'recurrence_number', t.raw_payload->>'recorrencia') ~ '^\d+$'
      then coalesce(t.raw_payload->'data'->'purchase'->>'recurrence_number', t.raw_payload->>'recorrencia')::int
    end                                                                        as recorrencia,
    case
      when t.raw_payload ? 'data' then (t.raw_payload->'data'->'subscription'->'plan'->>'name') is not null
      else coalesce((t.raw_payload->>'assinatura')::boolean, false)
    end                                                                        as assinatura
  from public.sales_transactions t
  where t.status = 'approved'
),
classificado as (
  select
    b.*,
    (b.assinatura and coalesce(b.recorrencia, 1) >= 2) as eh_recorrencia,
    (
      (b.produto in ('MERCADO LIVRE SEM ESTOQUE', 'SHOPEE SEM ESTOQUE')
        or b.produto like 'SELLERUP%'
        or b.produto like 'LOJA PRONTA SEM ESTOQUE%')
      and b.sck not in ('priscila', 'tiffany', 'samuel', 'carlos', 'melissa', 'patrick', 'fabiano', 'mateus')
    )
    or (
      -- Produtos de entrada orgânicos: só contam vindos de YouTube ou
      -- Instagram. O termo precisa ser palavra inteira no sck
      -- ("s=ig|m=social" conta; um código de anúncio aleatório, não).
      (b.produto like 'DO ZERO À PRIMEIRA VENDA NA SHOPEE%' or b.produto like 'DESBRAVADORIA%')
      and b.sck ~ '(^|[^a-z0-9])(youtube|ytb|yt|instagram|ig|bioig)([^a-z0-9]|$)'
    ) as eh_produto_funil
  from base b
)
select
  make_date(year, month, 1)                                                     as month_start,
  year,
  month,
  coalesce(sum(gross_amount) filter (where eh_recorrencia), 0)                  as recorrencia_bruto,
  coalesce(sum(net_amount)   filter (where eh_recorrencia), 0)                  as recorrencia_liquido,
  count(*) filter (where eh_recorrencia)                                        as recorrencia_qtd,
  coalesce(sum(gross_amount) filter (where eh_produto_funil and not eh_recorrencia), 0) as funil_bruto,
  coalesce(sum(net_amount)   filter (where eh_produto_funil and not eh_recorrencia), 0) as funil_liquido,
  count(*) filter (where eh_produto_funil and not eh_recorrencia)               as funil_qtd
from classificado
where public.pode_ver_agregados()
group by year, month;

comment on view public.v_monthly_revenue_segments is
  'Faturamento aprovado por mês: recorrências (assinatura, 2ª cobrança em diante) e funil de entrada (1ª compra dos produtos de entrada, sem sck de vendedor; Do Zero à Primeira Venda na Shopee e DesbravadorIA só com sck de YouTube/Instagram: youtube, ytb, yt, instagram, ig, bioig).';

revoke all on public.v_monthly_revenue_segments from anon;
grant select on public.v_monthly_revenue_segments to authenticated, service_role;
