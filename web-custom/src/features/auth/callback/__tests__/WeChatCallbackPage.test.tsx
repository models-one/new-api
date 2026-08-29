// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClientModule from '@/lib/api/client'

const httpMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const apiMocks = vi.hoisted(() => ({ getJson: vi.fn(), postJson: vi.fn() }))

vi.mock('@/lib/http-client', () => ({ api: { get: httpMocks.get, post: httpMocks.post } }))
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClientModule>()),
  getJson: apiMocks.getJson,
  postJson: apiMocks.postJson,
}))

const { WeChatCallbackPage } = await import('@/features/auth/callback/WeChatCallbackPage')
const { useAuthStore } = await import('@/stores/auth-store')

const authBundle = {
  access_token: 'access-token',
  token_type: 'Bearer',
  access_expires_at: 1788010335,
  user: { id: 1, username: 'root', role: 100 },
  session: {
    sid: 'session-id',
    current: true,
    login_method: 'wechat',
    ip: '127.0.0.1',
    user_agent: 'vitest',
    created_at: 1788009435,
    last_active_at: 1788009435,
    expires_at: 1790601435,
  },
}

async function renderWeChatCallback(path: string, options: { strict?: boolean } = {}) {
  window.history.replaceState({}, '', path)

  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } })
  const rootRoute = createRootRoute()
  const landingRoute = createRoute({
    component: () => <div>landing</div>,
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const signInRoute = createRoute({
    component: () => <div data-testid="sign-in" />,
    getParentRoute: () => rootRoute,
    path: '/sign-in',
  })
  const dashboardRoute = createRoute({
    component: () => <div data-testid="dashboard" />,
    getParentRoute: () => rootRoute,
    path: '/dashboard',
  })
  const callbackRoute = createRoute({
    component: WeChatCallbackPage,
    getParentRoute: () => rootRoute,
    path: '/oauth',
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren([landingRoute, dashboardRoute, signInRoute, callbackRoute]),
  })

  await router.load()
  const tree: ReactNode = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  render(options.strict === true ? <StrictMode>{tree}</StrictMode> : tree)
  return router
}

beforeEach(() => {
  httpMocks.get.mockReset()
  apiMocks.getJson.mockReset()
  apiMocks.getJson.mockResolvedValue({ system_name: 'Models.one', logo: '' })
  useAuthStore.getState().auth.reset()
})

afterEach(cleanup)

describe('WeChatCallbackPage', () => {
  it('announces the exchange in a live region rather than rendering nothing', async () => {
    httpMocks.get.mockReturnValue(new Promise(() => undefined))
    await renderWeChatCallback('/oauth?provider=wechat&code=wechat-code')

    const status = await screen.findByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Completing sign-in')
  })

  it('exchanges the code, adopts the session and replaces the spent URL', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: true, data: authBundle } })
    const router = await renderWeChatCallback('/oauth?provider=wechat&code=wechat-code')

    await waitFor(() => {
      expect(httpMocks.get).toHaveBeenCalledWith('/api/oauth/wechat', expect.objectContaining({
        params: { code: 'wechat-code' },
      }))
    })
    await waitFor(() => {
      expect(useAuthStore.getState().auth.user?.username).toBe('root')
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard')
    })
  })

  it('works for a callback that omits the provider parameter', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: true, data: authBundle } })
    await renderWeChatCallback('/oauth?code=wechat-code')

    await waitFor(() => {
      expect(httpMocks.get).toHaveBeenCalledWith('/api/oauth/wechat', expect.anything())
    })
  })

  it('spends the verification code once even though StrictMode replays the effect', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: true, data: authBundle } })
    const router = await renderWeChatCallback('/oauth?provider=wechat&code=wechat-code', {
      strict: true,
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard')
    })
    expect(httpMocks.get).toHaveBeenCalledTimes(1)
  })

  it('lands on the refusal the server gave, with a way forward', async () => {
    httpMocks.get.mockResolvedValue({
      data: { success: false, message: '管理员未开启通过微信登录以及注册' },
    })
    await renderWeChatCallback('/oauth?provider=wechat&code=wechat-code')

    expect(await screen.findByRole('alert')).toHaveTextContent('管理员未开启通过微信登录以及注册')
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
      'href',
      expect.stringContaining('/sign-in'),
    )
  })

  it('does not call the backend when the callback carries no code', async () => {
    await renderWeChatCallback('/oauth?provider=wechat')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This link is missing the verification code WeChat should have sent back.',
    )
    expect(httpMocks.get).not.toHaveBeenCalled()
  })

  it('refuses a callback naming a provider this route does not complete', async () => {
    await renderWeChatCallback('/oauth?provider=github&code=the-code')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This address only completes WeChat sign-ins',
    )
    expect(httpMocks.get).not.toHaveBeenCalled()
  })
})
