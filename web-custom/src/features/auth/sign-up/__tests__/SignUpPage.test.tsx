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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

const { SignUpPage } = await import('@/features/auth/sign-up/SignUpPage')

function stubStatus(status: Record<string, unknown>) {
  get.mockResolvedValue({ data: { success: true, message: '', data: status } })
}

async function renderPage() {
  const rootRoute = createRootRoute()
  const signUpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-up',
    component: SignUpPage,
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
    history: createMemoryHistory({ initialEntries: ['/sign-up'] }),
    routeTree: rootRoute.addChildren([landingRoute, signUpRoute, signInRoute]),
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
  window.localStorage.clear()
  window.history.replaceState({}, '', '/sign-up')
})

afterEach(cleanup)

describe('SignUpPage', () => {
  it('shows a placeholder instead of a form while /api/status is pending', async () => {
    get.mockReturnValue(new Promise(() => undefined))
    await renderPage()

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()
  })

  it('renders the form once the server says registration is open', async () => {
    stubStatus({ password_register_enabled: true, register_enabled: true })
    await renderPage()

    expect(await screen.findByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })

  it('offers no form at all when registration is closed', async () => {
    stubStatus({ password_register_enabled: true, register_enabled: false })
    await renderPage()

    expect(await screen.findByText('Registration is closed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()
  })

  it('shows the terms footnote only when a legal document is published', async () => {
    stubStatus({ register_enabled: true, user_agreement_enabled: true })
    await renderPage()

    expect(await screen.findByText(/by creating an account/i)).toBeInTheDocument()
  })

  it('persists a referral code the visitor arrived with', async () => {
    window.history.replaceState({}, '', '/sign-up?aff=invite-9')
    stubStatus({ password_register_enabled: true, register_enabled: true })
    await renderPage()

    await waitFor(() => expect(window.localStorage.getItem('aff')).toBe('invite-9'))
  })

  it('offers a way back to sign-in', async () => {
    stubStatus({ password_register_enabled: true, register_enabled: true })
    await renderPage()

    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in',
    )
  })
})
