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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const { OtpPage } = await import('@/features/auth/otp/OtpPage')
const { clearPending2FAChallenge, setPending2FAChallenge } = await import(
  '@/features/auth/otp/pending-2fa'
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
    login_method: 'password',
    ip: '127.0.0.1',
    user_agent: 'vitest',
    created_at: 1788009435,
    last_active_at: 1788009435,
    expires_at: 1790601435,
  },
}

async function renderOtp() {
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
  const otpRoute = createRoute({
    component: OtpPage,
    getParentRoute: () => rootRoute,
    path: '/otp',
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/otp'] }),
    routeTree: rootRoute.addChildren([landingRoute, dashboardRoute, signInRoute, otpRoute]),
  })

  await router.load()
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function enterAuthenticatorCode(code: string) {
  fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: code } })
}

beforeEach(() => {
  httpMocks.get.mockReset()
  httpMocks.post.mockReset()
  apiMocks.getJson.mockReset()
  apiMocks.getJson.mockResolvedValue({ system_name: 'Models.one', logo: '' })
  globalThis.sessionStorage.clear()
  clearPending2FAChallenge()
  useAuthStore.getState().auth.reset()
})

afterEach(cleanup)

describe('OtpPage without a live challenge', () => {
  it('offers a way back to sign-in instead of an unusable form', async () => {
    await renderOtp()

    expect(await screen.findByRole('heading', { name: 'Your sign-in session expired' }))
      .toBeInTheDocument()
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
      'href',
      expect.stringContaining('/sign-in'),
    )
  })

  it('falls back to that panel when the stored challenge has already expired', async () => {
    setPending2FAChallenge({
      expiresAt: Math.floor(Date.now() / 1000) - 1,
      flowToken: 'stale-token',
    })
    await renderOtp()

    expect(await screen.findByRole('heading', { name: 'Your sign-in session expired' }))
      .toBeInTheDocument()
  })
})

describe('OtpPage with a live challenge', () => {
  beforeEach(() => {
    setPending2FAChallenge({
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      flowToken: 'flow-token',
    })
  })

  it('turns into the recovery panel by itself when the challenge times out', async () => {
    // The server's TTL is the only thing that decides whether the form can still work.
    // Leaving the user typing into a form whose only possible answer is "session
    // expired" is the failure this page exists to avoid.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      setPending2FAChallenge({
        expiresAt: Math.floor(Date.now() / 1000) + 2,
        flowToken: 'flow-token',
      })
      await renderOtp()
      expect(await screen.findByLabelText('Authenticator code')).toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(3000)

      expect(await screen.findByRole('heading', { name: 'Your sign-in session expired' }))
        .toBeInTheDocument()
      expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds submission until a full six-digit code is present', async () => {
    await renderOtp()

    const submit = await screen.findByRole('button', { name: 'Verify and sign in' })
    expect(submit).toBeDisabled()

    enterAuthenticatorCode('12345')
    expect(submit).toBeDisabled()

    enterAuthenticatorCode('123456')
    expect(submit).toBeEnabled()
  })

  it('posts the code with the stashed flow token and adopts the session', async () => {
    httpMocks.post.mockResolvedValue({ data: { success: true, data: authBundle } })
    await renderOtp()

    enterAuthenticatorCode('123456')
    fireEvent.click(await screen.findByRole('button', { name: 'Verify and sign in' }))

    await waitFor(() => {
      expect(httpMocks.post).toHaveBeenCalledWith(
        '/api/user/login/2fa',
        { code: '123456', flow_token: 'flow-token' },
        expect.objectContaining({ skipAuthRefresh: true }),
      )
    })
    await waitFor(() => {
      expect(useAuthStore.getState().auth.user?.username).toBe('root')
    })
    expect(globalThis.sessionStorage.getItem('pending-2fa')).toBeNull()
  })

  it('submits the form itself, so Enter in the code field works', async () => {
    httpMocks.post.mockResolvedValue({ data: { success: true, data: authBundle } })
    await renderOtp()

    enterAuthenticatorCode('123456')
    const field = screen.getByLabelText('Authenticator code')
    const form = field.closest('form')
    expect(form).not.toBeNull()
    if (form !== null) fireEvent.submit(form)

    await waitFor(() => {
      expect(httpMocks.post).toHaveBeenCalledWith(
        '/api/user/login/2fa',
        { code: '123456', flow_token: 'flow-token' },
        expect.anything(),
      )
    })
  })

  it('clears a stale refusal when the user switches verification method', async () => {
    httpMocks.post.mockResolvedValue({
      data: { success: false, message: '验证码或备用码错误，请重试' },
    })
    await renderOtp()

    enterAuthenticatorCode('000000')
    fireEvent.click(await screen.findByRole('button', { name: 'Verify and sign in' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Backup code' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server refusal next to the form and keeps the challenge usable', async () => {
    httpMocks.post.mockResolvedValue({
      data: { success: false, message: '验证码或备用码错误，请重试' },
    })
    await renderOtp()

    enterAuthenticatorCode('000000')
    fireEvent.click(await screen.findByRole('button', { name: 'Verify and sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('验证码或备用码错误，请重试')
    expect(screen.getByLabelText('Authenticator code')).toBeInTheDocument()
    expect(useAuthStore.getState().auth.user).toBeNull()
  })

  it('explains a transport failure rather than leaving the button spinning', async () => {
    httpMocks.post.mockRejectedValue(new Error('network down'))
    await renderOtp()

    enterAuthenticatorCode('123456')
    fireEvent.click(await screen.findByRole('button', { name: 'Verify and sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The code could not be verified. Check your connection and try again.',
    )
    expect(screen.getByRole('button', { name: 'Verify and sign in' })).toBeEnabled()
  })

  it('refuses a success envelope carrying something that is not a session', async () => {
    httpMocks.post.mockResolvedValue({ data: { success: true, data: { hello: 'world' } } })
    await renderOtp()

    enterAuthenticatorCode('123456')
    fireEvent.click(await screen.findByRole('button', { name: 'Verify and sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server accepted the code but returned an unusable session',
    )
    expect(useAuthStore.getState().auth.user).toBeNull()
  })

  it('switches to the backup-code field and sends it without the printed hyphen', async () => {
    httpMocks.post.mockResolvedValue({ data: { success: true, data: authBundle } })
    await renderOtp()

    fireEvent.click(await screen.findByRole('button', { name: 'Backup code' }))
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument()

    const field = screen.getByLabelText('Backup code')
    fireEvent.change(field, { target: { value: 'cawdoqdv' } })
    expect(field).toHaveValue('CAWD-OQDV')

    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }))

    await waitFor(() => {
      expect(httpMocks.post).toHaveBeenCalledWith(
        '/api/user/login/2fa',
        { code: 'CAWDOQDV', flow_token: 'flow-token' },
        expect.objectContaining({ skipAuthRefresh: true }),
      )
    })
  })

  it('keeps the backup-code submit disabled until the code is complete', async () => {
    await renderOtp()

    fireEvent.click(await screen.findByRole('button', { name: 'Backup code' }))
    fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'cawd' } })

    expect(screen.getByRole('button', { name: 'Verify and sign in' })).toBeDisabled()
  })
})
