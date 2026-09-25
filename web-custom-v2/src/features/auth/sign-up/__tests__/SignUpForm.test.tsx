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

/**
 * The real widget injects Cloudflare's script, which never loads under a test DOM. This
 * stand-in exposes the two things the form's Turnstile handling depends on: a way to hand
 * it a token, and the `refreshKey` it is mounted with — a change in that key is exactly
 * what proves the widget was forced to remount after a token was spent.
 */
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

const { SignUpForm } = await import('@/features/auth/sign-up/components/SignUpForm')
const { EMPTY_AUTH_SERVER_CONFIG } = await import('@/features/auth/server-config')

type AuthServerConfig = typeof EMPTY_AUTH_SERVER_CONFIG

const baseConfig: AuthServerConfig = {
  ...EMPTY_AUTH_SERVER_CONFIG,
  passwordRegisterEnabled: true,
  registerEnabled: true,
}

async function renderForm(overrides: Partial<AuthServerConfig> = {}) {
  const rootRoute = createRootRoute()
  const signUpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-up',
    component: () => <SignUpForm config={{ ...baseConfig, ...overrides }} />,
  })
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-in',
    component: () => <div>sign in page</div>,
  })
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => <div>dashboard</div>,
  })

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/sign-up'] }),
    routeTree: rootRoute.addChildren([signUpRoute, signInRoute, dashboardRoute]),
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

function fillCredentials(password = 'correct-horse') {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'ada' } })
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } })
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: password } })
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  window.localStorage.clear()
})

afterEach(cleanup)

describe('SignUpForm — which fields the server config asks for', () => {
  it('hides the email section while email verification is off', async () => {
    await renderForm()

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/verification code/i)).not.toBeInTheDocument()
  })

  it('shows the address and the code once email verification is on', async () => {
    await renderForm({ emailVerificationEnabled: true })

    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument()
  })

  it('replaces the password form with an explanation when password sign-up is off', async () => {
    await renderForm({ passwordRegisterEnabled: false })

    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
    expect(screen.getByText(/password sign-up is turned off/i)).toBeInTheDocument()
  })

  it('says so when no sign-up method is left at all', async () => {
    await renderForm({ passwordRegisterEnabled: false })

    expect(screen.getByText(/no sign-up method is enabled/i)).toBeInTheDocument()
  })

  it('keeps the provider block when password sign-up is off but a provider is enabled', async () => {
    await renderForm({
      githubClientId: 'gh',
      githubOAuthEnabled: true,
      passwordRegisterEnabled: false,
    })

    expect(screen.getByRole('button', { name: /continue with github/i })).toBeInTheDocument()
    expect(screen.queryByText(/no sign-up method is enabled/i)).not.toBeInTheDocument()
  })
})

describe('SignUpForm — validation', () => {
  it('reports a password mismatch inline and sends nothing', async () => {
    await renderForm()

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'ada' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'correct-horse' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'other-horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('requires the code only in the mode that uses it', async () => {
    const view = await renderForm()

    fillCredentials()
    post.mockResolvedValue({ data: { success: true, message: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))

    view.unmount()
    post.mockClear()

    await renderForm({ emailVerificationEnabled: true })
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Please enter the verification code.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('blocks the send-code request until the address looks like one', async () => {
    await renderForm({ emailVerificationEnabled: true })

    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('SignUpForm — registration', () => {
  it('posts the credentials without the email fields when verification is off', async () => {
    post.mockResolvedValue({ data: { success: true, message: '' } })
    await renderForm()

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const [url, body, config] = post.mock.calls[0]
    expect(url).toBe('/api/user/register')
    expect(body).toEqual({
      aff_code: undefined,
      email: undefined,
      password: 'correct-horse',
      username: 'ada',
      verification_code: undefined,
    })
    expect(config.params).toEqual({ turnstile: '' })
  })

  it('forwards the stored referral code', async () => {
    window.localStorage.setItem('aff', 'invite-42')
    post.mockResolvedValue({ data: { success: true, message: '' } })
    await renderForm()

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][1].aff_code).toBe('invite-42')
  })

  it('does not sign the user in — it hands them to the sign-in page', async () => {
    post.mockResolvedValue({ data: { success: true, message: '' } })
    await renderForm()

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('sign in page')).toBeInTheDocument()
  })

  it('stays on the form when the server refuses the registration', async () => {
    post.mockResolvedValue({
      data: { success: false, message: 'Username already exists or has been deleted' },
    })
    await renderForm()

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('sign in page')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })
})

describe('SignUpForm — legal consent', () => {
  it('blocks submission until the published documents are accepted', async () => {
    await renderForm({ userAgreementEnabled: true })

    fillCredentials()
    const submit = screen.getByRole('button', { name: 'Create account' })
    expect(submit).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()
  })

  it('does not gate submission when no document is published', async () => {
    await renderForm()

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })
})

describe('SignUpForm — Turnstile is single use', () => {
  const turnstileConfig: Partial<AuthServerConfig> = {
    emailVerificationEnabled: true,
    turnstileEnabled: true,
    turnstileSiteKey: 'site-key',
  }

  it('holds every request back until a token exists', async () => {
    await renderForm(turnstileConfig)

    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled()

    fireEvent.click(screen.getByText('solve turnstile'))
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('spends the token on the send-code call and remounts the widget for a fresh one', async () => {
    get.mockResolvedValue({ data: { success: true, message: '' } })
    await renderForm(turnstileConfig)

    fireEvent.click(screen.getByText('solve turnstile'))
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    expect(get.mock.calls[0][0]).toBe('/api/verification')
    expect(get.mock.calls[0][1].params).toEqual({
      email: 'ada@example.com',
      turnstile: 'token-0',
    })

    // The spent token is dropped and the widget is remounted, so the register call cannot
    // reuse it — that reuse is what silently fails the server-side check.
    await waitFor(() =>
      expect(screen.getByText('solve turnstile')).toHaveAttribute('data-refresh-key', '1'))
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()

    fireEvent.click(screen.getByText('solve turnstile'))
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('starts the resend countdown once a code was sent', async () => {
    get.mockResolvedValue({ data: { success: true, message: '' } })
    await renderForm(turnstileConfig)

    fireEvent.click(screen.getByText('solve turnstile'))
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByRole('button', { name: 'Resend in 30s' })).toBeDisabled()
  })

  it('also drops the token after a failed request', async () => {
    get.mockResolvedValue({ data: { success: false, message: 'invalid SMTP account' } })
    await renderForm(turnstileConfig)

    fireEvent.click(screen.getByText('solve turnstile'))
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'ada@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    await waitFor(() =>
      expect(screen.getByText('solve turnstile')).toHaveAttribute('data-refresh-key', '1'))
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled()
  })
})
