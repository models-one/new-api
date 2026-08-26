// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AppShell } from '@/components/layout/AppShell'

afterEach(cleanup)

async function renderAppShell() {
  const rootRoute = createRootRoute({ component: AppShell })
  const usageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/usage',
    component: () => <div>Usage module</div>,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/usage'] }),
    routeTree: rootRoute.addChildren([usageRoute]),
  })

  await router.load()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('AppShell', () => {
  it('renders the shared Usage navigation and header around a feature route', async () => {
    await renderAppShell()

    expect(screen.getByRole('complementary', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Resource links' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('searchbox', { name: 'Search console' })).toBeInTheDocument()
    expect(screen.getByText('Usage module')).toBeInTheDocument()
  })

  it('keeps the mobile menu expanded state aligned with the visible sidebar', async () => {
    await renderAppShell()

    const openButton = screen.getByRole('button', { name: 'Open navigation' })
    expect(openButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(openButton)
    expect(openButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getAllByRole('button', { name: 'Close navigation' })[0])
    expect(openButton).toHaveAttribute('aria-expanded', 'false')
  })
})
