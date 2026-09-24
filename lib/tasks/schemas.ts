import { z } from 'zod'

import { PRIORIDADES_ORDEM, STATUS_TIPOS_ORDEM } from './types'

/**
 * Validação das entradas do módulo Tasks.
 *
 * As Server Actions recebem objetos (não FormData) — o modal edita campo
 * a campo, e cada mudança viaja como um patch pequeno. Mesmo assim, cada
 * patch é validado aqui: o cliente pode ser qualquer um que descubra o
 * endpoint da action.
 */

export const uuid = z.string().uuid({ message: 'Identificador inválido.' })

const cor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: 'Cor inválida.' })

const nomeCurto = (rotulo: string, max = 80) =>
  z
    .string()
    .trim()
    .min(1, { message: `Informe ${rotulo}.` })
    .max(max, { message: `Use no máximo ${max} caracteres.` })

/** 'AAAA-MM-DD' ou nulo. */
const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data inválida.' })
  .nullable()

const email = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, { message: 'E-mail inválido.' })

// ---------------------------------------------------------------------------
//  Espaços, pastas, listas
// ---------------------------------------------------------------------------

export const espacoSchema = z.object({
  id: uuid.optional(),
  nome: nomeCurto('o nome do espaço'),
  cor,
  privado: z.boolean().default(false),
  membros: z.array(email).max(200).default([]),
})

export const pastaSchema = z.object({
  id: uuid.optional(),
  espaco_id: uuid,
  nome: nomeCurto('o nome da pasta'),
})

export const listaSchema = z.object({
  id: uuid.optional(),
  espaco_id: uuid,
  pasta_id: uuid.nullable().default(null),
  nome: nomeCurto('o nome da lista'),
  cor: cor.nullable().default(null),
  descricao: z.string().trim().max(500).nullable().default(null),
})

/** Conjunto completo de status de uma lista, na ordem em que deve ficar. */
export const statusesSchema = z.object({
  lista_id: uuid,
  statuses: z
    .array(
      z.object({
        // Sem id = status novo.
        id: uuid.optional(),
        nome: nomeCurto('o nome do status', 40),
        cor,
        tipo: z.enum(STATUS_TIPOS_ORDEM as unknown as [string, ...string[]]),
      }),
    )
    .min(1, { message: 'A lista precisa de pelo menos um status.' })
    .max(30)
    .refine(
      (itens) => new Set(itens.map((s) => s.nome.toLowerCase())).size === itens.length,
      { message: 'Dois status não podem ter o mesmo nome.' },
    )
    .refine((itens) => itens.some((s) => s.tipo === 'aberto' || s.tipo === 'ativo'), {
      message: 'Pelo menos um status precisa ser "Não iniciado" ou "Em andamento".',
    }),
})

export const campoSchema = z.object({
  id: uuid.optional(),
  espaco_id: uuid,
  /** null = vale para o espaço inteiro. */
  lista_id: uuid.nullable().default(null),
  nome: nomeCurto('o nome do campo', 60),
  tipo: z.enum(['texto', 'numero', 'selecao', 'multiselecao', 'data', 'pessoa', 'checkbox', 'url']),
  opcoes: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        nome: z.string().trim().min(1).max(60),
        cor,
      }),
    )
    .max(100)
    .default([]),
})

// ---------------------------------------------------------------------------
//  Tarefas
// ---------------------------------------------------------------------------

const prioridade = z.enum(PRIORIDADES_ORDEM as unknown as [string, ...string[]]).nullable()

const etiquetas = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((itens) => Array.from(new Set(itens)))

export const novaTarefaSchema = z.object({
  lista_id: uuid,
  titulo: nomeCurto('o título da tarefa', 300),
  status_id: uuid.optional(),
  pai_id: uuid.nullable().default(null),
  prioridade: prioridade.default(null),
  data_vencimento: dataISO.default(null),
  responsaveis: z.array(email).max(50).default([]),
  descricao: z.string().trim().max(20000).nullable().default(null),
})

/**
 * Patch: só os campos presentes mudam. `undefined` = não mexer; `null` =
 * limpar. É o que permite o modal salvar um campo por vez.
 */
export const patchTarefaSchema = z
  .object({
    titulo: nomeCurto('o título da tarefa', 300).optional(),
    descricao: z.string().max(20000).nullable().optional(),
    status_id: uuid.optional(),
    prioridade: prioridade.optional(),
    data_inicio: dataISO.optional(),
    data_vencimento: dataISO.optional(),
    estimativa_minutos: z.number().int().min(0).max(100000).nullable().optional(),
    etiquetas: etiquetas.optional(),
    responsaveis: z.array(email).max(50).optional(),
    /** Valor de UM campo personalizado. */
    campo: z
      .object({
        id: uuid,
        valor: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
      })
      .optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: 'Nada para salvar.',
  })

export const moverTarefaSchema = z.object({
  tarefa_id: uuid,
  status_id: uuid,
  /** Posição fracionária nova dentro da coluna. Ausente = fim da coluna. */
  posicao: z.number().finite().optional(),
})

export const moverParaListaSchema = z.object({
  tarefa_id: uuid,
  lista_id: uuid,
})

export const checklistItemSchema = z.object({
  tarefa_id: uuid,
  texto: nomeCurto('o item', 300),
})

export const comentarioSchema = z.object({
  tarefa_id: uuid,
  texto: z.string().trim().min(1, { message: 'Escreva algo.' }).max(5000),
})

/** Pedido de upload: o servidor confere a pessoa e devolve a URL assinada. */
export const anexoPedidoSchema = z.object({
  tarefa_id: uuid,
  nome: z.string().trim().min(1).max(200),
  tipo_mime: z.string().trim().max(120).nullable().default(null),
  tamanho: z
    .number()
    .int()
    .min(1, { message: 'Arquivo vazio.' })
    .max(50 * 1024 * 1024, { message: 'O arquivo passa de 50 MB.' }),
})

export const anexoRegistroSchema = anexoPedidoSchema.extend({
  caminho: z.string().min(1).max(500),
})

/** Primeira mensagem de erro do zod, para mostrar na tela. */
export function primeiraMensagem(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? 'Dados inválidos.'
}
