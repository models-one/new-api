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

const { ResetPasswordPage } = await import('@/features/auth/password-reset/ResetPasswordPage')
const { readResetPasswordSearch } = await import(
  '@/features/auth/password-reset/ResetPasswordRoute'
)

async function renderPage(search: { email?: string, token?: string }) {
  const rootRoute = createRootRoute()
  const resetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/user/reset',
    component: () => <ResetPasswordPage email={search.email} token={search.token} />,
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
    history: createMemoryHistory({ initialEntries: ['/user/reset'] }),
    routeTree: rootRoute.addChildren([landingRoute, resetRoute, signInRoute]),
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

const completeLink = { email: 'ada@example.com', token: 'a'.repeat(32) }

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  // `AuthLayout` reads the brand from `/api/status`; the page itself is not config-driven.
  get.mockResolvedValue({ data: { success: true, message: '', data: {} } })
})

afterEach(cleanup)

describe('readResetPasswordSearch', () => {
  it('keeps the two string parameters and drops everything else', () => {
    expect(readResetPasswordSearch({ email: 'ada@example.com', token: 'abc', other: 1 })).toEqual({
      email: 'ada@example.com',
      token: 'abc',
    })
  })

  it('treats a missing or non-string parameter as absent', () => {
    expect(readResetPasswordSearch({ email: 42 })).toEqual({ email: undefined, token: undefined })
    expect(readResetPasswordSearch(null)).toEqual({})
  })
})

describe('ResetPasswordPage — an incomplete link', () => {
  it('explains the problem and refuses to send anything', async () => {
    await renderPage({ email: 'ada@example.com' })

    expect(screen.getByRole('alert')).toHaveTextContent(/this reset link is incomplete/i)
    expect(screen.getByRole('button', { name: 'Set a new password' })).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })
})

describe('ResetPasswordPage — confirming the reset', () => {
  it('posts the emailed token and never asks the user to choose a password', async () => {
    post.mockResolvedValue({ data: { success: true, message: '', data: 'a1b2c3d4e5f6' } })
    await renderPage(completeLink)

    // The user picks nothing here: the server generates the password.
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Set a new password' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][1]).toEqual({
      email: completeLink.email,
      token: completeLink.token,
    })
  })

  it('shows the generated password masked, and reveals it only on request', async () => {
    post.mockResolvedValue({ data: { success: true, message: '', data: 'a1b2c3d4e5f6' } })
    await renderPage(completeLink)

    fireEvent.click(screen.getByRole('button', { name: 'Set a new password' }))

    const group = await screen.findByRole('group', { name: 'New password' })
    expect(group).not.toHaveTextContent('a1b2c3d4e5f6')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(group).toHaveTextContent('a1b2c3d4e5f6')
  })

  it('offers a copy control rather than printing the secret into the prose', async () => {
    post.mockResolvedValue({ data: { success: true, message: '', data: 'a1b2c3d4e5f6' } })
    await renderPage(completeLink)

    fireEvent.click(screen.getByRole('button', { name: 'Set a new password' }))

    expect(await screen.findByRole('button', { name: 'Copy new password' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeInTheDocument()
  })

  it('keeps the confirmation available when the token is stale', async () => {
    post.mockResolvedValue({
      data: { success: false, message: 'Password reset link is invalid or has expired' },
    })
    await renderPage(completeLink)

    fireEvent.click(screen.getByRole('button', { name: 'Set a new password' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('group', { name: 'New password' })).not.toBeInTheDocument()
    // The retry lock is running, so the control stays visible but disabled.
    expect(await screen.findByRole('button', { name: /try again in \d+s/i })).toBeDisabled()
  })
})
