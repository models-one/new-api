// @vitest-environment jsdom

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

import type * as ApiClientModule from '@/lib/api/client'

const mocks = vi.hoisted(() => ({ getJson: vi.fn(), postJson: vi.fn() }))

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClientModule>()),
  getJson: mocks.getJson,
  postJson: mocks.postJson,
}))

const { SetupPage } = await import('@/features/setup/SetupPage')

type SetupStatusShape = { status: boolean; root_init: boolean; database_type: string }

function respond(status: SetupStatusShape | Promise<never>) {
  mocks.getJson.mockImplementation((url: string) => {
    if (url === '/api/setup') {
      return status instanceof Promise ? status : Promise.resolve(status)
    }
    return Promise.reject(new Error(`unexpected request: ${url}`))
  })
}

async function renderSetup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } })
  const rootRoute = createRootRoute()
  const homeRoute = createRoute({
    component: () => <div data-testid="home" />,
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const setupRoute = createRoute({
    component: SetupPage,
    getParentRoute: () => rootRoute,
    path: '/setup',
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/setup'] }),
    routeTree: rootRoute.addChildren([homeRoute, setupRoute]),
  })

  await router.load()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { currentPath: () => router.state.location.pathname }
}

/** Walks the wizard from the database step to the administrator step. */
async function openAdminStep() {
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
}

const uninitialized: SetupStatusShape = {
  database_type: 'sqlite',
  root_init: false,
  status: false,
}

beforeEach(() => {
  mocks.getJson.mockReset()
  mocks.postJson.mockReset()
})

afterEach(cleanup)

describe('SetupPage guard', () => {
  it('leaves the installer as soon as the server reports it is initialized', async () => {
    // This is what the live server answers today: status true, and the other
    // fields are the handler's zero values because it returns early.
    respond({ database_type: '', root_init: false, status: true })
    const { currentPath } = await renderSetup()

    await waitFor(() => expect(currentPath()).toBe('/'))
    expect(screen.getByTestId('home')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
  })

  it('does not bounce the operator away when the status request fails', async () => {
    respond(Promise.reject(new Error('connection refused')))
    const { currentPath } = await renderSetup()

    expect(await screen.findByText('Installation status could not be read.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(currentPath()).toBe('/setup')
  })
})

describe('SetupPage wizard', () => {
  it('reports the database the server is actually running on', async () => {
    respond(uninitialized)
    await renderSetup()

    expect(await screen.findByText('SQLite')).toBeInTheDocument()
    expect(screen.getByText('Make sure the SQLite file is persisted')).toBeInTheDocument()
  })

  it('says nothing about a driver the server did not report', async () => {
    respond({ ...uninitialized, database_type: '' })
    await renderSetup()

    expect(await screen.findByText('The server did not report a database driver.')).toBeInTheDocument()
    expect(screen.queryByText('Make sure the SQLite file is persisted')).not.toBeInTheDocument()
  })

  it('will not advance past an empty administrator username', async () => {
    respond(uninitialized)
    await renderSetup()
    await openAdminStep()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(
      await screen.findByText('Enter a username for the administrator account.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Administrator username/ })).toBeInTheDocument()
  })

  it('enforces the password rules the server enforces', async () => {
    respond(uninitialized)
    await renderSetup()
    await openAdminStep()

    fireEvent.change(await screen.findByRole('textbox', { name: /Administrator username/ }), {
      target: { value: 'root' },
    })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'different1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument()
  })

  it('rejects a username the server would refuse for length', async () => {
    respond(uninitialized)
    await renderSetup()
    await openAdminStep()

    fireEvent.change(await screen.findByRole('textbox', { name: /Administrator username/ }), {
      target: { value: 'a'.repeat(13) },
    })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Use at most 12 characters.')).toBeInTheDocument()
  })

  it('posts exactly the body controller.PostSetup expects', async () => {
    respond(uninitialized)
    mocks.postJson.mockResolvedValue(null)
    const { currentPath } = await renderSetup()
    await openAdminStep()

    fireEvent.change(await screen.findByRole('textbox', { name: /Administrator username/ }), {
      target: { value: 'root' },
    })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    fireEvent.click(await screen.findByRole('radio', { name: /Personal use/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Initialize this deployment' }))

    await waitFor(() => {
      expect(mocks.postJson).toHaveBeenCalledWith(
        '/api/setup',
        {
          DemoSiteEnabled: false,
          SelfUseModeEnabled: true,
          confirmPassword: 'longenough1',
          password: 'longenough1',
          username: 'root',
        },
        { skipBusinessError: true },
      )
    })
    await waitFor(() => expect(currentPath()).toBe('/'))
  })

  it('skips the credential fields when a root user already exists', async () => {
    respond({ ...uninitialized, root_init: true })
    mocks.postJson.mockResolvedValue(null)
    await renderSetup()
    await openAdminStep()

    expect(
      await screen.findByText('An administrator account already exists.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Administrator username/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Initialize this deployment' }))

    await waitFor(() => {
      expect(mocks.postJson).toHaveBeenCalledWith(
        '/api/setup',
        { DemoSiteEnabled: false, SelfUseModeEnabled: false },
        { skipBusinessError: true },
      )
    })
  })

  it('shows the server message when initialization is refused', async () => {
    respond({ ...uninitialized, root_init: true })
    mocks.postJson.mockRejectedValue(new Error('系统已经初始化完成'))
    await renderSetup()

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Initialize this deployment' }))

    expect(await screen.findByText('Initialization failed.')).toBeInTheDocument()
    expect(screen.getByText('系统已经初始化完成')).toBeInTheDocument()
  })
})
