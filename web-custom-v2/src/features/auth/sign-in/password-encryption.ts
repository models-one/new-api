import { api } from '@/lib/http-client'

import type { ApiResponse } from '@/features/auth/api'

/**
 * Client half of the server's password-login encryption (`common/password_crypto.go`).
 *
 * When the operator sets `PASSWORD_LOGIN_ENCRYPTION_ENABLED`, `POST /api/user/login` rejects
 * a plaintext `password` and only accepts `password_encrypted` + `encryption_key_id`. The key
 * comes from `GET /api/user/login/encryption-key` as an SPKI PEM with an id (`kid`).
 *
 * Two ciphertext formats, both decrypted by `DecryptPassword`:
 *   - short passwords: base64(RSA-OAEP-SHA256(password))
 *   - longer ones:     `v2.<wrappedKey>.<nonce>.<ciphertext>` — a random AES-256-GCM key
 *     wrapped with RSA-OAEP-SHA256 (label `password-v2`), the password sealed with
 *     AES-GCM (12-byte nonce, AAD `password-v2:<kid>`, 16-byte tag appended).
 */

type EncryptionKey = { kid: string; public_key: string }

export type EncryptedPassword = { password_encrypted: string; encryption_key_id: string }

// The server rotates keys; a short cache saves a round trip on a retyped password without
// holding a key long after it may have been replaced.
const KEY_CACHE_TTL_MS = 5 * 60_000
const V2_LABEL = 'password-v2'

let cachedKey: EncryptionKey | null = null
let cachedAt = 0

export function clearPasswordEncryptionKey(): void {
  cachedKey = null
  cachedAt = 0
}

async function fetchEncryptionKey(): Promise<EncryptionKey> {
  if (cachedKey !== null && Date.now() - cachedAt < KEY_CACHE_TTL_MS) return cachedKey

  const response = await api.get<ApiResponse<Partial<EncryptionKey> & { enabled?: boolean }>>(
    '/api/user/login/encryption-key',
    { skipAuthRefresh: true, skipBusinessError: true, skipErrorHandler: true },
  )
  const key = response.data.data
  if (!response.data.success || !key?.kid || !key.public_key) {
    throw new Error('Password encryption key is unavailable')
  }
  cachedKey = { kid: key.kid, public_key: key.public_key }
  cachedAt = Date.now()
  return cachedKey
}

/** Encrypts `password` for the login request. Throws when no usable key can be obtained. */
export async function encryptPassword(password: string): Promise<EncryptedPassword> {
  try {
    const key = await fetchEncryptionKey()
    return {
      password_encrypted: await encryptWithKey(password, key.public_key, key.kid),
      encryption_key_id: key.kid,
    }
  } catch (error: unknown) {
    // The next attempt fetches a fresh key, in case this one was rotated out.
    clearPasswordEncryptionKey()
    throw error
  }
}

/** Exported for tests; production code goes through `encryptPassword`. */
export async function encryptWithKey(password: string, publicKeyPem: string, kid: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle !== undefined) {
    try {
      return await encryptWithWebCrypto(subtle, password, publicKeyPem, kid)
    } catch {
      // Some browsers expose SubtleCrypto without RSA-OAEP-SHA256 support; fall through.
    }
  }
  // Web Crypto only exists in secure contexts, so a console served over plain HTTP on an
  // intranet lands here. Loaded lazily to keep it out of the HTTPS bundle.
  return encryptWithForge(password, publicKeyPem, kid)
}

/** RSA-OAEP-SHA256 fits at most `modulusBytes - 2 * 32 - 2` bytes of plaintext. */
function fitsDirectRsa(plaintextBytes: number, modulusBits: number): boolean {
  return plaintextBytes <= modulusBits / 8 - 66
}

async function encryptWithWebCrypto(subtle: SubtleCrypto, password: string, publicKeyPem: string, kid: string) {
  const publicKey = await subtle.importKey('spki', pemToDer(publicKeyPem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, [
    'encrypt',
  ])
  const plaintext = new TextEncoder().encode(password)
  const modulusBits = (publicKey.algorithm as RsaHashedKeyAlgorithm).modulusLength

  if (fitsDirectRsa(plaintext.byteLength, modulusBits)) {
    return toBase64(await subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, plaintext))
  }

  const secret = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const aesKey = await subtle.importKey('raw', secret, 'AES-GCM', false, ['encrypt'])
  const [wrappedKey, ciphertext] = await Promise.all([
    subtle.encrypt({ name: 'RSA-OAEP', label: new TextEncoder().encode(V2_LABEL) }, publicKey, secret),
    subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(`${V2_LABEL}:${kid}`) },
      aesKey,
      plaintext,
    ),
  ])
  return ['v2', toBase64(wrappedKey), toBase64(nonce), toBase64(ciphertext)].join('.')
}

async function encryptWithForge(password: string, publicKeyPem: string, kid: string) {
  const forge = (await import('node-forge')).default
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem)
  const plaintext = forge.util.encodeUtf8(password)

  if (fitsDirectRsa(plaintext.length, publicKey.n.bitLength())) {
    return forge.util.encode64(publicKey.encrypt(plaintext, 'RSA-OAEP', { md: forge.md.sha256.create() }))
  }

  const secret = forge.random.getBytesSync(32)
  const nonce = forge.random.getBytesSync(12)
  const wrappedKey = publicKey.encrypt(secret, 'RSA-OAEP', { md: forge.md.sha256.create(), label: V2_LABEL })
  const cipher = forge.cipher.createCipher('AES-GCM', secret)
  cipher.start({ iv: nonce, additionalData: `${V2_LABEL}:${kid}`, tagLength: 128 })
  cipher.update(forge.util.createBuffer(plaintext))
  if (!cipher.finish()) throw new Error('Password encryption failed')
  const ciphertext = cipher.output.getBytes() + cipher.mode.tag.getBytes()
  return ['v2', forge.util.encode64(wrappedKey), forge.util.encode64(nonce), forge.util.encode64(ciphertext)].join('.')
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

function toBase64(data: ArrayBuffer | Uint8Array): string {
  let binary = ''
  for (const byte of new Uint8Array(data)) binary += String.fromCharCode(byte)
  return btoa(binary)
}
