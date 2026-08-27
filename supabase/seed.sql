-- =====================================================================
--  SEED — dados iniciais do Hub de Marketing da Canali Company
--  Rode DEPOIS de schema.sql. É idempotente: pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
--  BLOCO 1 — Metas anuais
-- ---------------------------------------------------------------------
insert into public.annual_goals
  (year, label, target_revenue, target_ebitda_pct, description, accent, sort_order)
values
  (extract(year from current_date)::int, 'META 1', 12168000.00, 22.50,
   'Meta base do ano — operação saudável com margem de 22,5%.', 'emerald', 1),
  (extract(year from current_date)::int, 'META 2', 15470000.00, 25.80,
   'Meta de superação — escala com margem de 25,8%.', 'violet', 2)
on conflict (year, label) do update set
  target_revenue    = excluded.target_revenue,
  target_ebitda_pct = excluded.target_ebitda_pct,
  description       = excluded.description,
  accent            = excluded.accent,
  sort_order        = excluded.sort_order;

-- ---------------------------------------------------------------------
--  Taxas padrão por plataforma (fallback quando o webhook não traz a taxa)
-- ---------------------------------------------------------------------
insert into public.platform_fees (platform, fee_percent, fee_fixed) values
  ('hotmart',  9.90, 1.00),
  ('onprofit', 6.99, 1.00),
  ('tmb',      7.50, 0.00),
  ('manual',   0.00, 0.00)
on conflict (platform) do nothing;

-- ---------------------------------------------------------------------
--  BLOCO 3 — Ações de marketing ativas
-- ---------------------------------------------------------------------
insert into public.marketing_actions
  (title, slug, subtitle, description, how_it_works, status, category,
   dia_semana, target_audience, owner_name, accent, links, briefings, sort_order)
values
  (
    'Funil de Entrada (VSL)', 'funil-entrada-vsl',
    'Aquisição fria via vídeo de vendas',
    'Principal porta de entrada da operação. Tráfego frio do Meta Ads entra numa landing page com VSL e converte direto no checkout, sem etapa humana.',
    E'1. Anúncio no Meta Ads (público frio) leva à landing page\n2. Lead assiste à VSL hospedada no Vturb\n3. CTA libera o checkout após o pitch\n4. Sequência de e-mails de recuperação para quem não comprou\n5. Remarketing para quem assistiu mais de 50%',
    'active', 'Funil', null, 'Público frio — empreendedores buscando o primeiro faturamento online',
    'Time de Tráfego', 'emerald',
    '[{"label":"Landing Page","url":"#","type":"page"},{"label":"Painel Vturb","url":"https://vturb.com.br","type":"vturb"}]'::jsonb,
    '[{"label":"Briefing de Copy da VSL","url":"#"}]'::jsonb,
    1
  ),
  (
    'Webinário de Terça (Aplicação)', 'webinario-terca-aplicacao',
    'Sessão semanal com filtro por aplicação',
    'Webinário recorrente às terças com inscrição por formulário de aplicação. O filtro sobe o ticket médio e leva só lead qualificado ao time comercial.',
    E'1. Captação de inscritos por anúncio + lista de e-mail\n2. Formulário de aplicação qualifica o lead\n3. Lembretes por WhatsApp em D-1 e 1h antes\n4. Webinário ao vivo com oferta no final\n5. Leads aplicados vão para o time comercial no ClickUp',
    'active', 'Webinário', 'TER', 'Leads qualificados com faturamento acima de R$ 10 mil/mês',
    'Time de Lançamento', 'sky',
    '[{"label":"Página de Inscrição","url":"#","type":"page"},{"label":"Board no ClickUp","url":"https://clickup.com","type":"clickup"}]'::jsonb,
    '[{"label":"Roteiro do Webinário","url":"#"}]'::jsonb,
    2
  ),
  (
    'Webinário SellerUp', 'webinario-sellerup',
    'Oferta focada em sellers de marketplace',
    'Webinário dedicado ao produto SellerUp, para vendedores que já operam em marketplaces e querem escalar margem e operação.',
    E'1. Anúncios segmentados para sellers de marketplace\n2. Inscrição direta na página do SellerUp\n3. Aquecimento por e-mail com cases\n4. Webinário com demonstração da plataforma\n5. Oferta com bônus por tempo limitado',
    'active', 'Webinário', null, 'Sellers ativos em Mercado Livre, Shopee e Amazon',
    'Time de Produto', 'amber',
    '[{"label":"Página do SellerUp","url":"#","type":"page"}]'::jsonb,
    '[]'::jsonb,
    3
  ),
  (
    'Webinário Loja Pronta', 'webinario-loja-pronta',
    'Solução chave na mão de e-commerce',
    'Apresentação da oferta Loja Pronta — e-commerce entregue configurado. Foco em quem quer começar sem barreira técnica.',
    E'1. Captação por anúncio com criativo de prova social\n2. Inscrição com confirmação por WhatsApp\n3. Webinário com demonstração ao vivo da loja\n4. Oferta com implementação assistida\n5. Follow-up comercial em 48h',
    'active', 'Webinário', null, 'Iniciantes em e-commerce sem estrutura técnica',
    'Time de Lançamento', 'rose',
    '[{"label":"Página Loja Pronta","url":"#","type":"page"}]'::jsonb,
    '[]'::jsonb,
    4
  ),
  (
    'Consultoria Mensal', 'consultoria-mensal',
    'Recorrência de alto ticket',
    'Programa de acompanhamento mensal com encontros de mentoria e suporte direto. Sustenta a receita recorrente da operação.',
    E'1. Indicação interna ou upgrade de aluno\n2. Sessão de diagnóstico com o time\n3. Contrato mensal com renovação automática\n4. Encontros quinzenais + suporte no grupo\n5. Revisão de metas a cada 30 dias',
    'active', 'Consultoria', null, 'Clientes ativos com operação validada buscando escala',
    'Time de Sucesso do Cliente', 'violet',
    '[{"label":"Área de Membros (Curseduca)","url":"https://curseduca.com","type":"curseduca"}]'::jsonb,
    '[{"label":"Playbook da Consultoria","url":"#"}]'::jsonb,
    5
  )
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
--  BLOCO 4 — Categorias do repositório de documentos
-- ---------------------------------------------------------------------
insert into public.document_categories (name, slug, description, icon, accent, sort_order) values
  ('Copywriting',              'copywriting',  'Copies, roteiros de VSL, e-mails e headlines validadas.', 'PenLine',      'rose',    1),
  ('Tráfego Pago',             'trafego-pago', 'Estruturas de campanha, criativos e relatórios de mídia.', 'Megaphone',    'sky',     2),
  ('Treinamentos e Mentorias', 'treinamentos', 'Gravações, materiais de aula e trilhas de onboarding.',    'GraduationCap','amber',   3),
  ('Design',                   'design',       'Identidade visual, templates e biblioteca de criativos.',  'Palette',      'violet',  4),
  ('Processos / SOPs',         'processos',    'Procedimentos operacionais padrão e fluxos internos.',     'ListChecks',   'emerald', 5)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
--  Documentos de exemplo — troque as URLs pelos links reais do time
-- ---------------------------------------------------------------------
insert into public.documents (category_id, title, description, url, provider, tags, sort_order)
select c.id, d.title, d.description, d.url, d.provider, d.tags, d.sort_order
from (values
  ('copywriting',  'Banco de Headlines',        'Headlines testadas e aprovadas por nicho.',      'https://drive.google.com', 'google_drive', array['copy','headline'],   1),
  ('copywriting',  'Roteiros de VSL',           'Roteiros completos das VSLs em operação.',       'https://drive.google.com', 'google_drive', array['vsl','roteiro'],     2),
  ('trafego-pago', 'Estrutura de Campanhas',    'Padrão de nomenclatura e estrutura no Meta Ads.','https://clickup.com',      'clickup',      array['meta-ads'],          1),
  ('trafego-pago', 'Biblioteca de Criativos',   'Criativos em rodízio com histórico de CPA.',     'https://drive.google.com', 'google_drive', array['criativos'],         2),
  ('treinamentos', 'Área de Membros',           'Trilhas e gravações na Curseduca.',              'https://curseduca.com',    'curseduca',    array['treinamento'],       1),
  ('design',       'Manual da Marca',           'Identidade visual e uso do logo.',               'https://drive.google.com', 'google_drive', array['branding'],          1),
  ('processos',    'SOP — Publicação de Campanha', 'Checklist de subida de campanha.',            'https://clickup.com',      'clickup',      array['sop'],               1)
) as d(category_slug, title, description, url, provider, tags, sort_order)
join public.document_categories c on c.slug = d.category_slug
where not exists (
  select 1 from public.documents ex where ex.title = d.title and ex.category_id = c.id
);
