/**
 * Tipos do módulo Tasks.
 *
 * Espelham as tabelas de supabase/migrations/0006_tasks.sql. Este arquivo
 * não importa nada do servidor: os componentes de cliente também usam
 * estes tipos.
 */

export type StatusTipo = 'aberto' | 'ativo' | 'concluido' | 'fechado'

export type Prioridade = 'urgente' | 'alta' | 'normal' | 'baixa'

export type TipoCampo =
  | 'texto'
  | 'numero'
  | 'selecao'
  | 'multiselecao'
  | 'data'
  | 'pessoa'
  | 'checkbox'
  | 'url'

export interface Espaco {
  id: string
  nome: string
  cor: string
  privado: boolean
  posicao: number
  criado_por: string | null
  created_at: string
  updated_at: string
}

export interface Pasta {
  id: string
  espaco_id: string
  nome: string
  posicao: number
  criado_por: string | null
}

/** Lista com as contagens da view v_tarefas_listas_resumo. */
export interface Lista {
  id: string
  espaco_id: string
  pasta_id: string | null
  nome: string
  cor: string | null
  descricao: string | null
  posicao: number
  criado_por: string | null
  tarefas_total: number
  tarefas_concluidas: number
  tarefas_atrasadas: number
}

export interface PastaComListas extends Pasta {
  listas: Lista[]
}

/** Árvore que a barra lateral desenha: espaço → pastas → listas. */
export interface EspacoComArvore extends Espaco {
  membros: string[]
  pastas: PastaComListas[]
  /** Listas soltas, fora de qualquer pasta. */
  listas: Lista[]
}

export interface Status {
  id: string
  lista_id: string
  nome: string
  cor: string
  tipo: StatusTipo
  posicao: number
}

export interface OpcaoCampo {
  id: string
  nome: string
  cor: string
}

export interface Campo {
  id: string
  espaco_id: string
  /** null = vale para todas as listas do espaço. */
  lista_id: string | null
  nome: string
  tipo: TipoCampo
  opcoes: OpcaoCampo[]
  posicao: number
}

/** Valor de um campo personalizado, conforme o tipo do campo. */
export type ValorCampo = string | number | boolean | string[] | null

/** Uma linha da view v_tarefas. */
export interface Tarefa {
  id: string
  lista_id: string
  status_id: string
  pai_id: string | null
  titulo: string
  descricao: string | null
  prioridade: Prioridade | null
  data_inicio: string | null
  data_vencimento: string | null
  estimativa_minutos: number | null
  etiquetas: string[]
  campos: Record<string, ValorCampo>
  posicao: number
  criado_por: string | null
  concluida_em: string | null
  created_at: string
  updated_at: string
  status_nome: string
  status_cor: string
  status_tipo: StatusTipo
  status_posicao: number
  lista_nome: string
  lista_cor: string | null
  pasta_id: string | null
  pasta_nome: string | null
  espaco_id: string
  espaco_nome: string
  espaco_cor: string
  espaco_privado: boolean
  pai_titulo: string | null
  responsaveis: string[]
  subtarefas_total: number
  subtarefas_concluidas: number
  comentarios_total: number
  anexos_total: number
  checklist_total: number
  checklist_feitos: number
}

export interface ItemChecklist {
  id: string
  tarefa_id: string
  texto: string
  feito: boolean
  posicao: number
}

export interface Comentario {
  id: string
  tarefa_id: string
  autor: string
  texto: string
  created_at: string
  updated_at: string
}

export interface Atividade {
  id: string
  tarefa_id: string
  autor: string | null
  tipo: string
  detalhe: Record<string, unknown>
  created_at: string
}

export interface Anexo {
  id: string
  tarefa_id: string
  nome: string
  caminho: string
  tipo_mime: string | null
  tamanho: number | null
  enviado_por: string | null
  created_at: string
  /** URL assinada, válida por pouco tempo. null quando o storage falhou. */
  url: string | null
}

/** Colaborador do Hub, como aparece nos seletores de responsável. */
export interface Pessoa {
  email: string
  nome: string | null
  papel: 'admin' | 'colaborador'
}

/** Tudo que o modal da tarefa precisa, numa única carga. */
export interface TarefaDetalhe {
  tarefa: Tarefa
  subtarefas: Tarefa[]
  checklist: ItemChecklist[]
  comentarios: Comentario[]
  atividades: Atividade[]
  anexos: Anexo[]
  statuses: Status[]
  campos: Campo[]
}

/** Contexto de uma lista aberta: a lista, onde ela fica e como se configura. */
export interface ListaContexto {
  lista: Lista
  espaco: Espaco
  pasta: Pasta | null
  statuses: Status[]
  campos: Campo[]
}

// ---------------------------------------------------------------------------
//  Constantes de apresentação
// ---------------------------------------------------------------------------

export const PRIORIDADES: Record<Prioridade, { rotulo: string; cor: string; ordem: number }> = {
  urgente: { rotulo: 'Urgente', cor: '#e5484d', ordem: 0 },
  alta: { rotulo: 'Alta', cor: '#f5a623', ordem: 1 },
  normal: { rotulo: 'Normal', cor: '#4c8dff', ordem: 2 },
  baixa: { rotulo: 'Baixa', cor: '#8a8f98', ordem: 3 },
}

export const PRIORIDADES_ORDEM: Prioridade[] = ['urgente', 'alta', 'normal', 'baixa']

export const STATUS_TIPOS: Record<StatusTipo, { rotulo: string; descricao: string }> = {
  aberto: { rotulo: 'Não iniciado', descricao: 'A tarefa ainda não começou.' },
  ativo: { rotulo: 'Em andamento', descricao: 'Alguém está trabalhando nela.' },
  concluido: { rotulo: 'Concluído', descricao: 'Terminou — feita ou descartada. Sai das pendentes.' },
  fechado: { rotulo: 'Encerrado', descricao: 'Fechada de vez. Sai das pendentes.' },
}

export const STATUS_TIPOS_ORDEM: StatusTipo[] = ['aberto', 'ativo', 'concluido', 'fechado']

export const TIPOS_CAMPO: Record<TipoCampo, string> = {
  texto: 'Texto',
  numero: 'Número',
  selecao: 'Lista suspensa',
  multiselecao: 'Etiquetas (várias opções)',
  data: 'Data',
  pessoa: 'Pessoas',
  checkbox: 'Caixa de seleção',
  url: 'Link',
}

/** Paleta dos seletores de cor: legível no tema claro e no escuro. */
export const PALETA = [
  '#8a817c', // cinza
  '#1f6feb', // azul
  '#1090e0', // azul-claro
  '#7b2cbf', // roxo
  '#bf55ec', // lilás
  '#e5484d', // vermelho
  '#ef233c', // vermelho-vivo
  '#ff7800', // laranja
  '#f8ae00', // âmbar
  '#3db88b', // verde-água
  '#008844', // verde
  '#1f3864', // marinho
  '#6b717b', // prata-escuro
]

/** Um status concluido/fechado tira a tarefa das pendentes. */
export function statusEncerra(tipo: StatusTipo): boolean {
  return tipo === 'concluido' || tipo === 'fechado'
}

/** Bucket privado dos anexos. O navegador só o alcança por URLs assinadas. */
export const BUCKET_ANEXOS = 'tarefas-anexos'

/** Retorno das Server Actions do módulo: dados quando deu certo, mensagem quando não. */
export type Resultado<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string }
