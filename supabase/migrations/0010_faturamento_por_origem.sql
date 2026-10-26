-- =====================================================================
--  MIGRATION 0010 — Faturamento por origem (recorrências e funil de entrada)
-- ---------------------------------------------------------------------
--  View agregada por mês (horário de Brasília), só vendas aprovadas:
--
--  • Recorrências: pagamentos de ASSINATURA a partir da 2ª cobrança
--    (recorrência ≥ 2), de qualquer produto.
--  • Funil de entrada: 1ª compra (não é renovação de assinatura) dos
--    produtos Mercado Livre Sem Estoque, SellerUp, Loja Pronta Sem
--    Estoque (inclusive "na Shopee") e Shopee Sem Estoque, EXCETO quando
--    o sck (origem do checkout) é de vendedor: priscila, tiffany, samuel,
--    carlos, melissa, patrick, fabiano ou mateus.
--
--  Os dados vêm do payload guardado em cada venda: webhook da Hotmart
--  (data.purchase.origin.sck, data.purchase.recurrence_number,
--  data.subscription.plan) ou importação por CSV (sck, recorrencia,
--  assinatura). Vendas antigas sem essas informações não entram.
--
--  Mesma barreira de v_monthly_revenue: só colaborador (ou o servidor).
--  Idempotente.
-- =====================================================================

-- Como v_monthly_revenue: roda com o dono da view (sales_transactions não
-- tem policy de leitura) e a barreira é pode_ver_agregados().
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
  'Faturamento aprovado por mês: recorrências (assinatura, 2ª cobrança em diante) e funil de entrada (1ª compra dos produtos de entrada, sem sck de vendedor).';

revoke all on public.v_monthly_revenue_segments from anon;
grant select on public.v_monthly_revenue_segments to authenticated, service_role;
