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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Sidebar } from '@/components/layout/Sidebar'
import { api } from '@/lib/http-client'
import { useAuthStore } from '@/stores/auth-store'

const originalAdapter = api.defaults.adapter
const clients: QueryClient[] = []
afterEach(() => {
  cleanup()
  api.defaults.adapter = originalAdapter
  for (const client of clients.splice(0)) client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState({ auth: initialAuth })
})

const initialAuth = useAuthStore.getState().auth

beforeEach(() => {
  api.defaults.adapter = async (config) => ({ data: { success: true, data: useAuthStore.getState().auth.user ?? {} }, status: 200, statusText: 'OK', headers: {}, config })
  useAuthStore.setState({ auth: { ...initialAuth, user: null } })
})

/** Seeds only what the sidebar reads: the signed-in user's role. */
function signInAs(role: number) {
  useAuthStore.setState({
    auth: {
      ...useAuthStore.getState().auth,
      user: { id: 1, username: 'someone', role },
    },
  })
}

async function renderSidebar(pelicanEnabled = false) {
  const rootRoute = createRootRoute({
    component: () => <Sidebar onClose={() => undefined} open />,
  })
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => null,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    routeTree: rootRoute.addChildren([dashboardRoute]),
  })

  await router.load()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  clients.push(queryClient)
  queryClient.setQueryData(['server-status'], { pelican_enabled: pelicanEnabled })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('Sidebar administration group', () => {
  it('hides the admin-only links from a common user', async () => {
    signInAs(1)
    await renderSidebar()

    expect(screen.queryByRole('link', { name: 'Redemption codes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Subscription plans' })).not.toBeInTheDocument()
    // The group heading goes with them rather than sitting above nothing.
    expect(screen.queryByText('Administration')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage tests' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Pelican tests' })).not.toBeInTheDocument()
  })

  it('shows them at common.RoleAdminUser, not only to the root account', async () => {
    signInAs(10)
    await renderSidebar()

    expect(screen.getByRole('link', { name: 'Redemption codes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Subscription plans' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage tests' })).toHaveAttribute('href', '/pelican-management')
  })

  it('keeps everyone out of the admin group while the role is still unknown', async () => {
    await renderSidebar()

    expect(screen.queryByRole('link', { name: 'Redemption codes' })).not.toBeInTheDocument()
  })

  it('offers the account centre and enabled Pelican gallery to signed-in users', async () => {
    signInAs(1)
    await renderSidebar(true)

    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/profile')
    expect(screen.getByRole('link', { name: 'Pelican tests' })).toHaveAttribute('href', '/pelican')
  })
})
