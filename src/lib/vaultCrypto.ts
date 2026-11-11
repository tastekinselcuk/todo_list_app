// Keys are non-extractable and stay in memory. Never store passwords or keys in browser storage.
const iterations = 310_000
const marker = 'todo-vault-v1'
interface Envelope { v: 1; iv: string; ciphertext: string }
interface Metadata { format: string; salt: string; iterations: number; verifier: Envelope }
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))
export function isSealedVault(value: string): boolean {
  try { return [marker, 'todo-vault-v2'].includes(JSON.parse(value).format) } catch { return false }
}
export function vaultKeyId(metadata: string): string { const m = JSON.parse(metadata); return m.format === 'todo-vault-v2' ? m.key_id : m.salt }
async function derive(password: string, metadata: Pick<Metadata, 'salt' | 'iterations'>): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('VAULT_HTTPS_REQUIRED')
  if (!Number.isSafeInteger(metadata.iterations) || metadata.iterations < iterations || metadata.iterations > 2_000_000 || decode(metadata.salt).length !== 16) throw new Error('VAULT_INVALID_DATA')
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
  if (payload.v !== 1 || typeof payload.ciphertext!=='string' || payload.ciphertext.length>14_000_000 || decode(payload.iv).length !== 12) throw new Error('VAULT_INVALID_DATA')
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
  if (serialized.length > 8192) throw Error('VAULT_INVALID_DATA')
  if (isRecoverableVault(serialized)) return importDataKey(await unwrapPassword(password, parseV2(serialized)))
  const metadata = JSON.parse(serialized) as Metadata
  if (metadata.format !== marker) throw new Error('VAULT_INVALID_DATA')
  const key = await derive(password, metadata)
  if (await decryptVaultValue(key, metadata.verifier, 'vault-verifier') !== marker) throw new Error('VAULT_INVALID_DATA')
  return key
}

interface MetadataV2 {
  format: 'todo-vault-v2'; key_id: string
  kdf: { salt: string; iterations: number }
  password: Envelope; recovery: { salt: string; wrapped: Envelope }
}
export function isRecoverableVault(value: string): boolean {
  try { return JSON.parse(value).format === 'todo-vault-v2' } catch { return false }
}
function parseV2(value: string): MetadataV2 {
  if (value.length > 8192) throw Error('VAULT_INVALID_DATA')
  const m = JSON.parse(value) as MetadataV2
  if (m.format !== 'todo-vault-v2' || decode(m.key_id).length !== 16 || decode(m.recovery.salt).length !== 16) throw Error('VAULT_INVALID_DATA')
  return m
}
const importDataKey = (raw: string) => {
  const bytes = decode(raw)
  if (bytes.length !== 32) throw Error('VAULT_INVALID_DATA')
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
const passwordParams = () => ({ salt: encode(crypto.getRandomValues(new Uint8Array(16))), iterations: 600_000 })
function requirePassword(password: string) {
  if (password.trim().length < 12 || password.length > 1024) throw Error('VAULT_PASSWORD_LENGTH')
}
// A random 256-bit recovery secret. It is never sent to the server or persisted by the app.
function recoverySecret(): string { return encode(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
async function recoveryKey(code: string, salt: string): Promise<CryptoKey> {
  const normalized = code.trim().replace(/^PV2-/, '')
  if (!/^[A-Za-z0-9_-]{43}$/.test(normalized)) throw Error('VAULT_RECOVERY_INVALID')
  const bytes = decode(normalized.replace(/-/g, '+').replace(/_/g, '/') + '=')
  if (bytes.length !== 32) throw Error('VAULT_RECOVERY_INVALID')
  const material = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({name:'HKDF', hash:'SHA-256', salt:decode(salt), info:new TextEncoder().encode('todo-vault-v2:recovery')}, material,
    {name:'AES-GCM', length:256}, false, ['encrypt','decrypt'])
}
async function unwrapPassword(password: string, metadata: MetadataV2): Promise<string> {
  return decryptVaultValue<string>(await derive(password, metadata.kdf), metadata.password, `vault-key:${metadata.key_id}:password`)
}
async function withRecovery(metadata: MetadataV2, raw: string) {
  const recoveryCode = 'PV2-' + recoverySecret(), salt = encode(crypto.getRandomValues(new Uint8Array(16)))
  const wrapped = await encryptVaultValue(await recoveryKey(recoveryCode, salt), raw, `vault-key:${metadata.key_id}:recovery`)
  return { metadata: JSON.stringify({...metadata, recovery:{salt, wrapped}}), recoveryCode }
}
export async function createRecoverableVault(password: string) {
  requirePassword(password)
  const raw = encode(crypto.getRandomValues(new Uint8Array(32))), key_id = encode(crypto.getRandomValues(new Uint8Array(16))), kdf = passwordParams()
  const passwordEnvelope = await encryptVaultValue(await derive(password, kdf), raw, `vault-key:${key_id}:password`)
  const result = await withRecovery({format:'todo-vault-v2', key_id, kdf, password:passwordEnvelope} as MetadataV2, raw)
  return { ...result, key:await importDataKey(raw) }
}
export async function changeVaultPassword(password: string, serialized: string, newPassword: string) {
  requirePassword(newPassword)
  const m = parseV2(serialized), raw = await unwrapPassword(password, m), kdf = passwordParams()
  const passwordEnvelope = await encryptVaultValue(await derive(newPassword, kdf), raw, `vault-key:${m.key_id}:password`)
  return { key:await importDataKey(raw), metadata:JSON.stringify({...m, kdf, password:passwordEnvelope}) }
}
export async function recoverVault(password: string, serialized: string, code: string) {
  requirePassword(password)
  const m = parseV2(serialized), raw = await decryptVaultValue<string>(await recoveryKey(code, m.recovery.salt), m.recovery.wrapped, `vault-key:${m.key_id}:recovery`)
  const key = await importDataKey(raw), kdf = passwordParams()
  const wrapped = await encryptVaultValue(await derive(password, kdf), raw, `vault-key:${m.key_id}:password`)
  return { ...await withRecovery({...m, kdf, password:wrapped}, raw), key }
}
export async function rotateVaultRecovery(password:string,serialized:string) {
  const m=parseV2(serialized),raw=await unwrapPassword(password,m)
  return withRecovery(m,raw)
}
export function generateVaultPassword(length = 24): string {
  if (!Number.isInteger(length) || length < 16 || length > 128) throw Error('VAULT_INVALID_DATA')
  // Rejection sampling avoids modulo bias.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_+'
  let result = ''
  while (result.length < length) for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
    if (byte < 256 - (256 % alphabet.length) && result.length < length) result += alphabet[byte % alphabet.length]
  }
  return result
}
export async function encryptVaultBackup(password: string, data: unknown): Promise<string> {
  requirePassword(password)
  if(new TextEncoder().encode(JSON.stringify(data)).byteLength>7_000_000)throw Error('VAULT_BACKUP_TOO_LARGE')
  const kdf = passwordParams(), payload = await encryptVaultValue(await derive(password, kdf), data, 'todo-vault-backup-v1')
  return JSON.stringify({format:'todo-vault-backup-v1', kdf, payload})
}
export async function decryptVaultBackup(password: string, serialized: string): Promise<unknown> {
  if (serialized.length > 10_000_000) throw Error('VAULT_INVALID_DATA')
  const m = JSON.parse(serialized)
  if (m.format !== 'todo-vault-backup-v1') throw Error('VAULT_INVALID_DATA')
  return decryptVaultValue(await derive(password, m.kdf), m.payload, 'todo-vault-backup-v1')
}
