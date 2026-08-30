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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Sidebar } from '@/components/layout/Sidebar'
import { useAuthStore } from '@/stores/auth-store'

afterEach(cleanup)

const initialAuth = useAuthStore.getState().auth

beforeEach(() => {
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

async function renderSidebar() {
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
  })

  it('shows them at common.RoleAdminUser, not only to the root account', async () => {
    signInAs(10)
    await renderSidebar()

    expect(screen.getByRole('link', { name: 'Redemption codes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Subscription plans' })).toBeInTheDocument()
  })

  it('keeps everyone out of the admin group while the role is still unknown', async () => {
    await renderSidebar()

    expect(screen.queryByRole('link', { name: 'Redemption codes' })).not.toBeInTheDocument()
  })

  it('offers the account centre to every signed-in user', async () => {
    signInAs(1)
    await renderSidebar()

    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/profile')
  })
})
