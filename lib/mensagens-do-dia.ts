import { hojeISO } from './tasks/datas'

/**
 * A frase abaixo do "Olá" na Home: uma por dia, igual para o time
 * inteiro, escolhida pelo calendário de São Paulo. A lista tem 60
 * mensagens e só volta ao início depois de 60 dias.
 *
 * Para trocar uma mensagem, edite o texto aqui. Para acrescentar, é só
 * adicionar uma linha: o ciclo passa a ter o tamanho da lista.
 */
export const MENSAGENS_DO_DIA: readonly string[] = [
  'Bom trabalho não é o que impressiona hoje. É o que ainda funciona daqui a um ano.',
  'Uma tarefa concluída vale mais do que dez planejadas.',
  'Comece pelo que você vem evitando. O resto do dia fica mais leve.',
  'Consistência não faz barulho, mas é ela que entrega a meta.',
  'Ninguém alcança um número grande sem cuidar dos pequenos todos os dias.',
  'Clareza primeiro. Velocidade vem depois, sozinha.',
  'Reunião boa termina com dono e prazo. Sem isso, foi só conversa.',
  'O que não está escrito não foi combinado.',
  'Faça a pergunta que todo mundo está evitando fazer.',
  'Erro descoberto cedo custa uma correção. Descoberto tarde, custa um lançamento.',
  'Simplifique até doer. Depois simplifique mais um pouco.',
  'A meta do ano se ganha em semanas comuns como esta.',
  'Menos abas abertas, mais entregas fechadas.',
  'Peça ajuda uma hora antes de precisar dela.',
  'O melhor conteúdo é o que resolve um problema real de alguém real.',
  'Dizer "ainda não sei" é o primeiro passo para saber.',
  'Processo bom é o que funciona no dia em que você não está.',
  'Termine o que começou antes de começar o que empolga.',
  'Feedback duro entregue com respeito é um presente.',
  'O cliente não compra o que a gente faz. Compra o que ele consegue fazer com isso.',
  'Prazo apertado pede escopo honesto, não hora extra.',
  'O time que revisa junto erra menos e aprende mais rápido.',
  'Cada dado no Hub é uma decisão que deixa de ser um chute.',
  'Cansaço acumulado não é dedicação. É dívida.',
  'Escreva para quem vai ler com pressa.',
  'Nem toda urgência é importante. Nem toda importância é urgente.',
  'Uma boa pergunta economiza uma semana de trabalho errado.',
  'Faça a versão simples funcionar antes de fazer a versão bonita.',
  'O que você mede com cuidado melhora. O que você ignora piora em silêncio.',
  'Hoje é um bom dia para fechar uma pendência antiga.',
  'Quem organiza o próprio trabalho ganha tempo para o trabalho dos outros.',
  'Resultado é a soma de decisões pequenas tomadas com atenção.',
  'Não confunda estar ocupado com estar avançando.',
  'A melhor ideia da sala nem sempre é a que fala mais alto.',
  'Documente enquanto ainda lembra. Amanhã será outro problema.',
  'Uma campanha boa começa com a pergunta certa sobre quem vai ver.',
  'Confiança se constrói com combinados cumpridos, um de cada vez.',
  'Se a tarefa cabe em dois minutos, faça agora.',
  'Antes de responder, entenda. Antes de discordar, pergunte.',
  'Meta é direção. O que move é a rotina.',
  'Todo grande lançamento foi, um dia, uma lista de tarefas.',
  'Cuidado com o detalhe que ninguém pediu e que atrasa o que todos esperam.',
  'Trabalho bem passado adiante é trabalho que não volta.',
  'Silêncio numa tarefa travada é a forma mais cara de esperar.',
  'Repetir o básico bem feito é o que separa quem vende de quem só posta.',
  'O melhor momento para ajustar o processo é logo depois de ele falhar.',
  'Você não precisa de mais tempo. Precisa de menos interrupções.',
  'Uma pessoa descansada decide melhor do que duas exaustas.',
  'Fale o número, não o adjetivo.',
  'Ideia sem dono não anda. Coloque um nome ao lado dela.',
  'Revise o texto em voz alta. O ouvido pega o que o olho perdoa.',
  'Entregar cedo abre espaço para melhorar. Entregar tarde só abre desculpas.',
  'Teste com um antes de mandar para mil.',
  'Priorizar é escolher o que não vai ser feito hoje, e dizer isso em voz alta.',
  'Quem sabe o porquê faz melhor o como.',
  'O ritmo de hoje decide o mês. O mês decide o ano.',
  'Quando tudo parece urgente, volte à meta e escolha por ela.',
  'Preserve um bloco do dia sem reunião. É onde o trabalho acontece.',
  'Comemore o que foi concluído antes de listar o que falta.',
  'Faça hoje um pouco melhor do que ontem. Amanhã cuida do resto.',
]

/** Posição no ciclo para uma data 'AAAA-MM-DD': dias desde 1970, módulo o tamanho da lista. */
export function indiceDoDia(dataISO: string, total = MENSAGENS_DO_DIA.length): number {
  const [a, m, d] = dataISO.split('-').map(Number)
  const dias = Math.floor(Date.UTC(a, m - 1, d) / 86_400_000)
  return ((dias % total) + total) % total
}

/** A mensagem de hoje (fuso do negócio). */
export function mensagemDoDia(dataISO: string = hojeISO()): string {
  return MENSAGENS_DO_DIA[indiceDoDia(dataISO)]
}
