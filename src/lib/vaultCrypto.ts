// Keys are non-extractable and stay in memory. Never store passwords or keys in browser storage.
const iterations = 310_000
const marker = 'todo-vault-v1'
interface Envelope { v: 1; iv: string; ciphertext: string }
interface Metadata { format: string; salt: string; iterations: number; verifier: Envelope }
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))
export function isSealedVault(value: string): boolean {
  try { return JSON.parse(value).format === marker } catch { return false }
}
export function vaultKeyId(metadata: string): string { return (JSON.parse(metadata) as Metadata).salt }
async function derive(password: string, metadata: Pick<Metadata, 'salt' | 'iterations'>): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('VAULT_HTTPS_REQUIRED')
  if (metadata.iterations < iterations || metadata.iterations > 2_000_000 || decode(metadata.salt).length !== 16) throw new Error('VAULT_INVALID_DATA')
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: decode(metadata.salt), iterations: metadata.iterations }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function encryptVaultValue(key: CryptoKey, value: unknown, context: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, key, new TextEncoder().encode(JSON.stringify(value)))
  return { v: 1, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) }
}
export async function decryptVaultValue<T>(key: CryptoKey, payload: Envelope, context: string): Promise<T> {
  if (payload.v !== 1 || decode(payload.iv).length !== 12) throw new Error('VAULT_INVALID_DATA')
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(payload.iv), additionalData: new TextEncoder().encode(context) }, key, decode(payload.ciphertext))
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}
export async function createVaultKey(password: string): Promise<{ key: CryptoKey; metadata: string }> {
  const params = { salt: encode(crypto.getRandomValues(new Uint8Array(16))), iterations }
  const key = await derive(password, params)
  const verifier = await encryptVaultValue(key, marker, 'vault-verifier')
  return { key, metadata: JSON.stringify({ format: marker, ...params, verifier }) }
}
export async function unlockVaultKey(password: string, serialized: string): Promise<CryptoKey> {
  const metadata = JSON.parse(serialized) as Metadata
  if (metadata.format !== marker) throw new Error('VAULT_INVALID_DATA')
  const key = await derive(password, metadata)
  if (await decryptVaultValue(key, metadata.verifier, 'vault-verifier') !== marker) throw new Error('VAULT_INVALID_DATA')
  return key
}
