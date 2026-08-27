-- =====================================================================
--  MIGRATION 0003 — Dia da semana nas ações de marketing
-- ---------------------------------------------------------------------
--  Motivo: webinários e lives são recorrentes e o time precisa saber
--  QUANDO cada ação acontece sem abrir o modal do card.
--
--  Guarda o código curto e sem acento ('SAB', não 'SÁB'): estável, cabe
--  num CHECK simples e não depende de collation. O texto exibido
--  ("Toda Quinta", "Quinta-feira") é montado na aplicação.
--
--  Idempotente e não destrutivo: pode rodar mais de uma vez e não altera
--  nenhuma ação já cadastrada, exceto pelo preenchimento opcional do
--  passo 3, que só toca em linhas com o campo ainda vazio.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. COLUNA
-- ---------------------------------------------------------------------

alter table public.marketing_actions
  add column if not exists dia_semana text;

comment on column public.marketing_actions.dia_semana is
  'Dia da semana de uma ação recorrente (SEG..DOM). NULL = não se aplica.';

-- ---------------------------------------------------------------------
--  2. RESTRIÇÃO DE VALORES
--  Recriada sempre, para o caso de a lista mudar numa migration futura.
--  NULL passa: o campo é opcional e a maioria das ações não é semanal.
-- ---------------------------------------------------------------------

alter table public.marketing_actions
  drop constraint if exists marketing_actions_dia_semana_check;

alter table public.marketing_actions
  add constraint marketing_actions_dia_semana_check
  check (dia_semana is null or dia_semana in ('SEG','TER','QUA','QUI','SEX','SAB','DOM'));

-- ---------------------------------------------------------------------
--  3. PREENCHIMENTO INICIAL (conveniência)
--  Ações cujo TÍTULO já nomeia o dia — "Webinário de Terça" — recebem o
--  código correspondente. Só onde dia_semana ainda é NULL: quem já
--  escolheu um dia no admin não é sobrescrito.
--  Seguro remover este bloco se preferir preencher tudo à mão.
-- ---------------------------------------------------------------------

update public.marketing_actions set dia_semana = case
    when title ilike '%segunda%' then 'SEG'
    when title ilike '%terça%' or title ilike '%terca%' then 'TER'
    when title ilike '%quarta%' then 'QUA'
    when title ilike '%quinta%' then 'QUI'
    when title ilike '%sexta%'  then 'SEX'
    when title ilike '%sábado%' or title ilike '%sabado%' then 'SAB'
    when title ilike '%domingo%' then 'DOM'
  end
where dia_semana is null
  and (
    title ilike '%segunda%' or title ilike '%terça%' or title ilike '%terca%'
    or title ilike '%quarta%' or title ilike '%quinta%' or title ilike '%sexta%'
    or title ilike '%sábado%' or title ilike '%sabado%' or title ilike '%domingo%'
  );
