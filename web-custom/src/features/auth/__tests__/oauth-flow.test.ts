// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()
const get = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

const { startRedirectOAuth } = await import('@/features/auth/oauth-flow')
const { authProviderDescriptors } = await import('@/features/auth/oauth-providers')
const { EMPTY_AUTH_SERVER_CONFIG } = await import('@/features/auth/server-config')
const { REFERRAL_STORAGE_KEY } = await import('@/features/auth/referral')

const githubDescriptor = authProviderDescriptors({
  ...EMPTY_AUTH_SERVER_CONFIG,
  githubOAuthEnabled: true,
  githubClientId: 'gh-client',
})[0]

const wechatDescriptor = authProviderDescriptors({
  ...EMPTY_AUTH_SERVER_CONFIG,
  wechatLoginEnabled: true,
})[0]

function mockEndpoints(state: unknown = { success: true, data: { flow_token: 'state-token' } }) {
  post.mockImplementation((url: string) => {
    if (url === '/api/user/auth/logout') return Promise.resolve({ data: { success: true } })
    if (url === '/api/oauth/state') return Promise.resolve({ data: state })
    throw new Error(`unmocked POST ${url}`)
  })
}

beforeEach(() => {
  post.mockReset()
  get.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('startRedirectOAuth', () => {
  it('clears the session, mints a state token and hands the browser to the provider', async () => {
    mockEndpoints()
    const navigate = vi.fn()

    await startRedirectOAuth(githubDescriptor, { navigate, origin: 'https://console.example.com' })

    expect(post).toHaveBeenNthCalledWith(1, '/api/user/auth/logout', undefined, expect.anything())
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/api/oauth/state',
      { provider: 'github', intent: 'login', aff: undefined },
      expect.anything(),
    )
    expect(navigate).toHaveBeenCalledWith(
      'https://github.com/login/oauth/authorize?client_id=gh-client&state=state-token&scope=user:email',
    )
  })

  it('still starts the flow when the session reset fails', async () => {
    post.mockImplementation((url: string) => {
      if (url === '/api/user/auth/logout') return Promise.reject(new Error('session already gone'))
      if (url === '/api/oauth/state') {
        return Promise.resolve({ data: { success: true, data: { flow_token: 'state-token' } } })
      }
      throw new Error(`unmocked POST ${url}`)
    })
    const navigate = vi.fn()

    await startRedirectOAuth(githubDescriptor, { navigate, origin: 'https://console.example.com' })

    expect(navigate).toHaveBeenCalledOnce()
  })

  it('forwards a stored referral code so the sign-up is still credited', async () => {
    mockEndpoints()
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, 'PARTNER7')

    await startRedirectOAuth(githubDescriptor, { navigate: vi.fn(), origin: 'https://console.example.com' })

    expect(post).toHaveBeenNthCalledWith(
      2,
      '/api/oauth/state',
      { provider: 'github', intent: 'login', aff: 'PARTNER7' },
      expect.anything(),
    )
  })

  it('omits the referral code when binding a provider to an existing account', async () => {
    mockEndpoints()
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, 'PARTNER7')

    await startRedirectOAuth(githubDescriptor, {
      intent: 'bind',
      navigate: vi.fn(),
      origin: 'https://console.example.com',
    })

    expect(post).toHaveBeenNthCalledWith(
      2,
      '/api/oauth/state',
      { provider: 'github', intent: 'bind', aff: undefined },
      expect.anything(),
    )
  })

  it('does not navigate when the state token cannot be minted', async () => {
    mockEndpoints({ success: false, message: 'Rate limit exceeded' })
    const navigate = vi.fn()

    await expect(startRedirectOAuth(githubDescriptor, { navigate })).rejects.toThrow('Rate limit exceeded')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('accepts a bare-string state payload', async () => {
    mockEndpoints({ success: true, data: 'legacy-token' })
    const navigate = vi.fn()

    await startRedirectOAuth(githubDescriptor, { navigate, origin: 'https://console.example.com' })

    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('state=legacy-token'))
  })

  it('refuses a provider that has no redirect flow', async () => {
    mockEndpoints()
    await expect(startRedirectOAuth(wechatDescriptor, { navigate: vi.fn() })).rejects.toThrow(/redirect flow/)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('referral code length guard', () => {
  it('drops a referral code the server would reject outright', async () => {
    mockEndpoints()
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, 'x'.repeat(33))

    await startRedirectOAuth(githubDescriptor, { navigate: vi.fn(), origin: 'https://console.example.com' })

    expect(post).toHaveBeenNthCalledWith(
      2,
      '/api/oauth/state',
      { provider: 'github', intent: 'login', aff: undefined },
      expect.anything(),
    )
  })

  it('keeps a referral code at the maximum accepted length', async () => {
    mockEndpoints()
    const code = 'x'.repeat(32)
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, code)

    await startRedirectOAuth(githubDescriptor, { navigate: vi.fn(), origin: 'https://console.example.com' })

    expect(post).toHaveBeenNthCalledWith(
      2,
      '/api/oauth/state',
      { provider: 'github', intent: 'login', aff: code },
      expect.anything(),
    )
  })
})
