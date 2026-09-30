/**
 * Identidade visual de uma pessoa sem foto: cor estável e iniciais.
 * Puro — serve o cabeçalho (servidor) e o Tasks (navegador).
 */

const CORES_PESSOA = [
  '#1f6feb', '#7b2cbf', '#008844', '#bf55ec', '#e5484d', '#ff7800',
  '#1090e0', '#3db88b', '#f8ae00', '#1f3864', '#9b59b6', '#ef233c',
]

/** Cor estável para uma pessoa, derivada do e-mail. */
export function corDaPessoa(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return CORES_PESSOA[h % CORES_PESSOA.length]
}

/** "Bruna Dumbrovsky Casaes" → "BC"; "fabi@x.com" → "FA". */
export function iniciais(nomeOuEmail: string): string {
  const texto = nomeOuEmail.trim()
  if (!texto) return '?'
  if (texto.includes('@') && !texto.includes(' ')) {
    return texto.slice(0, 2).toUpperCase()
  }
  const partes = texto.split(/\s+/).filter(Boolean)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}
