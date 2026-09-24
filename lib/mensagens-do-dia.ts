import { hojeISO } from './tasks/datas'

/**
 * A frase abaixo do "Olá" na Home: uma por dia, igual para o time
 * inteiro, escolhida pelo calendário de São Paulo. A lista tem 60
 * mensagens e só volta ao início depois de 60 dias. Tom: motivar o
 * colaborador e valorizar o time, nunca cobrar.
 *
 * Para trocar uma mensagem, edite o texto aqui. Para acrescentar, é só
 * adicionar uma linha: o ciclo passa a ter o tamanho da lista.
 */
export const MENSAGENS_DO_DIA: readonly string[] = [
  'Fazer até dar certo: esse é o nosso DNA 🔥',
  '“Quando todos avançam juntos, o sucesso ocorre por si só.” – Henry Ford',
  '“Individualmente, somos apenas uma gota. Juntos, somos um oceano.” – Ryūnosuke Akutagawa',
  '“O talento vence jogos, mas o trabalho em equipe ganha campeonatos.” – Michael Jordan',
  '“O único lugar onde o sucesso vem antes do trabalho é no dicionário.”',
  'Cada tarefa, por menor que pareça, é um tijolo na construção do nosso sucesso.',
  'Grandes conquistas começam com pequenos passos dados com determinação.',
  'O segredo do sucesso está em transformar desafios em combustível para ir mais longe.',
  'Time que se apoia chega mais longe. Conte com a gente hoje 🙌',
  '“Grandes coisas nos negócios nunca são feitas por uma pessoa. São feitas por um time.” – Steve Jobs',
  'Cada “feito” que você marca hoje aproxima o time da meta do ano 🎯',
  '“Sozinhos vamos mais rápido. Juntos vamos mais longe.” – provérbio africano',
  'O impossível de ontem é o que a gente entrega hoje. Bora! 🚀',
  '“Você não precisa ser grande para começar, mas precisa começar para ser grande.” – Zig Ziglar',
  'Seu trabalho de hoje é a peça que faltava para o resultado de amanhã.',
  '“O sucesso é a soma de pequenos esforços repetidos dia após dia.” – Robert Collier',
  'Um bom dia começa com uma boa entrega. E isso você sabe fazer 💪',
  '“Comece de onde você está. Use o que você tem. Faça o que você pode.” – Arthur Ashe',
  'Aqui a gente celebra cada conquista, porque cada uma foi construída junto ✨',
  '“Acredite que você pode, e você já está na metade do caminho.” – Theodore Roosevelt',
  'Meta grande não assusta quem trabalha em equipe.',
  '“Tudo parece impossível até que seja feito.” – Nelson Mandela',
  'Você faz parte de algo grande. Cada detalhe seu conta.',
  '“O que você faz hoje pode melhorar todos os seus amanhãs.” – Ralph Marston',
  'Hoje é dia de fazer acontecer, com foco e leveza 🔥',
  '“A única maneira de fazer um excelente trabalho é amar o que você faz.” – Steve Jobs',
  'Toda grande vitória teve um primeiro passo. Dê o seu agora.',
  '“A energia e a persistência conquistam todas as coisas.” – Benjamin Franklin',
  'Confie no processo: o resultado é a soma dos dias bem vividos.',
  '“Nenhum de nós é tão bom quanto todos nós juntos.” – Ray Kroc',
  'Nós crescemos juntos: quando um avança, todos avançam.',
  '“O pessimista vê dificuldade em cada oportunidade. O otimista vê oportunidade em cada dificuldade.” – Winston Churchill',
  'Energia boa é contagiosa. Comece o dia com a sua 🌞',
  '“Reunir-se é um começo, permanecer juntos é um progresso, trabalhar juntos é um sucesso.” – Henry Ford',
  'Constância é o nosso superpoder. Um dia de cada vez.',
  '“Sonhe grande, comece pequeno, mas comece.” – Simon Sinek',
  'O que a gente constrói com dedicação hoje vira orgulho amanhã.',
  '“Você erra 100% dos arremessos que não faz.” – Wayne Gretzky',
  'Não existe tarefa pequena quando o objetivo é grande.',
  '“A disciplina é a ponte entre metas e realizações.” – Jim Rohn',
  'Sua evolução também é a evolução do time. Continue! 🚀',
  '“A melhor maneira de prever o futuro é criá-lo.” – Peter Drucker',
  'Foco no que importa, coração no que a gente faz.',
  '“A qualidade nunca é um acidente. É sempre o resultado de um esforço inteligente.” – John Ruskin',
  'Um passo de cada vez, sempre em frente. É assim que se chega lá.',
  '“Trabalho em equipe é a capacidade de trabalhar juntos em direção a uma visão comum.” – Andrew Carnegie',
  'O resultado que buscamos já começou: ele está no seu próximo passo.',
  'A gente não espera acontecer, a gente faz acontecer. É o nosso jeito 🔥',
  'Cada cliente que a gente transforma começa com o trabalho que você faz hoje.',
  'Time unido não tem obstáculo grande demais 💪',
  'Persistir é acreditar que o próximo passo pode ser o decisivo.',
  'Comemore as pequenas vitórias: elas são o caminho para as grandes ✨',
  'O melhor do ano ainda está por vir, e passa pelo que a gente faz hoje.',
  'Dedicação diária constrói resultados extraordinários.',
  'Vamos juntos: o que parece difícil sozinho fica leve em equipe 🙌',
  'A jornada é longa, mas a companhia é das melhores. Sigamos!',
  'Quem faz com paixão contagia quem está do lado.',
  'Acreditamos em você. Agora é só fazer o que você já sabe fazer 💪',
  'Nosso combustível é a vontade de fazer dar certo.',
  'Novo dia, nova chance de fazer ainda melhor. E a gente sempre faz 🔥',
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
