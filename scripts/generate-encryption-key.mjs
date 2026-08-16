#!/usr/bin/env node
/**
 * Gera a chave AES-256 do Cofre de Senhas.
 *   npm run vault:keygen
 *
 * Guarde o valor em VAULT_ENCRYPTION_KEY. Trocar esta chave torna TODAS as
 * senhas já cifradas ilegíveis — se precisar rotacionar, decifre e recadastre
 * antes de substituir.
 */
import { randomBytes } from 'node:crypto'

const key = randomBytes(32).toString('base64')

console.log('\n  Chave de criptografia do cofre (AES-256)\n')
console.log(`  VAULT_ENCRYPTION_KEY=${key}\n`)
console.log('  Copie para o .env.local e para as variáveis do ambiente de produção.')
console.log('  Nunca versione esta chave.\n')
