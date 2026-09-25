// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

const { confirmPasswordReset, requestPasswordResetEmail } = await import(
  '@/features/auth/password-reset/api'
)

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('requestPasswordResetEmail', () => {
  it('sends the address and the Turnstile token as query parameters', async () => {
    get.mockResolvedValue({ data: { success: true, message: '' } })

    await requestPasswordResetEmail('ada@example.com', 'token-1')

    expect(get).toHaveBeenCalledTimes(1)
    const [url, config] = get.mock.calls[0]
    expect(url).toBe('/api/reset_password')
    expect(config.params).toEqual({ email: 'ada@example.com', turnstile: 'token-1' })
    // A retry has to reach the server rather than join the in-flight GET for the same URL.
    expect(config.disableDuplicate).toBe(true)
  })

  it('surfaces the server message for a malformed address', async () => {
    get.mockResolvedValue({ data: { success: false, message: 'Invalid parameters' } })

    await expect(requestPasswordResetEmail('nope', '')).rejects.toThrow('Invalid parameters')
  })
})

describe('confirmPasswordReset', () => {
  it('returns the password the server generated', async () => {
    post.mockResolvedValue({ data: { success: true, message: '', data: 'a1b2c3d4e5f6' } })

    await expect(confirmPasswordReset('ada@example.com', 'token')).resolves.toBe('a1b2c3d4e5f6')
    expect(post).toHaveBeenCalledWith(
      '/api/user/reset',
      { email: 'ada@example.com', token: 'token' },
      expect.objectContaining({ skipBusinessError: true }),
    )
  })

  it('surfaces an expired or wrong token', async () => {
    post.mockResolvedValue({
      data: { success: false, message: 'Password reset link is invalid or has expired' },
    })

    await expect(confirmPasswordReset('ada@example.com', 'stale')).rejects.toThrow(
      'Password reset link is invalid or has expired',
    )
  })

  it('refuses a success payload that carries no password', async () => {
    post.mockResolvedValue({ data: { success: true, message: '', data: null } })

    await expect(confirmPasswordReset('ada@example.com', 'token')).rejects.toThrow(
      'The server did not return a new password.',
    )
  })
})
