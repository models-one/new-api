// @vitest-environment node

import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

const { encryptWithKey, clearPasswordEncryptionKey } = await import('@/features/auth/sign-in/password-encryption')
const { passwordLogin } = await import('@/features/auth/sign-in/api')

const KID = 'key-1'
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

/** Mirrors `common.DecryptPassword` so the test checks the format the server actually reads. */
function serverDecrypt(ciphertext: string, kid: string): string {
  const oaep = (data: Buffer, label?: string) =>
    privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256', oaepLabel: label ? Buffer.from(label) : undefined },
      data,
    )
  if (!ciphertext.startsWith('v2.')) return oaep(Buffer.from(ciphertext, 'base64')).toString('utf8')

  const [, wrapped, nonce, sealed] = ciphertext.split('.')
  const key = oaep(Buffer.from(wrapped, 'base64'), 'password-v2')
  const body = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'))
  decipher.setAAD(Buffer.from(`password-v2:${kid}`))
  decipher.setAuthTag(body.subarray(body.length - 16))
  return Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString('utf8')
}

const SHORT = 'correct horse 电池'
const LONG = 'p'.repeat(300)

beforeEach(() => {
  clearPasswordEncryptionKey()
  get.mockReset()
  post.mockReset()
  get.mockResolvedValue({ data: { success: true, data: { enabled: true, kid: KID, public_key: publicKey } } })
  post.mockResolvedValue({ data: { success: true, data: null } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('encryptWithKey', () => {
  it.each([
    ['a short password, as plain RSA-OAEP', SHORT, false],
    ['a password too long for RSA, as the v2 envelope', LONG, true],
  ])('with Web Crypto: %s', async (_name, password, isV2) => {
    const ciphertext = await encryptWithKey(password, publicKey, KID)
    expect(ciphertext.startsWith('v2.')).toBe(isV2)
    expect(serverDecrypt(ciphertext, KID)).toBe(password)
  })

  it.each([
    ['a short password', SHORT],
    ['a long password', LONG],
  ])('without Web Crypto (plain HTTP): %s', async (_name, password) => {
    vi.stubGlobal('crypto', {})
    const ciphertext = await encryptWithKey(password, publicKey, KID)
    expect(serverDecrypt(ciphertext, KID)).toBe(password)
  })

  it('binds the v2 envelope to the key id', async () => {
    const ciphertext = await encryptWithKey(LONG, publicKey, KID)
    expect(() => serverDecrypt(ciphertext, 'another-key')).toThrow()
  })
})

describe('passwordLogin with encryption on', () => {
  it('sends only the encrypted fields, never the plaintext password', async () => {
    await passwordLogin({ encryptPassword: true, password: SHORT, turnstile: '', username: 'root' })

    expect(get).toHaveBeenCalledWith('/api/user/login/encryption-key', expect.anything())
    const body = post.mock.calls[0][1] as Record<string, string>
    expect(body).not.toHaveProperty('password')
    expect(body.username).toBe('root')
    expect(body.encryption_key_id).toBe(KID)
    expect(serverDecrypt(body.password_encrypted, KID)).toBe(SHORT)
  })

  it('refetches the key after a refused attempt, in case it was rotated', async () => {
    post.mockResolvedValue({ data: { success: false, message: 'Username or password is incorrect' } })
    await passwordLogin({ encryptPassword: true, password: SHORT, turnstile: '', username: 'root' })
    await passwordLogin({ encryptPassword: true, password: SHORT, turnstile: '', username: 'root' })

    expect(get).toHaveBeenCalledTimes(2)
  })

  it('fails without sending anything when the server has no key to give', async () => {
    get.mockResolvedValue({ data: { success: true, data: { enabled: false } } })

    await expect(
      passwordLogin({ encryptPassword: true, password: SHORT, turnstile: '', username: 'root' }),
    ).rejects.toThrow()
    expect(post).not.toHaveBeenCalled()
  })
})
