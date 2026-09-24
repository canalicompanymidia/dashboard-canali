/**
 * Formato das respostas da API v2 do ClickUp — só os campos que a
 * importação usa. Tudo opcional: a API omite campo vazio em vez de
 * mandar null, e o importador não pode quebrar por causa disso.
 */

export interface ClickupTeam {
  id: string
  name: string
}

export interface ClickupSpace {
  id: string
  name: string
  private?: boolean
  archived?: boolean
  color?: string | null
}

export interface ClickupList {
  id: string
  name: string
  archived?: boolean
  task_count?: number | string | null
}

export interface ClickupFolder {
  id: string
  name: string
  archived?: boolean
  lists?: ClickupList[]
}

export interface ClickupStatus {
  status: string
  color?: string | null
  type?: string
  orderindex?: number
}

export interface ClickupUser {
  id?: number
  username?: string | null
  email?: string | null
}

export interface ClickupChecklistItem {
  id: string
  name?: string
  resolved?: boolean
  orderindex?: number
}

export interface ClickupChecklist {
  id: string
  name?: string
  items?: ClickupChecklistItem[]
}

export interface ClickupOpcao {
  id: string
  name?: string
  label?: string
  color?: string | null
  orderindex?: number
}

export interface ClickupCustomField {
  id: string
  name: string
  type: string
  type_config?: { options?: ClickupOpcao[] } | null
  value?: unknown
}

export interface ClickupTask {
  id: string
  name: string
  text_content?: string | null
  description?: string | null
  status?: ClickupStatus | null
  orderindex?: string | number | null
  date_created?: string | null
  date_updated?: string | null
  date_closed?: string | null
  date_done?: string | null
  archived?: boolean
  creator?: ClickupUser | null
  assignees?: ClickupUser[]
  checklists?: ClickupChecklist[]
  tags?: { name?: string }[]
  parent?: string | null
  priority?: { id?: string | number; priority?: string } | null
  due_date?: string | null
  start_date?: string | null
  time_estimate?: number | string | null
  custom_fields?: ClickupCustomField[]
  list?: { id?: string }
}

export interface ClickupComment {
  id: string
  comment_text?: string
  user?: ClickupUser | null
  date?: string
}
