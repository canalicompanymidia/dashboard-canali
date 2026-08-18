/**
 * Tipos compartilhados do Hub de Marketing.
 * Espelham as tabelas definidas em supabase/schema.sql.
 */

export type PlatformSource = 'hotmart' | 'onprofit' | 'tmb' | 'manual'

export type TransactionStatus =
  | 'approved'
  | 'pending'
  | 'refunded'
  | 'chargeback'
  | 'canceled'
  | 'expired'

export type ActionStatus = 'active' | 'paused' | 'draft' | 'archived'

export type AdPlatform = 'meta_ads' | 'google_ads' | 'tiktok_ads' | 'manual'

/** Paleta de destaque usada nos cards e painéis. */
export type Accent = 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'slate'

export interface AnnualGoal {
  id: string
  year: number
  label: string
  target_revenue: number
  target_ebitda_pct: number
  description: string | null
  accent: Accent
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MonthlyFinancial {
  id: string
  year: number
  month: number
  ebitda_pct: number | null
  ebitda_value: number | null
  revenue_manual: number | null
  costs: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SalesTransaction {
  id: string
  platform: PlatformSource
  external_id: string
  status: TransactionStatus
  gross_amount: number
  platform_fee: number
  net_amount: number
  refunded_amount: number
  currency: string
  product_name: string | null
  product_id: string | null
  offer_code: string | null
  payment_method: string | null
  installments: number | null
  buyer_name: string | null
  buyer_email: string | null
  affiliate: string | null
  occurred_at: string
  refunded_at: string | null
  raw_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface AdSpendRow {
  id: string
  platform: AdPlatform
  account_id: string
  campaign_id: string
  campaign_name: string | null
  spend_date: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue_attributed: number
  created_at: string
  updated_at: string
}

export interface ActionLink {
  label: string
  url: string
  type?: string
}

export interface MarketingAction {
  id: string
  title: string
  slug: string
  subtitle: string | null
  description: string | null
  how_it_works: string | null
  image_url: string | null
  flow_image_url: string | null
  status: ActionStatus
  category: string | null
  target_audience: string | null
  owner_name: string | null
  owner_email: string | null
  accent: Accent
  links: ActionLink[]
  briefings: ActionLink[]
  metrics: Record<string, string | number>
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DocumentCategory {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string
  accent: Accent
  sort_order: number
  created_at: string
  updated_at: string
}

export type DocumentProvider =
  | 'google_drive'
  | 'clickup'
  | 'vturb'
  | 'curseduca'
  | 'notion'
  | 'link'

export interface DocumentItem {
  id: string
  category_id: string
  title: string
  description: string | null
  url: string
  provider: DocumentProvider
  tags: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

/** Categoria com seus documentos — formato consumido pelo Bloco 4. */
export interface CategoryWithDocuments extends DocumentCategory {
  documents: DocumentItem[]
}

/** Credencial já descriptografada — só existe depois da Senha Mestre validada. */
export interface VaultCredential {
  id: string
  service_name: string
  category: string
  /** Subcategoria opcional. NULL = visível somente no acesso Master. */
  subcategoria: string | null
  username: string | null
  password: string | null
  url: string | null
  notes: string | null
  extra: Record<string, string>
  sort_order: number
  updated_at: string
}

/** Métricas do mês corrente exibidas no Bloco 2. */
export interface MonthlyMetrics {
  monthLabel: string
  year: number
  month: number
  grossRevenue: number
  netRevenue: number
  platformFees: number
  refundedAmount: number
  refundCount: number
  approvedCount: number
  adSpend: number
  grossProfit: number
  roas: number
  averageTicket: number
  byPlatform: PlatformBreakdown[]
  updatedAt: string
}

export interface PlatformBreakdown {
  platform: PlatformSource
  grossRevenue: number
  netRevenue: number
  approvedCount: number
}

/** Resultado consolidado de uma meta anual, com progresso e projeção. */
export interface GoalProgress {
  goal: AnnualGoal
  accumulatedRevenue: number
  progressPct: number
  projectedRevenue: number
  projectionPct: number
  remaining: number
  requiredMonthlyPace: number
  ebitdaPct: number | null
  ebitdaValue: number | null
  onTrack: boolean
}

/** Contexto temporal do ano corrente — base de toda a projeção linear. */
export interface YearContext {
  year: number
  daysElapsed: number
  daysInYear: number
  monthsRemaining: number
}

// ---------------------------------------------------------------------------
//  Controle de acesso do Cofre
// ---------------------------------------------------------------------------

/** Perfil de colaborador com acesso ao cofre. */
export interface CofrePerfil {
  id: string
  nome_colaborador: string
  subcategorias_permitidas: string[]
  ativo: boolean
  tentativas_falhas: number
  bloqueado_ate: string | null
  ultimo_acesso_em: string | null
  created_at: string
  updated_at: string
}

/**
 * O que a Home pode saber sobre um perfil ANTES de autenticar.
 * Só nome e id — nunca o hash do PIN nem as permissões.
 */
export interface CofrePerfilPublico {
  id: string
  nome_colaborador: string
}

/** Quem está com o cofre aberto. */
export type VaultAcesso =
  | { tipo: 'master' }
  | { tipo: 'perfil'; perfilId: string; nome: string; subcategorias: string[] }
