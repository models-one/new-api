// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useSearch,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { validateResetSearch } from '@/features/auth/password-reset/route-guard'
import { passThroughSearch, skipSignUpWhenAuthenticated } from '@/features/auth/sign-up/route-guard'
import { useAuthStore } from '@/stores/auth-store'

import type { AuthBundle } from '@/features/auth/types'

const signedInBundle: AuthBundle = {
  access_token: 'access-token',
  token_type: 'Bearer',
  access_expires_at: 1788013987,
  user: { id: 1, username: 'root', role: 100 },
  session: {
    sid: 'session-id',
    current: true,
    login_method: 'password',
    ip: '127.0.0.1',
    user_agent: 'vitest',
    created_at: 1788013087,
    last_active_at: 1788013087,
    expires_at: 1788099487,
  },
}

/**
 * The real guards, wired into the same route shapes `src/routes.tsx` uses. The components
 * are stubs on purpose: what is under test is where a visitor ends up and what survives
 * the trip, not what the sign-up form renders.
 */
function renderAt(initialEntry: string) {
  const rootRoute = createRootRoute()

  const signUpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-up',
    validateSearch: passThroughSearch,
    beforeLoad: skipSignUpWhenAuthenticated,
    component: () => <div>sign-up page</div>,
  })

  const registerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/register',
    validateSearch: passThroughSearch,
    beforeLoad: ({ search }) => {
      throw redirect({ replace: true, search, to: '/sign-up' })
    },
  })

  const resetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/user/reset',
    validateSearch: validateResetSearch,
    component: function ResetProbe() {
      const search = useSearch({ from: '/user/reset' })
      return <div data-testid="reset-search">{JSON.stringify(search)}</div>
    },
  })

  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => <div>dashboard</div>,
  })

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: rootRoute.addChildren([signUpRoute, registerRoute, resetRoute, dashboardRoute]),
  })

  return { render: () => render(<RouterProvider router={router} />), router }
}

async function loadAt(initialEntry: string) {
  const harness = renderAt(initialEntry)
  await harness.router.load()
  harness.render()
  return harness.router
}

afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset('idle')
})

describe('/register', () => {
  it('forwards the referral code to /sign-up instead of dropping it', async () => {
    const router = await loadAt('/register?aff=invite-9')

    expect(await screen.findByText('sign-up page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-up')
    expect(router.state.location.search).toEqual({ aff: 'invite-9' })
  })

  it('preserves every other parameter alongside the referral code', async () => {
    const router = await loadAt('/register?aff=invite-9&utm_source=newsletter')

    expect(router.state.location.pathname).toBe('/sign-up')
    expect(router.state.location.search).toEqual({
      aff: 'invite-9',
      utm_source: 'newsletter',
    })
  })

  it('still redirects when the visitor arrived without any parameters', async () => {
    const router = await loadAt('/register')

    expect(await screen.findByText('sign-up page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-up')
    expect(router.state.location.search).toEqual({})
  })

  it('replaces the history entry so Back does not bounce off the redirect', async () => {
    const router = await loadAt('/register?aff=invite-9')

    expect(router.history.length).toBe(1)
  })
})

describe('/sign-up authentication guard', () => {
  it('renders the page for an anonymous visitor', async () => {
    const router = await loadAt('/sign-up')

    expect(await screen.findByText('sign-up page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-up')
  })

  it('sends a visitor who already holds a session to the dashboard', async () => {
    useAuthStore.getState().auth.setBundle(signedInBundle)
    const router = await loadAt('/sign-up')

    expect(await screen.findByText('dashboard')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
  })
})

describe('reset link search', () => {
  it('carries the address and token from the emailed link', async () => {
    await loadAt('/user/reset?email=user%40example.com&token=abc123')

    expect(JSON.parse(screen.getByTestId('reset-search').textContent ?? '')).toEqual({
      email: 'user@example.com',
      token: 'abc123',
    })
  })

  it('renders rather than throwing when the link is missing its token', async () => {
    await loadAt('/user/reset?email=user%40example.com')

    expect(JSON.parse(screen.getByTestId('reset-search').textContent ?? '')).toEqual({
      email: 'user@example.com',
    })
  })

  it('drops a repeated parameter that arrives as an array instead of a string', () => {
    expect(validateResetSearch({ email: ['a@example.com', 'b@example.com'], token: 'abc' }))
      .toEqual({ email: undefined, token: 'abc' })
  })

  it('ignores anything else in the query string', () => {
    expect(validateResetSearch({ email: 'user@example.com', token: 'abc', aff: 'invite-9' }))
      .toEqual({ email: 'user@example.com', token: 'abc' })
  })
})
