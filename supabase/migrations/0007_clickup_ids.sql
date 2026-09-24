-- =====================================================================
--  MIGRATION 0007 — Importação do ClickUp
-- ---------------------------------------------------------------------
--  Guarda o identificador de origem de cada espaço, pasta, lista,
--  tarefa, campo, item de checklist e comentário importados do ClickUp.
--  É o que permite rodar a importação de novo sem duplicar nada: a
--  segunda vez atualiza o que já existe.
--
--  Também amarra os registros semeados pela 0006 aos ids do ClickUp
--  de onde foram copiados, para a importação reaproveitá-los.
--
--  Não toca em dado existente. Idempotente.
-- =====================================================================

alter table public.tarefas_espacos     add column if not exists clickup_id text;
alter table public.tarefas_pastas      add column if not exists clickup_id text;
alter table public.tarefas_listas      add column if not exists clickup_id text;
alter table public.tarefas_campos      add column if not exists clickup_id text;
alter table public.tarefas_checklist   add column if not exists clickup_id text;
alter table public.tarefas_comentarios add column if not exists clickup_id text;
alter table public.tarefas             add column if not exists clickup_id text;
-- Pai no ClickUp, resolvido depois que a lista inteira foi importada.
alter table public.tarefas             add column if not exists clickup_pai_id text;
-- Quando os comentários desta tarefa foram trazidos (null = ainda não).
alter table public.tarefas             add column if not exists clickup_comentarios_em timestamptz;

-- Únicos, mas permitindo NULL (o que foi criado no Hub não tem origem).
create unique index if not exists idx_tarefas_espacos_clickup     on public.tarefas_espacos (clickup_id);
create unique index if not exists idx_tarefas_pastas_clickup      on public.tarefas_pastas (clickup_id);
create unique index if not exists idx_tarefas_listas_clickup      on public.tarefas_listas (clickup_id);
create unique index if not exists idx_tarefas_checklist_clickup   on public.tarefas_checklist (clickup_id);
create unique index if not exists idx_tarefas_comentarios_clickup on public.tarefas_comentarios (clickup_id);
create unique index if not exists idx_tarefas_clickup             on public.tarefas (clickup_id);
create index        if not exists idx_tarefas_clickup_pai         on public.tarefas (clickup_pai_id);
-- O mesmo campo do ClickUp existe uma vez POR ESPAÇO no Hub.
create unique index if not exists idx_tarefas_campos_clickup      on public.tarefas_campos (espaco_id, clickup_id);

-- ---------------------------------------------------------------------
--  Liga subtarefas às mães dentro de uma lista, depois que todas as
--  páginas foram importadas (a mãe pode vir numa página posterior à
--  filha). O Hub tem um nível só: subtarefa de subtarefa sobe para a
--  avó, quantas vezes for preciso.
-- ---------------------------------------------------------------------

create or replace function public.tarefas_vincular_subtarefas(p_lista uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer := 0;
  v_rows  integer;
  v_iter  integer := 0;
begin
  -- Deixou de ser subtarefa no ClickUp: solta da mãe aqui também.
  update public.tarefas t
     set pai_id = null
   where t.lista_id = p_lista
     and t.clickup_id is not null
     and t.clickup_pai_id is null
     and t.pai_id is not null;

  update public.tarefas t
     set pai_id = p.id
    from public.tarefas p
   where t.lista_id = p_lista
     and p.lista_id = p_lista
     and t.clickup_pai_id is not null
     and p.clickup_id = t.clickup_pai_id
     and t.pai_id is distinct from p.id
     and p.id <> t.id;
  get diagnostics v_total = row_count;

  -- Achata: enquanto houver filha cuja mãe também é filha, sobe um nível.
  loop
    update public.tarefas t
       set pai_id = p.pai_id
      from public.tarefas p
     where t.lista_id = p_lista
       and t.pai_id = p.id
       and p.pai_id is not null
       and p.pai_id <> t.id;
    get diagnostics v_rows = row_count;
    v_iter := v_iter + 1;
    exit when v_rows = 0 or v_iter >= 10;
  end loop;

  return v_total;
end $$;

revoke all on function public.tarefas_vincular_subtarefas(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  Amarra o que a 0006 semeou aos ids do ClickUp de origem.
--  Só preenche onde ainda está vazio: não sobrescreve nada.
-- ---------------------------------------------------------------------

update public.tarefas_espacos set clickup_id = v.cid
  from (values
    ('5e000000-0000-4000-8000-000000000001'::uuid, '90130290847'),   -- > Marketing.
    ('5e000000-0000-4000-8000-000000000002'::uuid, '901313555720'),  -- Comercial
    ('5e000000-0000-4000-8000-000000000003'::uuid, '901313406636')   -- Gestão
  ) as v(id, cid)
 where tarefas_espacos.id = v.id and tarefas_espacos.clickup_id is null;

update public.tarefas_pastas set clickup_id = v.cid
  from (values
    ('5f000000-0000-4000-8000-000000000001'::uuid, '90130758749'),   -- Gestão do Time
    ('5f000000-0000-4000-8000-000000000002'::uuid, '90130758753'),   -- Processos de Automações
    ('5f000000-0000-4000-8000-000000000003'::uuid, '90133203561')    -- Reuniões | Atas | Transcrições
  ) as v(id, cid)
 where tarefas_pastas.id = v.id and tarefas_pastas.clickup_id is null;

update public.tarefas_listas set clickup_id = v.cid
  from (values
    ('51000000-0000-4000-8000-000000000001'::uuid, '901303907974'),  -- DESENVOLVEDOR WEB
    ('51000000-0000-4000-8000-000000000002'::uuid, '901301517106'),  -- DESIGNER
    ('51000000-0000-4000-8000-000000000003'::uuid, '901303779276'),  -- EDIÇÃO DE VÍDEOS
    ('51000000-0000-4000-8000-000000000004'::uuid, '901319791426'),  -- COPY E VIDEO - WINNIE
    ('51000000-0000-4000-8000-000000000005'::uuid, '901328140477'),  -- CONTEÚDO E COMUNICAÇÃO
    ('51000000-0000-4000-8000-000000000006'::uuid, '901301517121'),  -- Gestão de WhatsApp
    ('51000000-0000-4000-8000-000000000007'::uuid, '901301517119'),  -- Gestão de Manychat
    ('51000000-0000-4000-8000-000000000008'::uuid, '901300732013'),  -- E-mail MKT
    ('51000000-0000-4000-8000-000000000009'::uuid, '901305950099'),  -- ATAS
    ('51000000-0000-4000-8000-000000000010'::uuid, '901311600107'),  -- Transcrições
    ('51000000-0000-4000-8000-000000000011'::uuid, '901326091286'),  -- Comercial / List
    ('51000000-0000-4000-8000-000000000012'::uuid, '901325772857')   -- Gestão / List
  ) as v(id, cid)
 where tarefas_listas.id = v.id and tarefas_listas.clickup_id is null;

update public.tarefas_campos set clickup_id = v.cid
  from (values
    ('5c000000-0000-4000-8000-000000000001'::uuid, '936a9610-8513-4db1-a80f-1244c9210fc9'),  -- Produto
    ('5c000000-0000-4000-8000-000000000002'::uuid, '82c69e12-9e0e-41b9-b395-757aa7018a35'),  -- Tipo do Conteúdo
    ('5c000000-0000-4000-8000-000000000003'::uuid, '8d557256-196f-49a8-ab28-849ce0e12077'),  -- Formato de Conteúdo
    ('5c000000-0000-4000-8000-000000000004'::uuid, 'cd4cc818-5352-475e-a118-21d1b7f30891'),  -- Formatos do Conteúdo
    ('5c000000-0000-4000-8000-000000000005'::uuid, 'b4ea8ff7-ec92-4848-a3b1-fe1c3b0367ab'),  -- Canais
    ('5c000000-0000-4000-8000-000000000006'::uuid, 'd37b049e-143a-4031-88ed-87318037381a'),  -- Evento
    ('5c000000-0000-4000-8000-000000000007'::uuid, '5fecb5fb-da63-4d67-b22b-d78f0d58afde'),  -- Data de Publicação
    ('5c000000-0000-4000-8000-000000000008'::uuid, '2f62ac98-390c-436d-a582-9ac9f0e3dabf'),  -- Feedback do Cliente
    ('5c000000-0000-4000-8000-000000000009'::uuid, '6d7d88ce-c765-402c-85d8-1c998407f80c'),  -- Copywriter
    ('5c000000-0000-4000-8000-000000000010'::uuid, 'aa315bdb-f695-4e54-9f16-ef49a481c179'),  -- Designer
    ('5c000000-0000-4000-8000-000000000011'::uuid, 'adfb65d7-0048-4fa3-bf68-0fbb1f8bd7c4'),  -- Editor de Vídeos
    ('5c000000-0000-4000-8000-000000000012'::uuid, 'b90c0afb-911c-48c1-a1fe-8dd8573e53cf'),  -- Webdesigner
    ('5c000000-0000-4000-8000-000000000013'::uuid, 'b9dc2ab0-ad27-4fcd-a320-7ad37515372a'),  -- Social Media
    ('5c000000-0000-4000-8000-000000000014'::uuid, 'cc70acbb-32a2-4b9d-ad91-1d58a950debb'),  -- Gestor de Tráfego
    ('5c000000-0000-4000-8000-000000000015'::uuid, '90310ea4-fbb9-44b4-b831-3049c4dd9892'),  -- Gestor de Projetos
    ('5c000000-0000-4000-8000-000000000016'::uuid, 'c4114797-d65b-412e-9fdc-c2f20718b2d3'),  -- Coordenador de Marketing
    ('5c000000-0000-4000-8000-000000000017'::uuid, 'faa76ece-f673-4071-8e8f-1b9f085c6740')   -- Responsável pela Revisão
  ) as v(id, cid)
 where tarefas_campos.id = v.id and tarefas_campos.clickup_id is null;
