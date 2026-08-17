#!/usr/bin/env node
/**
 * Importa o relatório histórico de vendas da Hotmart (CSV) para o Hub.
 *
 *   node scripts/import-hotmart-csv.mjs vendas.csv --dry-run
 *   node scripts/import-hotmart-csv.mjs vendas.csv --sql saida.sql
 *   node scripts/import-hotmart-csv.mjs vendas.csv
 *
 * Modos:
 *   --dry-run       só lê e mostra os totais, não escreve nada
 *   --sql <arquivo> gera um .sql para colar no SQL Editor do Supabase
 *   (sem flag)      grava direto, usando as variáveis do .env.local
 *
 * A gravação passa pela MESMA função SQL dos webhooks
 * (ingest_sales_transaction), então o histórico entra com a mesma
 * idempotência e a mesma proteção contra evento fora de ordem: reimportar
 * o arquivo não duplica nada, e um CSV antigo não desfaz um reembolso que
 * já chegou por webhook.
 */
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

// ---------------------------------------------------------------------------
//  Colunas do relatório
// ---------------------------------------------------------------------------

const COLUNAS = {
  transacao: 'Transação',
  produto: 'Nome do Produto',
  codigoProduto: 'Código do Produto',
  codigoOferta: 'Código de Oferta',
  precoProduto: 'Preço do Produto',
  liquido: 'Faturamento líquido',
  parcelas: 'Número da Parcela',
  tipoPagamento: 'Tipo de Pagamento',
  dataVenda: 'Data de Venda',
  dataConfirmacao: 'Data de Confirmação',
  status: 'Status',
  comprador: 'Nome',
  email: 'Email',
  afiliado: 'Nome do Afiliado',
  moeda: 'Moeda',
}

/**
 * Status da Hotmart -> status interno.
 * "Completo" é venda concluída (garantia vencida) e conta como faturamento,
 * igual a "Aprovado".
 */
const STATUS = {
  aprovado: 'approved',
  completo: 'approved',
  reembolsado: 'refunded',
  chargeback: 'chargeback',
  cancelado: 'canceled',
  expirado: 'expired',
  'aguardando pagamento': 'pending',
  'boleto impresso': 'pending',
  'nao aprovado': 'canceled',
}

// O Brasil não observa horário de verão desde 2019: o relatório vem no
// horário de Brasília e o offset é fixo.
const OFFSET = '-03:00'

// ---------------------------------------------------------------------------
//  Utilitários
// ---------------------------------------------------------------------------

const semAcento = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Divide uma linha CSV respeitando aspas. */
function dividirLinha(linha, sep = ';') {
  const campos = []
  let atual = ''
  let dentroDeAspas = false

  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i]
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"'
        i += 1
      } else {
        dentroDeAspas = !dentroDeAspas
      }
    } else if (c === sep && !dentroDeAspas) {
      campos.push(atual)
      atual = ''
    } else {
      atual += c
    }
  }
  campos.push(atual)
  return campos
}

/** O relatório usa ponto como separador decimal, mas aceita vírgula também. */
function numero(valor) {
  if (valor === undefined || valor === null) return null
  const bruto = String(valor).trim().replace(/\s|R\$/gi, '')
  if (!bruto) return null

  const ultimaVirgula = bruto.lastIndexOf(',')
  const ultimoPonto = bruto.lastIndexOf('.')

  let normalizado
  if (ultimaVirgula > -1 && ultimoPonto > -1) {
    normalizado =
      ultimaVirgula > ultimoPonto
        ? bruto.replace(/\./g, '').replace(',', '.')
        : bruto.replace(/,/g, '')
  } else if (ultimaVirgula > -1) {
    normalizado = bruto.replace(',', '.')
  } else {
    normalizado = bruto
  }

  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

/** "17/08/2026 11:10:41" -> "2026-08-17T11:10:41-03:00" */
function dataISO(valor) {
  if (!valor) return null
  const m = String(valor)
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return null
  const [, d, mes, a, h = '00', min = '00', s = '00'] = m
  return `${a}-${mes}-${d}T${h}:${min}:${s}${OFFSET}`
}

const arredonda = (n) => Math.round((n + Number.EPSILON) * 100) / 100
const brl = (n) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Escapa string para literal SQL. */
const sql = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`)

// ---------------------------------------------------------------------------
//  Leitura e normalização
// ---------------------------------------------------------------------------

async function lerCsv(caminho) {
  const linhas = []
  const rl = createInterface({
    input: createReadStream(caminho, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const linha of rl) {
    if (linha.trim()) linhas.push(linha)
  }
  if (linhas.length === 0) throw new Error('Arquivo vazio.')

  // Remove o BOM que o Excel/Hotmart costuma deixar no começo.
  linhas[0] = linhas[0].replace(/^﻿/, '')

  const cabecalho = dividirLinha(linhas[0])

  // Índice pelo NOME, com a primeira ocorrência: o relatório repete a coluna
  // "Moeda" quatro vezes, então um mapa nome->valor perderia campos.
  const indice = {}
  for (const [chave, nome] of Object.entries(COLUNAS)) {
    const i = cabecalho.findIndex((c) => semAcento(c) === semAcento(nome))
    indice[chave] = i
  }

  const faltando = Object.entries(indice)
    .filter(([, i]) => i === -1)
    .map(([k]) => COLUNAS[k])

  if (faltando.length > 0) {
    throw new Error(
      `Colunas não encontradas no CSV: ${faltando.join(', ')}.\n` +
        `Cabeçalho lido: ${cabecalho.join(' | ')}`,
    )
  }

  return { indice, linhas: linhas.slice(1).map((l) => dividirLinha(l)) }
}

function normalizar(campos, indice) {
  const pegar = (chave) => (campos[indice[chave]] ?? '').trim()

  const externalId = pegar('transacao')
  if (!externalId) return { erro: 'linha sem código de transação' }

  const statusBruto = semAcento(pegar('status'))
  const status = STATUS[statusBruto]
  if (!status) return { erro: `status desconhecido: "${pegar('status')}"` }

  // Bruto = preço do produto (o que a venda vale). "Preço Total" incluiria
  // o juro do parcelamento, que é do meio de pagamento, não da operação.
  const bruto = numero(pegar('precoProduto')) ?? 0

  // Líquido = o que o produtor de fato recebe, já sem a taxa da Hotmart e
  // sem a parte de afiliado/coprodução.
  const liquido = numero(pegar('liquido')) ?? bruto

  const taxa = Math.max(arredonda(bruto - liquido), 0)

  // Data da venda: confirmação primeiro, igual ao adaptador de webhook.
  const ocorridoEm = dataISO(pegar('dataConfirmacao')) ?? dataISO(pegar('dataVenda'))
  if (!ocorridoEm) return { erro: `data inválida: "${pegar('dataVenda')}"` }

  const reembolso = status === 'refunded' || status === 'chargeback'
  const parcelas = numero(pegar('parcelas'))

  return {
    externalId,
    status,
    bruto: arredonda(bruto),
    taxa,
    liquido: arredonda(Math.min(liquido, bruto)),
    moeda: pegar('moeda') || 'BRL',
    produto: pegar('produto') || null,
    codigoProduto: pegar('codigoProduto') || null,
    codigoOferta: pegar('codigoOferta') || null,
    formaPagamento: pegar('tipoPagamento') || null,
    parcelas: parcelas ? Math.round(parcelas) : null,
    comprador: pegar('comprador') || null,
    email: pegar('email') || null,
    afiliado: pegar('afiliado') || null,
    ocorridoEm,
    reembolsadoEm: reembolso ? ocorridoEm : null,
  }
}

// ---------------------------------------------------------------------------
//  Resumo
// ---------------------------------------------------------------------------

function resumir(vendas) {
  const porMes = new Map()
  const totais = {
    brutoAprovado: 0,
    liquidoAprovado: 0,
    taxas: 0,
    reembolsado: 0,
    aprovadas: 0,
    reembolsos: 0,
  }

  for (const v of vendas) {
    const mes = v.ocorridoEm.slice(0, 7)
    if (!porMes.has(mes)) {
      porMes.set(mes, { bruto: 0, liquido: 0, taxas: 0, reembolsado: 0, aprovadas: 0, reembolsos: 0 })
    }
    const m = porMes.get(mes)

    if (v.status === 'approved') {
      totais.brutoAprovado += v.bruto
      totais.liquidoAprovado += v.liquido
      totais.taxas += v.taxa
      totais.aprovadas += 1
      m.bruto += v.bruto
      m.liquido += v.liquido
      m.taxas += v.taxa
      m.aprovadas += 1
    } else if (v.status === 'refunded' || v.status === 'chargeback') {
      totais.reembolsado += v.bruto
      totais.reembolsos += 1
      m.reembolsado += v.bruto
      m.reembolsos += 1
    }
  }

  return { totais, porMes }
}

function imprimirResumo({ totais, porMes }, vendas, erros) {
  console.log('\n' + '='.repeat(64))
  console.log('  RESUMO DA IMPORTAÇÃO')
  console.log('='.repeat(64))
  console.log(`  Linhas lidas .................. ${vendas.length + erros.length}`)
  console.log(`  Transações válidas ........... ${vendas.length}`)
  console.log(`  Linhas ignoradas ............. ${erros.length}`)
  console.log('')
  console.log(`  Vendas aprovadas ............. ${totais.aprovadas}`)
  console.log(`  Faturamento bruto ............ ${brl(arredonda(totais.brutoAprovado))}`)
  console.log(`  Taxas e comissões ............ ${brl(arredonda(totais.taxas))}`)
  console.log(`  Faturamento líquido .......... ${brl(arredonda(totais.liquidoAprovado))}`)
  console.log('')
  console.log(`  Reembolsos e chargebacks ..... ${totais.reembolsos}`)
  console.log(`  Valor devolvido .............. ${brl(arredonda(totais.reembolsado))}`)

  console.log('\n  Por mês (data de confirmação):')
  for (const [mes, m] of [...porMes.entries()].sort()) {
    console.log(
      `    ${mes}  ${String(m.aprovadas).padStart(5)} vendas  ` +
        `bruto ${brl(arredonda(m.bruto)).padStart(16)}  ` +
        `líquido ${brl(arredonda(m.liquido)).padStart(16)}  ` +
        `devolvido ${brl(arredonda(m.reembolsado)).padStart(14)}`,
    )
  }

  if (erros.length > 0) {
    console.log('\n  Linhas ignoradas:')
    for (const e of erros.slice(0, 10)) console.log(`    linha ${e.linha}: ${e.erro}`)
    if (erros.length > 10) console.log(`    ... e mais ${erros.length - 10}`)
  }
  console.log('='.repeat(64) + '\n')
}

// ---------------------------------------------------------------------------
//  Saídas
// ---------------------------------------------------------------------------

function gerarSql(vendas, caminho) {
  const linhas = [
    '-- Importação do histórico de vendas da Hotmart',
    `-- Gerado em ${new Date().toISOString()} · ${vendas.length} transações`,
    '--',
    '-- Cole no SQL Editor do Supabase e execute. É idempotente: rodar de',
    '-- novo não duplica nada, porque passa pela mesma função dos webhooks.',
    '',
    'begin;',
    '',
  ]

  for (const v of vendas) {
    linhas.push(
      'select public.ingest_sales_transaction(' +
        [
          `'hotmart'`,
          sql(v.externalId),
          `'${v.status}'`,
          v.bruto,
          v.taxa,
          v.liquido,
          sql(v.moeda),
          sql(v.produto),
          sql(v.codigoProduto),
          sql(v.codigoOferta),
          sql(v.formaPagamento),
          v.parcelas ?? 'null',
          sql(v.comprador),
          sql(v.email),
          sql(v.afiliado),
          `'${v.ocorridoEm}'`,
          v.reembolsadoEm ? `'${v.reembolsadoEm}'` : 'null',
          `'{"origem":"csv"}'::jsonb`,
        ].join(', ') +
        ');',
    )
  }

  linhas.push('', 'commit;', '')
  writeFileSync(caminho, linhas.join('\n'))
  console.log(`  SQL gerado em ${caminho} (${linhas.length - 10} comandos)\n`)
}

/** Lê as variáveis do .env.local sem depender de pacote externo. */
function carregarEnv() {
  for (const arquivo of ['.env.local', '.env']) {
    if (!existsSync(arquivo)) continue
    for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    }
  }
}

async function gravarNoSupabase(vendas) {
  carregarEnv()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error(
      '\n  ✗ Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n' +
        '    Defina no .env.local, ou use --sql para gerar um arquivo e colar\n' +
        '    no SQL Editor do Supabase.\n',
    )
    process.exit(1)
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  let gravadas = 0
  let ignoradas = 0
  const falhas = []
  const LOTE = 8 // paralelismo modesto: não vale estressar a API por 2 mil linhas

  for (let i = 0; i < vendas.length; i += LOTE) {
    const lote = vendas.slice(i, i + LOTE)
    const resultados = await Promise.all(
      lote.map((v) =>
        supabase
          .rpc('ingest_sales_transaction', {
            p_platform: 'hotmart',
            p_external_id: v.externalId,
            p_status: v.status,
            p_gross: v.bruto,
            p_fee: v.taxa,
            p_net: v.liquido,
            p_currency: v.moeda,
            p_product_name: v.produto,
            p_product_id: v.codigoProduto,
            p_offer_code: v.codigoOferta,
            p_payment_method: v.formaPagamento,
            p_installments: v.parcelas,
            p_buyer_name: v.comprador,
            p_buyer_email: v.email,
            p_affiliate: v.afiliado,
            p_occurred_at: v.ocorridoEm,
            p_refunded_at: v.reembolsadoEm,
            p_raw: { origem: 'csv' },
          })
          .maybeSingle()
          .then((r) => ({ v, r })),
      ),
    )

    for (const { v, r } of resultados) {
      if (r.error) falhas.push({ id: v.externalId, msg: r.error.message })
      else if (r.data && r.data.applied === false) ignoradas += 1
      else gravadas += 1
    }

    process.stdout.write(
      `\r  gravando... ${Math.min(i + LOTE, vendas.length)}/${vendas.length}`,
    )
  }

  console.log('')
  console.log(`\n  ✓ ${gravadas} transação(ões) gravada(s).`)
  if (ignoradas > 0) {
    console.log(`  · ${ignoradas} ignorada(s): o banco já tem um status de precedência maior.`)
  }
  if (falhas.length > 0) {
    console.log(`  ✗ ${falhas.length} falha(s):`)
    for (const f of falhas.slice(0, 10)) console.log(`      ${f.id}: ${f.msg}`)
    process.exitCode = 1
  }
  console.log('')
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const caminho = args.find((a) => !a.startsWith('--'))
  const dryRun = args.includes('--dry-run')
  const sqlIdx = args.indexOf('--sql')
  const sqlSaida = sqlIdx > -1 ? args[sqlIdx + 1] : null

  if (!caminho) {
    console.error(
      '\n  uso: node scripts/import-hotmart-csv.mjs <arquivo.csv> [--dry-run] [--sql saida.sql]\n',
    )
    process.exit(1)
  }

  if (!existsSync(caminho)) {
    console.error(`\n  ✗ Arquivo não encontrado: ${caminho}\n`)
    process.exit(1)
  }

  const { indice, linhas } = await lerCsv(caminho)

  const vendas = []
  const erros = []
  const vistos = new Set()

  linhas.forEach((campos, i) => {
    const v = normalizar(campos, indice)
    if (v.erro) {
      erros.push({ linha: i + 2, erro: v.erro })
      return
    }
    // Duplicidade dentro do próprio arquivo: a última linha vence.
    if (vistos.has(v.externalId)) {
      const anterior = vendas.findIndex((x) => x.externalId === v.externalId)
      vendas[anterior] = v
      return
    }
    vistos.add(v.externalId)
    vendas.push(v)
  })

  imprimirResumo(resumir(vendas), vendas, erros)

  if (dryRun) {
    console.log('  Modo --dry-run: nada foi gravado.\n')
    return
  }

  if (sqlSaida) {
    gerarSql(vendas, sqlSaida)
    return
  }

  await gravarNoSupabase(vendas)
}

main().catch((erro) => {
  console.error(`\n  ✗ ${erro.message}\n`)
  process.exit(1)
})
