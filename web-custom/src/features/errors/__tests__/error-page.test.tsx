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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NotFoundPage } from '@/components/system/NotFoundPage'
import { RouteErrorPage } from '@/components/system/RouteErrorPage'
import { ErrorPage } from '@/features/errors/ErrorPage'
import {
  ErrorSlugView,
  ForbiddenPage,
  MaintenancePage,
  NotFoundErrorPage,
  ServerErrorPage,
  UnauthorizedPage,
} from '@/features/errors/ErrorRoutes'
import { AuthenticationUnavailableError } from '@/lib/auth-session'

afterEach(cleanup)

/**
 * Mounts a component at `/somewhere` behind a real router, so the history-back control and
 * the `Link` home both have the context they need.
 */
async function renderAtRoute(node: ReactNode) {
  const rootRoute = createRootRoute()
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Landing page</div>,
  })
  const hostRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/somewhere',
    component: () => node,
  })
  const history = createMemoryHistory({ initialEntries: ['/', '/somewhere'] })
  const router = createRouter({
    history,
    routeTree: rootRoute.addChildren([homeRoute, hostRoute]),
  })

  await router.load()
  render(<RouterProvider router={router} />)
  return { history, router }
}

describe('ErrorPage surfaces', () => {
  it.each([
    ['401', <UnauthorizedPage key="401" />, 'Unauthorized access'],
    ['403', <ForbiddenPage key="403" />, 'Access forbidden'],
    ['404', <NotFoundErrorPage key="404" />, 'Page not found'],
    ['500', <ServerErrorPage key="500" />, 'Something went wrong'],
    ['503', <MaintenancePage key="503" />, 'Service unavailable'],
  ])('renders the %s numeral, heading and both actions', async (code, node, title) => {
    await renderAtRoute(node)

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByText(code)).toBeInTheDocument()
    expect(screen.getByRole('main', { name: title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })

  it('sends the history-back action one entry back', async () => {
    const { history } = await renderAtRoute(<NotFoundErrorPage />)
    expect(history.location.pathname).toBe('/somewhere')

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))

    expect(history.location.pathname).toBe('/')
  })

  it('marks the decorative icon aria-hidden so it is not announced', async () => {
    await renderAtRoute(<MaintenancePage />)

    const main = screen.getByRole('main', { name: 'Service unavailable' })
    expect(main.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('ErrorPage status digging', () => {
  it('shows the thrown response status instead of a flat 500', async () => {
    await renderAtRoute(<ErrorPage error={{ response: { status: 502 } }} variant="500" />)

    expect(screen.getByText('502')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
  })

  it('swaps to rate-limit copy on a 429', async () => {
    await renderAtRoute(<ErrorPage error={{ response: { status: 429 } }} variant="500" />)

    expect(screen.getByText('429')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Too many requests' })).toBeInTheDocument()
    expect(screen.getByText('Please wait a moment before trying again.')).toBeInTheDocument()
  })

  it('falls back to 500 when the error carries no response status', async () => {
    await renderAtRoute(<ErrorPage error={new Error('boom')} variant="500" />)

    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('ignores a response status on the other four surfaces', async () => {
    await renderAtRoute(<ErrorPage error={{ response: { status: 429 } }} variant="403" />)

    expect(screen.getByText('403')).toBeInTheDocument()
    expect(screen.queryByText('429')).not.toBeInTheDocument()
  })
})

describe('ErrorSlugView', () => {
  it.each([
    ['unauthorized', '401', 'Unauthorized access'],
    ['forbidden', '403', 'Access forbidden'],
    ['not-found', '404', 'Page not found'],
    ['internal-server-error', '500', 'Something went wrong'],
    ['maintenance-error', '503', 'Service unavailable'],
  ])('renders the %s slug as the %s surface', async (slug, code, title) => {
    await renderAtRoute(<ErrorSlugView slug={slug} />)

    expect(screen.getByText(code)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it('renders the 404 surface for a slug it does not know', async () => {
    await renderAtRoute(<ErrorSlugView slug="teapot" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('router not-found and error components', () => {
  it('gives NotFoundPage the shared 404 surface with both actions', async () => {
    await renderAtRoute(<NotFoundPage />)

    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })

  it('offers RouteErrorPage a retry instead of a history-back control', async () => {
    const reset = vi.fn()
    await renderAtRoute(<RouteErrorPage error={new Error('boom')} reset={reset} />)

    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument()
  })

  it('explains an unavailable authentication service without inventing a status', async () => {
    await renderAtRoute(
      <RouteErrorPage error={new AuthenticationUnavailableError()} reset={() => undefined} />,
    )

    expect(screen.getByText('500')).toBeInTheDocument()
    expect(
      screen.getByText('Authentication service is temporarily unavailable.'),
    ).toBeInTheDocument()
  })

  it('surfaces the underlying status when a route request is rate limited', async () => {
    await renderAtRoute(
      <RouteErrorPage
        error={Object.assign(new Error('rate limited'), { response: { status: 429 } })}
        reset={() => undefined}
      />,
    )

    expect(screen.getByText('429')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Too many requests' })).toBeInTheDocument()
  })
})
