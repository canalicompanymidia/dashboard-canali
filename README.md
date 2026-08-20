# Hub de Marketing Unificado — Canali Company

Centro de comando do marketing: metas anuais, faturamento em tempo real, ações
ativas, repositório de documentos e cofre de senhas — tudo em uma página.

O objetivo é cortar o tempo que o time gasta caçando número em planilha,
credencial no WhatsApp e link no Drive.

---

## Índice

1. [Stack](#stack)
2. [Início rápido](#início-rápido)
3. [Banco de dados](#banco-de-dados)
4. [Variáveis de ambiente](#variáveis-de-ambiente)
5. [Integrações](#integrações)
6. [Cofre de senhas](#cofre-de-senhas)
7. [Painel administrativo](#painel-administrativo)
8. [Como as contas são feitas](#como-as-contas-são-feitas)
9. [Estrutura do projeto](#estrutura-do-projeto)
10. [Deploy](#deploy)
11. [Segurança](#segurança)
12. [Ajustes que podem ser necessários](#ajustes-que-podem-ser-necessários)

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| UI | React 19, Tailwind CSS 4, Radix UI, Lucide Icons |
| Banco | Supabase (PostgreSQL) com RLS |
| Tempo real | Supabase Realtime + polling de segurança |
| Validação | Zod |
| Criptografia | AES-256-GCM e scrypt (`node:crypto`) |

---

## Início rápido

```bash
# 1. Instale as dependências
npm install

# 2. Configure o ambiente
cp .env.example .env.local

# 3. Gere os segredos do cofre
npm run vault:keygen                     # => VAULT_ENCRYPTION_KEY
npm run vault:hash -- "sua-senha-forte"  # => VAULT_MASTER_PASSWORD_HASH

# 4. Rode o projeto
npm run dev
```

Abra <http://localhost:3000>.

O painel **funciona sem o Supabase configurado**: renderiza zerado e mostra um
aviso explicando o que falta, em vez de quebrar.

---

## Banco de dados

No Supabase, abra **SQL Editor** e rode, nesta ordem:

1. `supabase/schema.sql` — tabelas, enums, views, índices, RLS e a função de
   ingestão de vendas.
2. `supabase/seed.sql` — metas (R$ 12.168.000 @ 22,5% e R$ 15.470.000 @ 25,8%),
   as 5 ações de marketing, as 5 categorias de documentos e taxas padrão.

Os dois arquivos são idempotentes: rodar de novo não duplica nada.

**Já tem o banco criado?** Não precisa rodar o `schema.sql` inteiro de novo —
aplique só as migrations que faltam, em ordem, de `supabase/migrations/`:

| Migration | O que adiciona |
| --- | --- |
| `0001_cofre_subcategorias_e_perfis.sql` | Subcategorias e perfis de acesso do cofre |
| `0002_vendas_manuais_por_plataforma.sql` | Lançamento manual de faturamento por plataforma |

Elas também são idempotentes e não destrutivas: nenhuma apaga ou reescreve dado
existente.

### Tabelas

| Tabela | Função |
| --- | --- |
| `annual_goals` | Metas anuais do Bloco 1 |
| `monthly_financials` | Fechamento mensal e EBITDA (entrada manual) |
| `sales_transactions` | Vendas normalizadas dos webhooks |
| `manual_platform_revenue` | Faturamento mensal lançado à mão, por plataforma |
| `ad_spend` | Investimento em tráfego, por dia e campanha |
| `platform_fees` | Taxa padrão por plataforma (fallback) |
| `webhook_events` | Log cru de todo webhook recebido |
| `marketing_actions` | Cards do Bloco 3 |
| `document_categories` / `documents` | Repositório do Bloco 4 |
| `vault_credentials` | Credenciais cifradas |
| `vault_access_log` | Auditoria de acesso ao cofre |
| `app_settings` | Configurações (inclui o hash da Senha Mestre) |

### Views

`v_monthly_revenue`, `v_monthly_ad_spend` e `v_annual_summary` expõem **apenas
números agregados**. É isso que permite o painel público ler faturamento sem ter
acesso à tabela de transações.

`v_monthly_revenue` e `v_annual_summary` somam duas origens: as transações reais
dos webhooks e os lançamentos manuais de `manual_platform_revenue`. A soma
acontece **dentro da view**, então nenhuma consulta do painel precisa saber de
onde veio o número — e uma plataforma que tenha as duas origens no mesmo mês sai
em uma única linha.

> As tabelas com dado sensível (`sales_transactions`, `ad_spend`,
> `manual_platform_revenue`) têm RLS ligado e **nenhuma policy de leitura**. O
> cliente anônimo não enxerga linha nenhuma nelas — nem erro, só vazio. Leitura
> pelo painel é sempre pelas views; leitura no admin usa a `service_role`.

---

## Variáveis de ambiente

Lista completa e comentada em [`.env.example`](.env.example).

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | sim | Conexão com o banco |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Leitura pública (sujeita a RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Escrita: webhooks, admin e cofre |
| `VAULT_ENCRYPTION_KEY` | cofre | Cifra as credenciais (AES-256) |
| `VAULT_MASTER_PASSWORD_HASH` | cofre | Hash scrypt da Senha Mestre |
| `VAULT_SESSION_SECRET` | não | Assina a sessão do cofre |
| `HOTMART_HOTTOK` | Hotmart | Valida o webhook |
| `ONPROFIT_WEBHOOK_TOKEN` / `_SECRET` | OnProfit | Valida o webhook |
| `TMB_WEBHOOK_TOKEN` / `_SECRET` | TMB | Valida o webhook |
| `META_ADS_ACCESS_TOKEN` | Meta Ads | Lê o gasto |
| `META_ADS_ACCOUNT_ID` | Meta Ads | Conta de anúncios |
| `CRON_SECRET` | Meta Ads | Protege o job de sincronização |
| `ADMIN_PASSWORD` | não | Exige login no `/admin` |

---

## Integrações

### Endpoints de webhook

| Plataforma | Endpoint | Autenticação |
| --- | --- | --- |
| Hotmart | `POST /api/webhooks/hotmart` | header `X-HOTMART-HOTTOK` |
| OnProfit | `POST /api/webhooks/onprofit` | token ou HMAC-SHA256 |
| TMB | `POST /api/webhooks/tmb` | token ou HMAC-SHA256 |

Um `GET` no mesmo endereço devolve o status e se o segredo está configurado —
útil para conferir o deploy sem enviar venda de teste.

**Política fail-closed:** endpoint sem segredo configurado responde `401`. Um
webhook aberto na internet permitiria que qualquer pessoa inflasse o faturamento
do painel.

#### Configurar a Hotmart

1. Hotmart → **Ferramentas → Webhook → Novo webhook**
2. URL: `https://SEU-DOMINIO/api/webhooks/hotmart`, versão **2.0.0**
3. Marque os eventos de compra (aprovada, completa, reembolso, chargeback,
   cancelamento)
4. Copie o **hottok** gerado para `HOTMART_HOTTOK`

#### Configurar OnProfit e TMB

1. Cadastre a URL correspondente no painel da plataforma
2. Defina `<PLATAFORMA>_WEBHOOK_TOKEN` (header fixo) **ou**
   `<PLATAFORMA>_WEBHOOK_SECRET` (assinatura HMAC do corpo)

### Meta Ads

O Meta **não envia gasto por webhook**. O investimento é puxado da Marketing API
por um job agendado (`vercel.json`, de hora em hora) e gravado em `ad_spend` com
granularidade diária por campanha.

> **Atenção ao plano da Vercel.** O `vercel.json` usa `0 * * * *` (de hora em
> hora), que **exige o plano Pro**. No plano Hobby os cron jobs só podem rodar
> **uma vez por dia** — qualquer expressão mais frequente **faz o deploy falhar**.
> Se for usar Hobby, troque a expressão por `0 9 * * *` (uma vez por dia, 6h no
> horário de Brasília) e use o botão **Sincronizar agora** em `/admin` quando
> precisar do número atualizado na hora.

- Sincronização manual: botão **Sincronizar agora** em `/admin`
- Endpoint: `GET|POST /api/integrations/meta-ads/sync?since=YYYY-MM-DD&until=YYYY-MM-DD`
- Protegido por `CRON_SECRET`

#### Várias contas de anúncio

`META_ADS_ACCOUNT_ID` aceita uma lista separada por vírgula:

```
META_ADS_ACCOUNT_ID=act_111111111111,act_222222222222,act_333333333333
```

O prefixo `act_` é opcional, contas repetidas são descartadas, e um valor único
continua funcionando exatamente como antes.

Cada conta é gravada em `ad_spend` com o próprio `account_id`, e o Bloco 2 soma
todas — a consulta do painel filtra por data, não por conta.

Se o token não tiver permissão em uma das contas, as outras **não** são
perdidas: o que der certo é gravado e a mensagem aponta qual falhou e por quê.
A sincronização só é considerada erro quando nenhuma conta responde.

### Importar o histórico de vendas da Hotmart (CSV)

Os webhooks só capturam vendas a partir do momento em que são configurados.
Para trazer o que já aconteceu, exporte o relatório de vendas na Hotmart e use:

```bash
# 1. confira os números antes de gravar qualquer coisa
node scripts/import-hotmart-csv.mjs relatorio.csv --dry-run

# 2a. grave direto (precisa das chaves do Supabase no .env.local)
node scripts/import-hotmart-csv.mjs relatorio.csv

# 2b. ou gere um .sql para colar no SQL Editor do Supabase
node scripts/import-hotmart-csv.mjs relatorio.csv --sql importacao.sql
```

Como os valores são lidos do relatório:

| Coluna do CSV | Vira | Por quê |
| --- | --- | --- |
| `Preço do Produto` | faturamento bruto | é o valor da venda. `Preço Total` incluiria o juro do parcelamento, que é do meio de pagamento e não da operação — nas vendas à vista os dois são iguais |
| `Faturamento líquido` | faturamento líquido | é o que o produtor recebe, já sem a taxa da Hotmart e sem a parte de afiliado/coprodução |
| a diferença entre os dois | taxas e comissões | — |
| `Data de Confirmação` (ou `Data de Venda`) | data da venda | mesma precedência do adaptador de webhook; interpretada no horário de Brasília |
| `Transação` | chave única | é o que impede duplicidade |

Status: `Aprovado` e `Completo` contam como faturamento; `Reembolsado` e
`Chargeback` saem do agregado automaticamente.

A gravação passa pela mesma função SQL dos webhooks, então reimportar o mesmo
arquivo não duplica nada, e um relatório antigo não desfaz um reembolso que já
chegou por webhook.

> O relatório da Hotmart contém nome, e-mail, CPF e telefone dos compradores.
> O `.gitignore` bloqueia `*.csv` e `import*.sql` justamente para esses
> arquivos não irem parar no repositório.

### Idempotência e ordem dos eventos

Plataformas reenviam webhooks e não garantem ordem de entrega. Duas proteções:

- **Chave natural `(platform, external_id)`** — reenvio atualiza a linha, nunca duplica.
- **Precedência de status** — a função SQL `ingest_sales_transaction` só aplica o
  novo status se ele tiver precedência maior ou igual à do atual
  (`expired < canceled < pending < approved < refunded < chargeback`). Assim um
  `PURCHASE_APPROVED` atrasado não desfaz um reembolso já processado. A decisão
  acontece dentro de um `FOR UPDATE`, o que também elimina corrida entre dois
  webhooks simultâneos.

---

## Cofre de senhas

Modelo de segurança em camadas:

1. **Senha Mestre** — guardada como hash scrypt (N=16384). Nunca é reversível e
   nunca trafega de volta ao cliente.
2. **Sessão** — validada a senha, o servidor emite um cookie `httpOnly`,
   `sameSite=strict`, assinado por HMAC e válido por **15 minutos**.
3. **Credenciais** — cifradas com **AES-256-GCM**. A chave vive em variável de
   ambiente, fora do banco: um dump do PostgreSQL não expõe senha alguma.
4. **Auditoria** — toda tentativa, com sucesso ou não, entra em
   `vault_access_log` com IP e user-agent.

Na interface: bloqueio automático com contagem regressiva, busca, revelar/ocultar
por linha e cópia com um clique. As senhas ficam só em memória — nada de
`localStorage`.

```bash
npm run vault:keygen                     # chave de criptografia
npm run vault:hash -- "sua-senha-forte"  # hash da Senha Mestre
```

### Acesso granular por subcategoria

O cofre tem dois caminhos de entrada:

| Entrada | Como | O que vê |
| --- | --- | --- |
| **Master** | Senha Mestre | todas as credenciais, com e sem subcategoria |
| **Perfil** | escolhe o nome + PIN de 4 dígitos | só as subcategorias liberadas para ele |

Cada credencial pode receber uma **subcategoria** opcional (ex.: `Mídia Paga`,
`Financeiro`). Em `Admin → Cofre → Gestão de Acessos do Cofre` você cadastra os
colaboradores, define o PIN de cada um e marca quais subcategorias ele enxerga.

**Credencial sem subcategoria só aparece no acesso Master.** É o padrão seguro:
esquecer de classificar uma senha nunca a expõe ao time todo. O admin mostra um
aviso com a contagem de credenciais nessa situação.

A filtragem acontece no servidor — o navegador do colaborador nunca recebe uma
senha fora do escopo dele, nem para depois escondê-la na interface. E as
permissões são lidas do banco a cada consulta, não gravadas no token: revogar um
acesso vale na hora, sem esperar a sessão expirar.

> **Sobre o PIN de 4 dígitos.** São 10.000 combinações — frágil por natureza. O
> hash usa scrypt (cada tentativa custa ~100ms) e, principalmente, o perfil é
> **bloqueado por 15 minutos após 5 erros seguidos**, com a contagem feita
> atomicamente no banco. O admin pode liberar antes pelo botão *Desbloquear*, e
> trocar o PIN também destrava. Para segredos de alto risco (financeiro, chaves
> de produção), prefira deixar sem subcategoria — assim exigem a Senha Mestre.

Migration: `supabase/migrations/0001_cofre_subcategorias_e_perfis.sql`. É
idempotente e não altera nenhuma credencial existente.

> Guarde a `VAULT_ENCRYPTION_KEY`. Trocá-la torna ilegíveis todas as senhas já
> cifradas — para rotacionar, recadastre as credenciais antes.

---

## Painel administrativo

`/admin` — cinco áreas:

| Rota | O que faz |
| --- | --- |
| `/admin` | Status das integrações e sincronização do Meta Ads |
| `/admin/metas` | Metas anuais e fechamento de EBITDA mês a mês |
| `/admin/vendas` | Faturamento manual de plataformas sem integração |
| `/admin/acoes` | Criar, editar, **pausar** e excluir ações de marketing |
| `/admin/documentos` | Categorias e links do repositório |
| `/admin/cofre` | Credenciais e troca da Senha Mestre |

Todas as escritas passam por Server Actions com validação Zod e revalidação
automática da Home.

**Proteção opcional:** a especificação define o painel como público para o time,
e é assim que ele funciona por padrão. Como `/admin` grava no banco, existe a
variável `ADMIN_PASSWORD`: definindo-a, o `/admin` passa a exigir login (sessão
de 8 horas, cookie assinado por HMAC). Sem ela, nada muda — e um aviso aparece no
próprio painel. O cofre exige a Senha Mestre nos dois casos, inclusive para
gravar credenciais.

---

## Como as contas são feitas

### Bloco 1 — Metas e projeção

```
Progresso (%)     = faturamento acumulado no ano ÷ meta × 100
Projeção linear   = (faturamento acumulado ÷ dias decorridos) × dias do ano
Ritmo necessário  = (meta − acumulado) ÷ dias restantes × 30,44
```

- **Dias do ano** usa 366 em ano bissexto. Em ano comum o resultado é idêntico
  ao 365 fixo; em bissexto fica correto.
- **Faturamento acumulado**: o fechamento contábil manda. Se o time lançou
  `revenue_manual` para um mês em `/admin/metas`, esse valor substitui o número
  em tempo real daquele mês — o painel nunca contradiz o fechamento oficial.
  Meses sem lançamento seguem com o dado dos webhooks.
- **EBITDA acumulado**: com EBITDA em R$ e faturamento oficial preenchidos, é
  calculado de verdade (soma ÷ soma). Só com o percentual, vira média simples dos
  meses informados.

### Bloco 2 — Métricas do mês

```
Faturamento bruto    = Σ vendas aprovadas (webhooks + lançamentos manuais)
Faturamento líquido  = bruto − taxas de plataforma   (reembolsos saem do agregado)
Investimento         = Σ gasto do Meta Ads no mês
Lucro bruto          = líquido − investimento
ROAS                 = líquido ÷ investimento
Ticket médio         = bruto ÷ nº de vendas aprovadas
```

- A **taxa real do webhook** é sempre preferida; o percentual de `platform_fees`
  só entra quando o payload não informa a taxa. Na Hotmart, a comissão do
  produtor é usada como líquido real.
- **Reembolso e chargeback** atualizam a linha original da venda, então saem do
  agregado automaticamente. A venda continua pertencendo ao mês em que ocorreu,
  mesmo que o estorno chegue meses depois.
- Todo corte de mês/ano usa o fuso **America/Sao_Paulo**, não o do servidor
  (na Vercel, UTC).

#### Faturamento sem integração (OnProfit, TMB)

Nem toda plataforma entrega webhook utilizável. Em `/admin/vendas` o time lança o
**acumulado do mês** por plataforma, e esse valor é somado ao dos webhooks nos
Blocos 1 e 2.

| Campo | Regra |
| --- | --- |
| Bruto | Faturamento aprovado do mês, já sem reembolsos |
| Taxas | Comissão retida pela plataforma |
| Líquido | Em branco, é calculado como `bruto − taxas`. Preenchido, tem precedência |
| Nº de vendas | Alimenta o contador e o ticket médio do Bloco 2 |

O lançamento é **acumulado, não incremental**: `(year, month, platform)` é chave
única, salvar de novo substitui o valor. **Para apagar**, limpe todos os campos da
linha e salve — é assim que se sai do manual quando a integração volta a
funcionar, sem deixar um valor órfão sendo somado ao webhook.

A Hotmart não aparece na tela: a integração dela funciona, e oferecer um campo
manual ao lado do webhook seria um convite a contar a mesma venda duas vezes. Nas
plataformas que aparecem, a coluna *Total na Home* avisa quando o mês também tem
venda vinda de webhook.

### Atualização em tempo real

Três camadas, da mais rápida à mais confiável:

1. Realtime do Supabase avisa quando um webhook grava uma venda;
2. o recálculo é pedido a `/api/metrics` — a conta acontece no servidor, e o
   cliente nunca lê a tabela de transações;
3. polling de 90 s cobre queda de WebSocket e o gasto do Meta Ads, que entra por
   job e não gera evento de Realtime.

---

## Estrutura do projeto

```
app/
├── page.tsx                    Home com os 4 blocos
├── layout.tsx                  Shell, tema e fontes
├── globals.css                 Tokens de design (tema claro nativo)
├── admin/
│   ├── actions.ts              Server Actions (todas as escritas)
│   ├── page.tsx                Status das integrações
│   ├── metas|acoes|documentos|cofre|login/
└── api/
    ├── webhooks/{hotmart,onprofit,tmb}/
    ├── integrations/meta-ads/sync/
    ├── metrics/                Métricas recalculadas no servidor
    ├── vault/{unlock,credentials,lock}/
    └── admin/login/

components/
├── home/                       Blocos 1-4, cofre, copy-to-clipboard
├── admin/                      Formulários e editores
├── layout/                     Header, footer, tema
└── ui/                         Primitivos shadcn/Radix

lib/
├── calculations.ts             Projeção, ROAS, lucro, cortes de período
├── crypto.ts                   AES-256-GCM, scrypt, HMAC
├── data.ts                     Leituras do painel
├── vault.ts                    Regras do cofre
├── webhooks/                   Adaptadores e ingestão
├── integrations/meta-ads.ts    Marketing API
├── admin/                      Schemas Zod, auth opcional
└── supabase/                   Clientes browser/server/admin

supabase/
├── schema.sql                  Estrutura completa
└── seed.sql                    Dados iniciais

public/landing/
├── index.html                  Landing page da Canali Company (HTML + Tailwind CDN + JS puro)
└── assets/                     Fotos e prints da landing (ver assets/README.md)
```

A landing page é independente do painel: um único arquivo, sem build. Abra o
`public/landing/index.html` no navegador para conferir, ou acesse
`/landing/index.html` no domínio publicado.

---

## Deploy

### Vercel (recomendado)

1. Importe o repositório
2. Cadastre as variáveis de ambiente em **Settings → Environment Variables**
3. Deploy — o `vercel.json` já registra o cron do Meta Ads (a cada 3 h)
4. Cadastre as URLs de webhook nas plataformas, apontando para o domínio final

### Comandos

```bash
npm run dev        # desenvolvimento
npm run build      # build de produção
npm run start      # servidor de produção
npm run typecheck  # checagem de tipos
```

---

## Segurança

- **RLS ativo** em todas as tabelas. Conteúdo editorial é leitura pública;
  transações, cofre, logs e configurações não têm policy alguma — só a
  `service_role` acessa, e ela só existe no servidor.
- **`server-only`** nos módulos sensíveis: se alguém importar `lib/crypto.ts` ou
  `lib/vault.ts` em um componente de cliente, o build quebra em vez de vazar.
- **Comparações em tempo constante** (`timingSafeEqual`) em senhas, assinaturas
  de webhook e tokens de sessão.
- **Cabeçalhos `no-store`** nas rotas do cofre, para proxies e browsers não
  guardarem credencial em cache.
- **Senhas nunca em texto puro** no banco: só o payload AES-256-GCM.

---

## Ajustes que podem ser necessários

### Mapeamento de campos da OnProfit e da TMB

A Hotmart tem contrato público e estável, e o adaptador dela
(`lib/webhooks/hotmart.ts`) segue a especificação do Webhook 2.0.

Para **OnProfit** e **TMB** não há documentação pública equivalente, e o payload
varia por conta e por versão de integração. Em vez de fixar um formato provável,
`lib/webhooks/generic.ts` tenta uma **lista de caminhos possíveis** para cada
campo (`transaction_id`, `order_id`, `data.amount`, `sale.total`, …) e usa o
primeiro que existir. O dicionário de status cobre português e inglês.

Se um webhook chegar e a venda não aparecer no painel:

1. Abra `webhook_events` no Supabase e localize o evento — o payload cru fica
   salvo lá, mesmo quando a normalização falha.
2. Ajuste os arrays em `PLATFORM_FIELD_MAPS` (ou `DEFAULT_FIELD_MAP`) em
   `lib/webhooks/generic.ts` com os nomes reais dos campos.
3. Nenhuma outra parte do sistema precisa mudar.

### Imagens das ações

Os cards aceitam URLs de qualquer host e usam `<img>` em vez de `next/image` —
o otimizador do Next recusaria domínios não declarados, e as URLs vêm do banco.
Para ganhar otimização automática, hospede as imagens no Supabase Storage e
declare o domínio em `next.config.mjs`.
