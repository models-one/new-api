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

const { OAuthCallbackPage } = await import('@/features/auth/callback/OAuthCallbackPage')
const {
  OAUTH_BIND_CALLBACK_MESSAGE,
  OAUTH_BIND_RESPONSE_TIMEOUT_MS,
  OAUTH_BIND_RESULT_MESSAGE,
} = await import(
  '@/features/auth/callback/bind-window'
)
const { useAuthStore } = await import('@/stores/auth-store')

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

type FakeOpener = { closed: boolean; postMessage: ReturnType<typeof vi.fn> }

function setOpener(opener: FakeOpener | null) {
  Object.defineProperty(window, 'opener', { configurable: true, value: opener, writable: true })
}

function setCallbackUrl(path: string) {
  window.history.replaceState({}, '', path)
}

async function renderCallback(path: string, options: { strict?: boolean } = {}) {
  setCallbackUrl(path)

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
  const walletRoute = createRoute({
    component: () => <div data-testid="wallet" />,
    getParentRoute: () => rootRoute,
    path: '/wallet',
  })
  const callbackRoute = createRoute({
    component: OAuthCallbackPage,
    getParentRoute: () => rootRoute,
    path: '/oauth/$provider',
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren([
      landingRoute,
      dashboardRoute,
      walletRoute,
      signInRoute,
      callbackRoute,
    ]),
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
  httpMocks.post.mockReset()
  apiMocks.getJson.mockReset()
  apiMocks.getJson.mockResolvedValue({ system_name: 'Models.one', logo: '' })
  setOpener(null)
  useAuthStore.getState().auth.reset()
  vi.spyOn(window, 'close').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('login mode', () => {
  it('narrates the wait in a live region instead of showing a blank page', async () => {
    httpMocks.get.mockReturnValue(new Promise(() => undefined))
    await renderCallback('/oauth/github?code=the-code&state=flow-token')

    const status = await screen.findByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Completing sign-in')
    expect(screen.getByRole('heading', { name: 'Signing you in with GitHub' })).toBeInTheDocument()
  })

  it('exchanges the code, adopts the session and moves on', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: true, data: authBundle } })
    const router = await renderCallback('/oauth/github?code=the-code&state=flow-token')

    await waitFor(() => {
      expect(httpMocks.get).toHaveBeenCalledWith('/api/oauth/github', expect.objectContaining({
        params: expect.objectContaining({ code: 'the-code', state: 'flow-token' }),
      }))
    })
    await waitFor(() => {
      expect(useAuthStore.getState().auth.user?.username).toBe('root')
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard')
    })
  })

  it('honours a redirect that survives the open-redirect guard', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: true, data: authBundle } })
    const router = await renderCallback('/oauth/github?code=c&state=s&redirect=%2Fwallet')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/wallet')
    })
  })

  it('ignores a redirect pointing off this origin', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: true, data: authBundle } })
    const router = await renderCallback(
      '/oauth/github?code=c&state=s&redirect=https%3A%2F%2Fevil.test%2Fsteal',
    )

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard')
    })
  })

  it('stops on the server refusal with a way back, never a blank screen', async () => {
    httpMocks.get.mockRejectedValue({
      response: { status: 403, data: { success: false, message: 'State parameter is empty or mismatched' } },
    })
    await renderCallback('/oauth/github?code=the-code&state=stale')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'State parameter is empty or mismatched',
    )
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
      'href',
      expect.stringContaining('/sign-in'),
    )
    expect(useAuthStore.getState().auth.user).toBeNull()
  })

  it('supplies its own wording when the failure carried no message', async () => {
    httpMocks.get.mockRejectedValue(new Error('network down'))
    await renderCallback('/oauth/github?code=the-code&state=flow-token')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The provider response was rejected.',
    )
  })

  it('does not call the backend when the provider returned neither a code nor an error', async () => {
    await renderCallback('/oauth/github?state=flow-token')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The provider did not send an authorization code back to this page.',
    )
    expect(httpMocks.get).not.toHaveBeenCalled()
  })

  it('still calls the backend for a provider error, which is what consumes the flow', async () => {
    httpMocks.get.mockResolvedValue({ data: { success: false, message: 'The user denied access' } })
    await renderCallback('/oauth/github?error=access_denied&state=flow-token')

    await waitFor(() => {
      expect(httpMocks.get).toHaveBeenCalledWith('/api/oauth/github', expect.objectContaining({
        params: expect.objectContaining({ error: 'access_denied' }),
      }))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('The user denied access')
  })

  it('exchanges the code once even though StrictMode runs the effect twice', async () => {
    // `model.ConsumeAuthFlow` burns the state on the first exchange, so a second
    // request with the same state comes back as HTTP 403. The page must reach the
    // backend exactly once no matter how many times React replays its effect —
    // this is what StrictMode turns from a theory into a development-only outage.
    httpMocks.get.mockResolvedValue({ data: { success: true, data: authBundle } })
    const router = await renderCallback('/oauth/github?code=the-code&state=flow-token', {
      strict: true,
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard')
    })
    expect(httpMocks.get).toHaveBeenCalledTimes(1)
  })

  it('names an operator-defined provider by its slug rather than inventing one', async () => {
    httpMocks.get.mockReturnValue(new Promise(() => undefined))
    await renderCallback('/oauth/acme-sso?code=c&state=s')

    expect(await screen.findByRole('heading', { name: 'Signing you in with acme-sso' }))
      .toBeInTheDocument()
  })
})

describe('bind mode', () => {
  it('hands the code to the opener instead of calling an endpoint it cannot authenticate', async () => {
    const opener: FakeOpener = { closed: false, postMessage: vi.fn() }
    setOpener(opener)
    await renderCallback('/oauth/github?code=the-code&state=flow-token')

    await waitFor(() => {
      expect(opener.postMessage).toHaveBeenCalledWith(
        {
          type: OAUTH_BIND_CALLBACK_MESSAGE,
          provider: 'github',
          code: 'the-code',
          state: 'flow-token',
          error: undefined,
          errorDescription: undefined,
        },
        window.location.origin,
      )
    })
    expect(httpMocks.get).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Linking your GitHub account' })).toBeInTheDocument()
  })

  it('closes once the opener reports the account was linked', async () => {
    const opener: FakeOpener = { closed: false, postMessage: vi.fn() }
    setOpener(opener)
    await renderCallback('/oauth/github?code=the-code&state=flow-token')
    await waitFor(() => expect(opener.postMessage).toHaveBeenCalled())

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: OAUTH_BIND_RESULT_MESSAGE,
          provider: 'github',
          state: 'flow-token',
          success: true,
        },
        origin: window.location.origin,
        source: opener as unknown as Window,
      }),
    )

    expect(await screen.findByRole('heading', { name: 'GitHub account linked' })).toBeInTheDocument()
    expect(window.close).toHaveBeenCalled()
  })

  it("shows the opener's reason and stays open when the link was refused", async () => {
    const opener: FakeOpener = { closed: false, postMessage: vi.fn() }
    setOpener(opener)
    await renderCallback('/oauth/github?code=the-code&state=flow-token')
    await waitFor(() => expect(opener.postMessage).toHaveBeenCalled())

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: OAUTH_BIND_RESULT_MESSAGE,
          provider: 'github',
          state: 'flow-token',
          success: false,
          message: 'This GitHub account is already bound to another user',
        },
        origin: window.location.origin,
        source: opener as unknown as Window,
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This GitHub account is already bound to another user',
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(window.close).not.toHaveBeenCalled()
  })

  it('ignores a verdict from another origin', async () => {
    const opener: FakeOpener = { closed: false, postMessage: vi.fn() }
    setOpener(opener)
    await renderCallback('/oauth/github?code=the-code&state=flow-token')
    await waitFor(() => expect(opener.postMessage).toHaveBeenCalled())

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: OAUTH_BIND_RESULT_MESSAGE,
          provider: 'github',
          state: 'flow-token',
          success: true,
        },
        origin: 'https://evil.test',
        source: opener as unknown as Window,
      }),
    )

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })
    expect(window.close).not.toHaveBeenCalled()
  })

  it('ignores a verdict for a different handshake', async () => {
    const opener: FakeOpener = { closed: false, postMessage: vi.fn() }
    setOpener(opener)
    await renderCallback('/oauth/github?code=the-code&state=flow-token')
    await waitFor(() => expect(opener.postMessage).toHaveBeenCalled())

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: OAUTH_BIND_RESULT_MESSAGE,
          provider: 'github',
          state: 'an-older-attempt',
          success: true,
        },
        origin: window.location.origin,
        source: opener as unknown as Window,
      }),
    )

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })
    expect(window.close).not.toHaveBeenCalled()
  })

  it('gives up with an explanation when the opener never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const opener: FakeOpener = { closed: false, postMessage: vi.fn() }
    setOpener(opener)
    await renderCallback('/oauth/github?code=the-code&state=flow-token')
    await waitFor(() => expect(opener.postMessage).toHaveBeenCalled())

    await vi.advanceTimersByTimeAsync(OAUTH_BIND_RESPONSE_TIMEOUT_MS + 1)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The page that opened this window did not answer in time.',
    )
    vi.useRealTimers()
  })

  it('explains itself when the window that opened it is already gone', async () => {
    setOpener({ closed: true, postMessage: vi.fn() })
    await renderCallback('/oauth/github?code=the-code&state=flow-token')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This window is no longer connected to the page that opened it.',
    )
  })
})

describe('telegram bind callback', () => {
  it('forwards the backend verdict to the opener and closes', async () => {
    const opener: FakeOpener = { closed: false, postMessage: vi.fn() }
    setOpener(opener)
    await renderCallback('/oauth/telegram?telegram_bind=success&flow_token=flow-token')

    await waitFor(() => {
      expect(opener.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ flow_token: 'flow-token', success: true }),
        window.location.origin,
      )
    })
    expect(window.close).toHaveBeenCalled()
  })

  it('stops on an explanation when the callback is missing its flow token', async () => {
    const opener: FakeOpener = { closed: false, postMessage: vi.fn() }
    setOpener(opener)
    await renderCallback('/oauth/telegram?telegram_bind=error')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Telegram sent back an incomplete result',
    )
    expect(opener.postMessage).not.toHaveBeenCalled()
    expect(window.close).not.toHaveBeenCalled()
  })
})
