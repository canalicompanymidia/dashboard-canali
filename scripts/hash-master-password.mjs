#!/usr/bin/env node
/**
 * Gera o hash scrypt da Senha Mestre do cofre.
 *   npm run vault:hash -- "minha-senha-forte"
 *   npm run vault:hash              (pergunta a senha sem exibir na tela)
 *
 * O resultado vai em VAULT_MASTER_PASSWORD_HASH. A senha em si nunca é
 * gravada em lugar nenhum.
 */
import { randomBytes, scryptSync } from 'node:crypto'
import { createInterface } from 'node:readline'

const SCRYPT = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEYLEN = 64

function hash(password) {
  const salt = randomBytes(16)
  const derived = scryptSync(password.normalize('NFKC'), salt, KEYLEN, SCRYPT)
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`
}

function output(password) {
  if (password.length < 8) {
    console.error('\n  ✗ A Senha Mestre precisa ter ao menos 8 caracteres.\n')
    process.exit(1)
  }

  console.log('\n  Hash da Senha Mestre\n')
  console.log(`  VAULT_MASTER_PASSWORD_HASH=${hash(password)}\n`)
  console.log('  Copie para o .env.local e para as variáveis do ambiente de produção.\n')
}

const fromArgs = process.argv.slice(2).join(' ').trim()

if (fromArgs) {
  output(fromArgs)
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  rl.question('Digite a Senha Mestre: ', (answer) => {
    rl.close()
    output(answer.trim())
  })
}
