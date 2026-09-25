// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const httpMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@/lib/http-client', () => ({ api: { get: httpMocks.get, post: httpMocks.post } }))

const { exchangeOAuthLogin, exchangeWeChatLogin } = await import('@/features/auth/callback/api')

const authBundle = {
  access_token: 'access-token',
  token_type: 'Bearer',
  access_expires_at: 1788010335,
  user: { id: 1, username: 'root', role: 100 },
  session: {
    sid: 'session-id',
    current: true,
    login_method: 'github',
    ip: '127.0.0.1',
    user_agent: 'vitest',
    created_at: 1788009435,
    last_active_at: 1788009435,
    expires_at: 1790601435,
  },
}

const query = { code: 'the-code', state: 'flow-token', error: '', errorDescription: '' }

beforeEach(() => {
  httpMocks.get.mockReset()
})

describe('exchangeOAuthLogin', () => {
  it('returns the session the backend issued', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: true, data: authBundle } })

    await expect(exchangeOAuthLogin('github', query)).resolves.toEqual({
      ok: true,
      bundle: authBundle,
    })
  })

  it('calls the provider endpoint with the callback parameters and no shared handlers', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: true, data: authBundle } })

    await exchangeOAuthLogin('github', query)

    expect(httpMocks.get).toHaveBeenCalledWith('/api/oauth/github', expect.objectContaining({
      params: {
        code: 'the-code',
        state: 'flow-token',
        error: undefined,
        error_description: undefined,
      },
      skipAuthRefresh: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    }))
  })

  it('escapes the provider slug rather than trusting it as a path', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: false, message: 'Unknown OAuth provider' } })

    await exchangeOAuthLogin('../user/self', query)

    expect(httpMocks.get).toHaveBeenCalledWith('/api/oauth/..%2Fuser%2Fself', expect.anything())
  })

  it('forwards the provider error so the backend can consume the flow', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: false, message: 'The user denied access' } })

    await exchangeOAuthLogin('github', {
      code: '',
      state: 'flow-token',
      error: 'access_denied',
      errorDescription: 'The user denied access',
    })

    expect(httpMocks.get).toHaveBeenCalledWith('/api/oauth/github', expect.objectContaining({
      params: {
        code: undefined,
        state: 'flow-token',
        error: 'access_denied',
        error_description: 'The user denied access',
      },
    }))
  })

  it("keeps the server's own message when it refuses with HTTP 200", async () => {
    httpMocks.get.mockResolvedValue({ data: { success: false, message: 'The user denied access' } })

    await expect(exchangeOAuthLogin('github', query)).resolves.toEqual({
      ok: false,
      message: 'The user denied access',
    })
  })

  it('reads the message out of a thrown HTTP error, which is how a bad state arrives', async () => {
    httpMocks.get.mockRejectedValue({
      response: { status: 403, data: { success: false, message: 'State parameter is empty or mismatched' } },
    })

    await expect(exchangeOAuthLogin('github', query)).resolves.toEqual({
      ok: false,
      message: 'State parameter is empty or mismatched',
    })
  })

  it('leaves the wording to the page when the failure carried no message', async () => {
    httpMocks.get.mockRejectedValue(new Error('network down'))

    await expect(exchangeOAuthLogin('github', query)).resolves.toEqual({ ok: false, message: '' })
  })

  it('refuses a success envelope whose payload is not a session', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: true, data: { require_2fa: true } } })

    await expect(exchangeOAuthLogin('github', query)).resolves.toEqual({ ok: false, message: '' })
  })
})

describe('exchangeWeChatLogin', () => {
  it('exchanges the verification code for a session', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: true, data: authBundle } })

    await expect(exchangeWeChatLogin('wechat-code')).resolves.toEqual({
      ok: true,
      bundle: authBundle,
    })
    expect(httpMocks.get).toHaveBeenCalledWith('/api/oauth/wechat', expect.objectContaining({
      params: { code: 'wechat-code' },
    }))
  })

  it('surfaces the refusal the live server returns when WeChat login is off', async () => {
    httpMocks.get.mockResolvedValue({
      data: { success: false, message: '管理员未开启通过微信登录以及注册' },
    })

    await expect(exchangeWeChatLogin('wechat-code')).resolves.toEqual({
      ok: false,
      message: '管理员未开启通过微信登录以及注册',
    })
  })
})
