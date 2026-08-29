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

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

vi.mock('@/components/system/Turnstile', () => ({
  Turnstile: (props: { onVerify: (token: string) => void, refreshKey?: number | string }) => {
    const generation = String(props.refreshKey ?? '0')
    return (
      <button
        data-refresh-key={generation}
        onClick={() => props.onVerify(`token-${generation}`)}
        type="button"
      >
        solve turnstile
      </button>
    )
  },
}))

const { ForgotPasswordPage } = await import('@/features/auth/password-reset/ForgotPasswordPage')

type StatusPayload = Record<string, unknown>

/** Answers `/api/status` from the given payload and the reset request from `resetResult`. */
function stubBackend(status: StatusPayload, resetResult: { success: boolean, message?: string }) {
  get.mockImplementation((url: string) => {
    if (url === '/api/status') {
      return Promise.resolve({ data: { success: true, message: '', data: status } })
    }
    return Promise.resolve({ data: { ...resetResult, message: resetResult.message ?? '' } })
  })
}

async function renderPage() {
  const rootRoute = createRootRoute()
  const forgotRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/forgot-password',
    component: ForgotPasswordPage,
  })
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-in',
    component: () => <div>sign in page</div>,
  })
  const landingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>landing</div>,
  })

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/forgot-password'] }),
    routeTree: rootRoute.addChildren([landingRoute, forgotRoute, signInRoute]),
  })
  await router.load()

  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

afterEach(cleanup)

describe('ForgotPasswordPage', () => {
  it('waits for /api/status before deciding whether a human check is needed', async () => {
    stubBackend({ turnstile_check: true, turnstile_site_key: 'site-key' }, { success: true })
    await renderPage()

    // Nothing is offered while the config is unknown, so no form can flash the wrong shape.
    expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument()

    expect(await screen.findByText('solve turnstile')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeDisabled()
  })

  it('omits the human check when the operator has not configured one', async () => {
    stubBackend({ turnstile_check: false, turnstile_site_key: '' }, { success: true })
    await renderPage()

    expect(await screen.findByRole('button', { name: 'Send reset link' })).toBeEnabled()
    expect(screen.queryByText('solve turnstile')).not.toBeInTheDocument()
  })

  it('rejects a malformed address before sending anything', async () => {
    stubBackend({}, { success: true })
    await renderPage()

    const field = await screen.findByLabelText(/^email/i)
    fireEvent.change(field, { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/reset_password', expect.anything())
  })

  it('sends the address and starts the resend lock', async () => {
    stubBackend({}, { success: true })
    await renderPage()

    const field = await screen.findByLabelText(/^email/i)
    fireEvent.change(field, { target: { value: ' ada@example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/api/reset_password', expect.objectContaining({
        params: { email: 'ada@example.com', turnstile: '' },
      })))

    expect(await screen.findByRole('button', { name: 'Resend in 30s' })).toBeDisabled()
  })

  it('spends the Turnstile token and remounts the widget for the retry', async () => {
    stubBackend({ turnstile_check: true, turnstile_site_key: 'site-key' }, { success: true })
    await renderPage()

    fireEvent.click(await screen.findByText('solve turnstile'))
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/api/reset_password', expect.objectContaining({
        params: { email: 'ada@example.com', turnstile: 'token-0' },
      })))

    // The legacy form kept the spent token, which made its own resend button fail.
    await waitFor(() =>
      expect(screen.getByText('solve turnstile')).toHaveAttribute('data-refresh-key', '1'))
  })

  it('stays on the form when the server rejects the address', async () => {
    stubBackend({}, { message: 'Invalid parameters', success: false })
    await renderPage()

    const field = await screen.findByLabelText(/^email/i)
    fireEvent.change(field, { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/api/reset_password', expect.anything()))
    // No countdown: the request failed, so the user may try again immediately.
    expect(await screen.findByRole('button', { name: 'Send reset link' })).toBeEnabled()
  })
})
