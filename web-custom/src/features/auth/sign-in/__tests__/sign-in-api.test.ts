// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { post } }))

const { passwordLogin, readLoginOutcome, validateSignInCredentials } = await import(
  '@/features/auth/sign-in/api'
)

/** The exact bundle shape `authBundleSchema` accepts; anything less is not a bundle. */
const authBundle = {
  access_token: 'token',
  token_type: 'Bearer',
  access_expires_at: 1788010374,
  user: { id: 1, username: 'root', role: 100 },
  session: {
    sid: 'session-id',
    current: true,
    login_method: 'password',
    ip: '127.0.0.1',
    user_agent: 'vitest',
    created_at: 1788009474,
    last_active_at: 1788009474,
    expires_at: 1790601474,
  },
}

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: { success: true, data: authBundle } })
})

describe('passwordLogin', () => {
  it('sends the Turnstile token as a query parameter, not in the body', async () => {
    await passwordLogin({ password: 'secret', turnstile: 'cf-token', username: 'root' })

    expect(post).toHaveBeenCalledWith(
      '/api/user/login',
      { username: 'root', password: 'secret' },
      expect.objectContaining({ params: { turnstile: 'cf-token' } }),
    )
  })

  it('opts out of the global toast and refresh handlers so the form owns the failure', async () => {
    await passwordLogin({ password: 'secret', turnstile: '', username: 'root' })

    expect(post).toHaveBeenCalledWith(
      '/api/user/login',
      expect.anything(),
      expect.objectContaining({
        skipAuthRefresh: true,
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    )
  })
})

describe('readLoginOutcome', () => {
  it('reads a successful sign-in as an auth bundle', () => {
    expect(readLoginOutcome({ success: true, data: authBundle })).toEqual({
      kind: 'authenticated',
      bundle: authBundle,
    })
  })

  it('reads a two-factor challenge, which also arrives with success: true', () => {
    const outcome = readLoginOutcome({
      success: true,
      data: { require_2fa: true, flow_token: 'flow-token', expires_at: 1788010374 },
    })

    expect(outcome).toEqual({ kind: 'two-factor', flowToken: 'flow-token', expiresAt: 1788010374 })
  })

  it('treats a two-factor challenge with no flow token as unusable', () => {
    expect(readLoginOutcome({ success: true, data: { require_2fa: true, flow_token: '  ' } }))
      .toEqual({ kind: 'flow-expired' })
  })

  it('carries the server message for a rejected password', () => {
    expect(readLoginOutcome({
      success: false,
      message: 'Username or password is incorrect, or user has been banned',
    })).toEqual({
      kind: 'rejected',
      message: 'Username or password is incorrect, or user has been banned',
    })
  })

  it('reports a rejection with no message so the caller can supply one', () => {
    expect(readLoginOutcome({ success: false })).toEqual({ kind: 'rejected', message: '' })
  })

  it('never reads a payload that is not a bundle as a signed-in session', () => {
    expect(readLoginOutcome({ success: true, data: { username: 'root' } }))
      .toEqual({ kind: 'unreadable' })
    expect(readLoginOutcome(null)).toEqual({ kind: 'rejected', message: '' })
  })
})

describe('validateSignInCredentials', () => {
  it('accepts any non-empty username, including an email address', () => {
    expect(validateSignInCredentials({ password: 'secret', username: 'root@example.com' }))
      .toEqual({})
  })

  it('rejects a blank username and an empty password', () => {
    expect(validateSignInCredentials({ password: '', username: '   ' })).toEqual({
      username: 'username-required',
      password: 'password-required',
    })
  })

  it('does not reject a password made of spaces: the server decides what is valid', () => {
    expect(validateSignInCredentials({ password: '   ', username: 'root' })).toEqual({})
  })
})
