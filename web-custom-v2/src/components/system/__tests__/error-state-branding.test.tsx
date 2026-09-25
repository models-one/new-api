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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('@/lib/http-client', () => ({ api: { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

const { ErrorState } = await import('@/components/system/ErrorState')
const { queryClient } = await import('@/lib/query-client')

afterEach(cleanup)

beforeEach(() => {
  get.mockReset()
  queryClient.clear()
})

async function renderErrorState() {
  const rootRoute = createRootRoute()
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const hostRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/somewhere',
    component: () => <ErrorState code="404" label="Page not found" title="Page not found" />,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/somewhere'] }),
    routeTree: rootRoute.addChildren([homeRoute, hostRoute]),
  })

  await router.load()
  render(<RouterProvider router={router} />)
}

describe('the status pages carry the deployment brand', () => {
  /**
   * The regression this pins: the lockup first read `/api/status` out of the query cache
   * without ever asking for it. Somebody who lands straight on a 404 has fetched nothing,
   * so the brand never appeared — on exactly the page the lockup was added for.
   */
  it('fetches the brand rather than waiting for something else to have cached it', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: { logo: 'https://example.test/mark.png', system_name: 'Probe Gateway' },
      },
    })

    await renderErrorState()

    expect(await screen.findByText('Probe Gateway')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/status', undefined)
  })

  /** An error page must never be the thing that throws. */
  it('still renders when the status request fails', async () => {
    get.mockRejectedValue(new Error('status is unavailable'))

    await renderErrorState()

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
  })
})
