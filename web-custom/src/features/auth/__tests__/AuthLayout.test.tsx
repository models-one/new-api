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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

const { AuthLayout } = await import('@/features/auth/AuthLayout')

async function renderAuthLayout() {
  const rootRoute = createRootRoute()
  const landingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Landing</div>,
  })
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-in',
    component: () => (
      <AuthLayout description="Use your account to continue." title="Sign in">
        <p>form</p>
      </AuthLayout>
    ),
  })

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/sign-in'] }),
    routeTree: rootRoute.addChildren([landingRoute, signInRoute]),
  })
  await router.load()

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

describe('AuthLayout', () => {
  it('names the main landmark with the page heading', async () => {
    get.mockResolvedValue({ data: { success: true, data: { system_name: 'Models.one', logo: '' } } })
    await renderAuthLayout()

    expect(await screen.findByRole('main', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('Use your account to continue.')).toBeInTheDocument()
  })

  it('shows a placeholder instead of a guessed brand while status is pending', async () => {
    get.mockReturnValue(new Promise(() => undefined))
    const { container } = await renderAuthLayout()

    await screen.findByRole('heading', { level: 1, name: 'Sign in' })
    expect(screen.queryByText('Models.one')).not.toBeInTheDocument()
    expect(screen.queryByText('Back to home')).not.toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(within(screen.getByRole('banner')).getByRole('link')).toBeInTheDocument()
  })

  it('renders the operator system name and logo once status resolves', async () => {
    get.mockResolvedValue({
      data: { success: true, data: { system_name: 'Models.one', logo: 'https://cdn.example.com/logo.png' } },
    })
    const { container } = await renderAuthLayout()

    expect(await screen.findByText('Models.one')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/logo.png')
  })

  it('keeps the home link readable when the server sends no system name', async () => {
    get.mockResolvedValue({ data: { success: true, data: { system_name: '', logo: '' } } })
    const { container } = await renderAuthLayout()

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument()
    })
    expect(container.querySelector('img')).toBeNull()
  })
})
