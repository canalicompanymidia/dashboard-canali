import { z } from 'zod'

/**
 * Validação das entradas do painel administrativo.
 *
 * Server Actions recebem dados de um formulário HTTP: mesmo com validação
 * no browser, o servidor precisa validar de novo — é a única barreira que
 * um cliente não consegue contornar.
 */

const accentEnum = z.enum(['emerald', 'sky', 'violet', 'amber', 'rose', 'slate'])

/** Campo de texto opcional: "" do formulário vira null no banco. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()

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

/** Número opcional que aceita vírgula decimal (padrão brasileiro). */
const optionalNumber = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : parseDecimal(value)))
  .nullable()
  .refine((value) => value === null || Number.isFinite(value), {
    message: 'Informe um número válido.',
  })

const requiredNumber = z
  .string()
  .trim()
  .min(1, 'Campo obrigatório.')
  .transform((value) => parseDecimal(value))
  .refine((value) => Number.isFinite(value), { message: 'Informe um número válido.' })

const optionalUrl = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .refine((value) => value === null || /^https?:\/\/|^\/|^#/.test(value), {
    message: 'A URL deve começar com http:// ou https://',
  })

export const annualGoalSchema = z.object({
  id: optionalText,
  year: requiredNumber.refine((value) => value >= 2000 && value <= 2100, {
    message: 'Ano fora do intervalo.',
  }),
  label: z.string().trim().min(1, 'Informe o nome da meta.').max(60),
  target_revenue: requiredNumber.refine((value) => value > 0, {
    message: 'A meta precisa ser maior que zero.',
  }),
  target_ebitda_pct: requiredNumber.refine((value) => value >= 0 && value <= 100, {
    message: 'O EBITDA deve estar entre 0 e 100.',
  }),
  description: optionalText,
  accent: accentEnum,
  sort_order: optionalNumber,
  is_active: z.union([z.literal('on'), z.literal('true'), z.literal('')]).optional(),
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

/** Lista de links no formato "Rótulo | https://url" — uma por linha. */
export const linkListSchema = z
  .string()
  .trim()
  .transform((value) => {
    if (!value) return []
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
  })

export const marketingActionSchema = z.object({
  id: optionalText,
  title: z.string().trim().min(1, 'Informe o título da ação.').max(160),
  slug: optionalText,
  subtitle: optionalText,
  description: optionalText,
  how_it_works: optionalText,
  image_url: optionalUrl,
  flow_image_url: optionalUrl,
  status: z.enum(['active', 'paused', 'draft', 'archived']),
  category: optionalText,
  target_audience: optionalText,
  owner_name: optionalText,
  owner_email: optionalText,
  accent: accentEnum,
  links: linkListSchema,
  briefings: linkListSchema,
  sort_order: optionalNumber,
})

export const documentCategorySchema = z.object({
  id: optionalText,
  name: z.string().trim().min(1, 'Informe o nome da categoria.').max(80),
  slug: optionalText,
  description: optionalText,
  icon: z.string().trim().min(1),
  accent: accentEnum,
  sort_order: optionalNumber,
})

export const documentSchema = z.object({
  id: optionalText,
  category_id: z.string().uuid('Selecione uma categoria.'),
  title: z.string().trim().min(1, 'Informe o título.').max(160),
  description: optionalText,
  url: z
    .string()
    .trim()
    .min(1, 'Informe a URL.')
    .refine((value) => /^https?:\/\//.test(value), {
      message: 'A URL deve começar com http:// ou https://',
    }),
  provider: z.string().trim().min(1),
  tags: z
    .string()
    .trim()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
    ),
  sort_order: optionalNumber,
})

export const vaultCredentialSchema = z.object({
  id: optionalText,
  service_name: z.string().trim().min(1, 'Informe o nome do serviço.').max(120),
  category: z.string().trim().min(1).max(80),
  username: optionalText,
  // Vazio ao editar = manter a senha atual (não apagar).
  password: z.string(),
  url: optionalUrl,
  notes: optionalText,
  sort_order: optionalNumber,
})

export const masterPasswordSchema = z
  .object({
    password: z.string().min(8, 'A Senha Mestre precisa ter ao menos 8 caracteres.'),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'As senhas não conferem.',
    path: ['confirm'],
  })

/** Converte FormData em objeto simples para o zod validar. */
export function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') result[key] = value
  }
  return result
}

/** Primeira mensagem de erro do zod, pronta para exibir no formulário. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Dados inválidos.'
  const field = issue.path.join('.')
  return field ? `${field}: ${issue.message}` : issue.message
}
