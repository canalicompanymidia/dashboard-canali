import { z } from 'zod'

import { DIAS_SEMANA_CODIGOS } from '@/lib/dias-semana'

/**
 * Validação das entradas do painel administrativo.
 *
 * Server Actions recebem dados de um formulário HTTP: mesmo com validação
 * no browser, o servidor precisa validar de novo — é a única barreira que
 * um cliente não consegue contornar.
 */

const accentEnum = z.enum(['emerald', 'sky', 'violet', 'amber', 'rose', 'slate'])

/**
 * Normaliza o que chega do FormData.
 *
 * Um formulário HTML só envia os campos que existem na tela. Campo não
 * renderizado (o `id` ao criar um registro, o `slug` que é derivado do
 * título) chega como `undefined`, não como string vazia — e `undefined` é
 * diferente de `null` para o zod.
 *
 * Por isso todo campo opcional passa por aqui ANTES de ser validado:
 * ausente e em branco viram `null`, que é o que o banco espera. Sem esta
 * normalização, um campo interno invisível derruba o salvamento do usuário
 * com "expected string, received undefined".
 */
function blankToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

/** Campo de texto opcional: ausente ou vazio vira null. */
const optionalText = z.preprocess(blankToNull, z.string().nullable())

/** Campo de texto que pode faltar mas nunca é null: ausente vira "". */
const textOrEmpty = z.preprocess(
  (value) => (value === undefined || value === null ? '' : String(value)),
  z.string(),
)

/**
 * Interpreta número digitado em formato brasileiro OU internacional.
 *
 * O time digita "12.168.000,00", mas um valor colado de planilha vem como
 * "12168000.00". Tratar todo ponto como separador de milhar quebraria o
 * segundo caso — por isso a regra decide pelo separador que aparece por
 * último, e desempata pela quantidade de casas depois do ponto.
 */
export function parseDecimal(input: string): number {
  const raw = input.trim().replace(/\s|R\$/gi, '')
  if (!raw) return Number.NaN

  const lastComma = raw.lastIndexOf(',')
  const lastDot = raw.lastIndexOf('.')

  let normalized: string

  if (lastComma > -1 && lastDot > -1) {
    // Ambos presentes: o que vem por último é o separador decimal.
    normalized =
      lastComma > lastDot
        ? raw.replace(/\./g, '').replace(',', '.') // 12.168.000,00
        : raw.replace(/,/g, '') //                    12,168,000.00
  } else if (lastComma > -1) {
    normalized = raw.replace(',', '.') //             22,5
  } else if (lastDot > -1) {
    const dotCount = (raw.match(/\./g) ?? []).length
    const decimals = raw.length - lastDot - 1
    // Um único ponto com 1 ou 2 casas é decimal; o resto é milhar.
    normalized = dotCount === 1 && decimals > 0 && decimals <= 2 ? raw : raw.replace(/\./g, '')
  } else {
    normalized = raw
  }

  return Number(normalized)
}

/**
 * Número opcional que aceita vírgula decimal (padrão brasileiro).
 * Valor inválido vira NaN e é barrado pelo refine com mensagem legível.
 */
const optionalNumber = z.preprocess(
  (value) => {
    const text = blankToNull(value)
    if (text === null) return null
    return parseDecimal(text)
  },
  z
    // z.nan() entra no union de propósito: sem ele, z.number() recusa o NaN
    // com "Invalid input" e o refine abaixo nunca chega a rodar.
    .union([z.number(), z.nan(), z.null()])
    .refine((value) => value === null || Number.isFinite(value), {
      message: 'Informe um número válido.',
    }),
)

/** Número obrigatório. Ausente ou em branco reprova como "Campo obrigatório". */
const requiredNumber = z.preprocess(
  (value) => {
    const text = blankToNull(value)
    if (text === null) return null
    return parseDecimal(text)
  },
  z
    // z.nan() entra no union de propósito: sem ele, z.number() recusa o NaN
    // com "Invalid input" e o refine abaixo nunca chega a rodar.
    .union([z.number(), z.nan(), z.null()])
    .refine((value) => value !== null, { message: 'Campo obrigatório.' })
    .refine((value) => value === null || Number.isFinite(value), {
      message: 'Informe um número válido.',
    })
    .transform((value) => value as number),
)

const optionalUrl = z.preprocess(
  blankToNull,
  z
    .string()
    .nullable()
    .refine((value) => value === null || /^https?:\/\/|^\/|^#/.test(value), {
      message: 'A URL deve começar com http:// ou https://',
    }),
)

/**
 * Texto obrigatório. Campo ausente e campo em branco dão a MESMA mensagem —
 * o usuário não precisa saber se o input existia na tela ou não.
 */
function requiredText(message: string, max = 200) {
  return z.preprocess(
    blankToNull,
    z
      .string()
      .nullable()
      .refine((value) => value !== null, { message })
      .refine((value) => value === null || value.length <= max, {
        message: `Use no máximo ${max} caracteres.`,
      })
      .transform((value) => value as string),
  )
}

/** Enum com valor padrão quando o campo não vem no formulário. */
function enumWithDefault<T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
) {
  return z.preprocess((value) => {
    const text = blankToNull(value)
    return text !== null && (values as readonly string[]).includes(text) ? text : fallback
  }, z.enum(values))
}

/**
 * Enum opcional: ausente ou em branco vira null, valor fora da lista reprova
 * com mensagem legível. Diferente de `enumWithDefault`, que silenciosamente
 * troca o inválido pelo padrão — aqui um valor errado precisa aparecer.
 */
function optionalEnum<T extends readonly [string, ...string[]]>(values: T, message: string) {
  return z.preprocess(
    (value) => {
      const text = blankToNull(value)
      return text === null ? null : text.toUpperCase()
    },
    z
      .string()
      .nullable()
      .refine((value) => value === null || (values as readonly string[]).includes(value), {
        message,
      })
      .transform((value) => value as T[number] | null),
  )
}

/** Checkbox/switch: só "on" e "true" contam como marcado. */
const checkboxField = z.preprocess(
  (value) => value === 'on' || value === 'true' || value === true,
  z.boolean(),
)

export const annualGoalSchema = z.object({
  id: optionalText,
  year: requiredNumber.refine((value) => value >= 2000 && value <= 2100, {
    message: 'Ano fora do intervalo.',
  }),
  label: requiredText('Informe o nome da meta.', 60),
  target_revenue: requiredNumber.refine((value) => value > 0, {
    message: 'A meta precisa ser maior que zero.',
  }),
  target_ebitda_pct: requiredNumber.refine((value) => value >= 0 && value <= 100, {
    message: 'O EBITDA deve estar entre 0 e 100.',
  }),
  description: optionalText,
  accent: enumWithDefault(['emerald', 'sky', 'violet', 'amber', 'rose', 'slate'], 'emerald'),
  sort_order: optionalNumber,
  is_active: checkboxField,
})

export const monthlyFinancialSchema = z.object({
  year: requiredNumber,
  month: requiredNumber.refine((value) => value >= 1 && value <= 12, {
    message: 'Mês inválido.',
  }),
  ebitda_pct: optionalNumber,
  ebitda_value: optionalNumber,
  revenue_manual: optionalNumber,
  costs: optionalNumber,
  notes: optionalText,
})

/**
 * Lançamento manual de faturamento por plataforma.
 *
 * `gross_revenue` fica opcional de propósito: salvar a linha em branco é a
 * forma de APAGAR o lançamento — mais direto do que espalhar 36 botões de
 * excluir pela tela. Quem decide entre gravar e apagar é a Server Action.
 */
export const manualPlatformRevenueSchema = z.object({
  year: requiredNumber.refine((value) => value >= 2000 && value <= 2100, {
    message: 'Ano fora do intervalo.',
  }),
  month: requiredNumber.refine((value) => value >= 1 && value <= 12, {
    message: 'Mês inválido.',
  }),
  platform: z.enum(['hotmart', 'onprofit', 'tmb', 'manual']),
  gross_revenue: optionalNumber.refine((value) => value === null || value >= 0, {
    message: 'O faturamento não pode ser negativo.',
  }),
  platform_fees: optionalNumber.refine((value) => value === null || value >= 0, {
    message: 'As taxas não podem ser negativas.',
  }),
  net_revenue: optionalNumber.refine((value) => value === null || value >= 0, {
    message: 'O líquido não pode ser negativo.',
  }),
  sales_count: optionalNumber.refine(
    (value) => value === null || (value >= 0 && Number.isInteger(value)),
    { message: 'Informe a quantidade de vendas em número inteiro.' },
  ),
  notes: optionalText,
})

/** Lista de links no formato "Rótulo | https://url" — uma por linha. */
export const linkListSchema = z.preprocess(
  (value) => (value === undefined || value === null ? '' : String(value)),
  z.string().transform((value) => {
    if (!value.trim()) return []
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, ...rest] = line.split('|')
        const url = rest.join('|').trim()
        return { label: label.trim(), url: url || label.trim() }
      })
      .filter((item) => item.label && item.url)
  }),
)

export const marketingActionSchema = z.object({
  id: optionalText,
  title: requiredText('Informe o título da ação.', 160),
  // Ausente ao criar: a Server Action gera o slug a partir do título.
  slug: optionalText,
  subtitle: optionalText,
  description: optionalText,
  how_it_works: optionalText,
  image_url: optionalUrl,
  flow_image_url: optionalUrl,
  status: enumWithDefault(['active', 'paused', 'draft', 'archived'], 'active'),
  category: optionalText,
  dia_semana: optionalEnum(
    DIAS_SEMANA_CODIGOS as unknown as readonly [string, ...string[]],
    'Dia da semana inválido.',
  ),
  target_audience: optionalText,
  owner_name: optionalText,
  owner_email: optionalText,
  accent: enumWithDefault(['emerald', 'sky', 'violet', 'amber', 'rose', 'slate'], 'emerald'),
  links: linkListSchema,
  briefings: linkListSchema,
  sort_order: optionalNumber,
})

export const documentCategorySchema = z.object({
  id: optionalText,
  name: requiredText('Informe o nome da categoria.', 80),
  slug: optionalText,
  description: optionalText,
  icon: z.preprocess((value) => blankToNull(value) ?? 'Folder', z.string()),
  accent: enumWithDefault(['emerald', 'sky', 'violet', 'amber', 'rose', 'slate'], 'slate'),
  sort_order: optionalNumber,
})

export const documentSchema = z.object({
  id: optionalText,
  category_id: requiredText('Selecione uma categoria.').refine(
    (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
    { message: 'Selecione uma categoria válida.' },
  ),
  title: requiredText('Informe o título.', 160),
  description: optionalText,
  url: requiredText('Informe a URL.').refine((value) => /^https?:\/\//.test(value), {
    message: 'A URL deve começar com http:// ou https://',
  }),
  provider: z.preprocess((value) => blankToNull(value) ?? 'link', z.string()),
  tags: z.preprocess(
    (value) => (value === undefined || value === null ? '' : String(value)),
    z.string().transform((value) =>
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ),
  sort_order: optionalNumber,
})

export const vaultCredentialSchema = z.object({
  // Ausente ao criar: o Postgres gera o UUID (gen_random_uuid).
  id: optionalText,
  service_name: requiredText('Informe o nome do serviço.', 120),
  category: z.preprocess((value) => blankToNull(value) ?? 'Geral', z.string().max(80)),
  // Opcional de propósito: tudo que já estava cadastrado continua válido.
  // Sem subcategoria, a credencial fica visível apenas no acesso Master.
  subcategoria: optionalText,
  username: optionalText,
  // Vazio ao editar = manter a senha atual (não apagar).
  password: textOrEmpty,
  url: optionalUrl,
  notes: optionalText,
  sort_order: optionalNumber,
})

export const masterPasswordSchema = z
  .object({
    password: textOrEmpty.refine((value) => value.length >= 8, {
      message: 'A Senha Mestre precisa ter ao menos 8 caracteres.',
    }),
    confirm: textOrEmpty,
  })
  .refine((data) => data.password === data.confirm, {
    message: 'As senhas não conferem.',
    path: ['confirm'],
  })

/**
 * Perfil de acesso ao cofre.
 * O PIN é opcional na edição: em branco significa "manter o atual".
 */
export const cofrePerfilSchema = z.object({
  id: optionalText,
  nome: requiredText('Informe o nome do colaborador.', 80),
  pin: z.preprocess(
    (value) => (value === undefined || value === null ? '' : String(value).trim()),
    z.string().refine((v) => v === '' || /^\d{4}$/.test(v), {
      message: 'O PIN precisa ter exatamente 4 dígitos.',
    }),
  ),
  // Os checkboxes chegam como uma string separada por "\n" montada no cliente.
  subcategorias: z.preprocess(
    (value) => (value === undefined || value === null ? '' : String(value)),
    z.string().transform((v) =>
      v
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ),
  ativo: checkboxField,
})

/** Converte FormData em objeto simples para o zod validar. */
export function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') result[key] = value
  }
  return result
}

/**
 * Nome de cada campo como ele aparece na tela.
 * O usuário preenche "Meta de faturamento", não `target_revenue`.
 */
const FIELD_LABELS: Record<string, string> = {
  label: 'Identificação',
  year: 'Ano',
  month: 'Mês',
  target_revenue: 'Meta de faturamento',
  target_ebitda_pct: 'Objetivo de EBITDA',
  ebitda_pct: 'EBITDA (%)',
  ebitda_value: 'EBITDA (R$)',
  revenue_manual: 'Faturamento oficial',
  costs: 'Custos',
  title: 'Título',
  name: 'Nome',
  service_name: 'Serviço',
  category: 'Categoria',
  category_id: 'Categoria',
  url: 'URL',
  image_url: 'Imagem de capa',
  flow_image_url: 'Fluxograma',
  owner_email: 'E-mail do responsável',
  description: 'Descrição',
  password: 'Senha',
  pin: 'PIN',
  nome: 'Nome do colaborador',
  subcategoria: 'Subcategoria',
  confirm: 'Confirmação da senha',
  sort_order: 'Ordem',
}

/**
 * Primeira mensagem de erro, pronta para o usuário ler.
 *
 * O prefixo técnico só entra quando a mensagem sozinha não diz de qual
 * campo se trata — "Informe o título." já se explica; "Use no máximo 60
 * caracteres." precisa do rótulo.
 */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Não foi possível validar os dados.'

  const field = issue.path.join('.')
  const label = FIELD_LABELS[field]
  const message = issue.message

  // Mensagem genérica do zod: traduz para algo acionável.
  if (/invalid input|expected .*received/i.test(message)) {
    return label
      ? `${label}: valor inválido. Confira o que foi preenchido.`
      : 'Algum campo veio com valor inválido. Confira o formulário.'
  }

  if (!label) return message

  // Mensagem que já começa com verbo ("Informe...") ou que repete o rótulo
  // ("Mês inválido") dispensa o prefixo.
  const selfExplanatory =
    /^(informe|selecione|a |o |as |os )/i.test(message) ||
    message.toLowerCase().startsWith(label.toLowerCase())

  return selfExplanatory ? message : `${label}: ${message}`
}
