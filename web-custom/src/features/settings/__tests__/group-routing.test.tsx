// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsPage } from '@/features/settings/SettingsPage'
import { getJson, postJson, putJson } from '@/lib/api/client'
import type { ApiToken } from '@/lib/api/tokens'

/** Replaces the whole envelope-unwrapping layer; every module under test reads these. */
vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  getRawJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
}))

const mockedGetJson = vi.mocked(getJson)
const mockedPostJson = vi.mocked(postJson)
const mockedPutJson = vi.mocked(putJson)

/** Field-for-field the shape a live `GET /api/token/` returns on the seeded dev server. */
function buildToken(overrides: Partial<ApiToken> = {}): ApiToken {
  return {
    id: 1,
    user_id: 1,
    key: 'VGjC**********8k3k',
    status: 1,
    name: 'Production Router',
    created_time: 1787983215,
    accessed_time: 1787983215,
    expired_time: -1,
    remain_quota: 500000,
    unlimited_quota: true,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    used_quota: 0,
    group: 'auto',
    auto_groups: 'default,vip',
    cross_group_retry: false,
    ...overrides,
  }
}

/** Captured verbatim from `GET /api/user/self/groups`. */
const groupsFixture = {
  default: { desc: '默认分组', ratio: 1 },
  vip: { desc: 'vip分组', ratio: 1 },
}

let listCalls: Record<string, unknown>[] = []
let searchCalls: Record<string, unknown>[] = []

function respondWith(tokens: ApiToken[]) {
  mockedGetJson.mockImplementation(async (url, config) => {
    const params = (config?.params ?? {}) as Record<string, unknown>
    if (url === '/api/status') return { quota_per_unit: 500_000 }
    if (url === '/api/user/self/groups') return groupsFixture
    if (url === '/api/token/') {
      listCalls.push(params)
      return { page: 1, page_size: 10, total: tokens.length, items: tokens }
    }
    if (url === '/api/token/search') {
      searchCalls.push(params)
      const keyword = String(params.keyword ?? '').replaceAll('%', '')
      const matched = tokens.filter((token) => token.name.includes(keyword))
      return { page: 1, page_size: 10, total: matched.length, items: matched }
    }
    throw new Error(`unmocked GET ${url}`)
  })
}

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<SettingsPage />, { wrapper })
}

beforeEach(() => {
  listCalls = []
  searchCalls = []
  mockedGetJson.mockReset()
  mockedPostJson.mockReset()
  mockedPostJson.mockResolvedValue({})
  mockedPutJson.mockReset()
  mockedPutJson.mockResolvedValue({})
  respondWith([
    buildToken(),
    buildToken({ id: 2, name: 'Cost Optimized', group: 'vip', auto_groups: '', status: 2 }),
    buildToken({ id: 3, name: 'Developer Sandbox', group: '', auto_groups: '' }),
  ])
})

afterEach(cleanup)

describe('SettingsPage group routing', () => {
  it('shows every group a key routes through, from group and auto_groups', async () => {
    renderSettings()

    const routerCard = (await screen.findByRole('heading', { name: 'Production Router' })).closest('article')
    expect(routerCard).not.toBeNull()
    expect(within(routerCard as HTMLElement).getAllByText('default').length).toBeGreaterThan(0)
    expect(within(routerCard as HTMLElement).getAllByText('vip').length).toBeGreaterThan(0)

    // `group` is a plain name here, so the key routes through exactly that one group.
    const costCard = screen.getByRole('heading', { name: 'Cost Optimized' }).closest('article')
    expect(within(costCard as HTMLElement).getAllByText('vip').length).toBeGreaterThan(0)
    expect(within(costCard as HTMLElement).queryByText('default')).not.toBeInTheDocument()

    // An empty `group` inherits the account group; nothing is invented for it.
    const sandboxCard = screen.getByRole('heading', { name: 'Developer Sandbox' }).closest('article')
    expect(within(sandboxCard as HTMLElement).getByText('Account default group')).toBeVisible()
  })

  it('filters by status client-side because the list endpoint takes no status parameter', async () => {
    renderSettings()
    await screen.findByRole('heading', { name: 'Production Router' })

    const filters = screen.getByRole('group', { name: 'Filter by status' })
    fireEvent.click(within(filters).getByRole('button', { name: /Disabled/ }))

    expect(screen.getByRole('heading', { name: 'Cost Optimized' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Production Router' })).not.toBeInTheDocument()
    // No extra round trip: the filter runs over the page that was already fetched.
    expect(listCalls).toHaveLength(1)
  })

  it('searches key names with a wildcard the server will actually match', async () => {
    renderSettings()
    await screen.findByRole('heading', { name: 'Production Router' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search key name' }), {
      target: { value: 'Optimized' },
    })

    await waitFor(() => expect(searchCalls).toHaveLength(1))
    expect(searchCalls[0].keyword).toBe('%Optimized%')
    expect(await screen.findByRole('heading', { name: 'Cost Optimized' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Production Router' })).not.toBeInTheDocument()
  })

  it('expands and collapses every key from the shared control', async () => {
    renderSettings()
    await screen.findByRole('heading', { name: 'Production Router' })

    expect(screen.queryByRole('heading', { name: 'Group priority' })).not.toBeInTheDocument()

    const routerCard = screen.getByRole('heading', { name: 'Production Router' }).closest('article')
    const trigger = within(routerCard as HTMLElement).getByRole('button', { name: 'Expand key details' })
    expect(trigger).toHaveAttribute('title', 'Expand key details')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Expand all keys' }))
    expect(screen.getAllByRole('heading', { name: 'Group priority' })).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all keys' }))
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Group priority' })).not.toBeInTheDocument()
    })
  })

  it('creates a multi-group key through the auto sentinel the relay requires', async () => {
    renderSettings()
    await screen.findByRole('heading', { name: 'Production Router' })

    fireEvent.click(screen.getByRole('button', { name: 'New API key' }))
    const dialog = screen.getByRole('dialog', { name: 'New API key' })
    const createButton = within(dialog).getByRole('button', { name: 'Create key' })
    expect(createButton).toBeDisabled()

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Key name' }), {
      target: { value: 'Realtime Gateway' },
    })
    expect(createButton).toBeEnabled()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'default x1' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'vip x1' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Cross-group retry' }))
    fireEvent.click(createButton)

    await waitFor(() => expect(mockedPostJson).toHaveBeenCalledTimes(1))
    expect(mockedPostJson).toHaveBeenCalledWith('/api/token/', expect.objectContaining({
      auto_groups: 'default,vip',
      cross_group_retry: true,
      group: 'auto',
      name: 'Realtime Gateway',
      unlimited_quota: true,
    }))
  })

  it('stores a single group as the key group and drops the auto-only retry flag', async () => {
    renderSettings()
    await screen.findByRole('heading', { name: 'Production Router' })

    fireEvent.click(screen.getByRole('button', { name: 'New API key' }))
    const dialog = screen.getByRole('dialog', { name: 'New API key' })

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Key name' }), {
      target: { value: 'Single Group' },
    })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'vip x1' }))
    expect(within(dialog).getByRole('checkbox', { name: 'Cross-group retry' })).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))

    await waitFor(() => expect(mockedPostJson).toHaveBeenCalledTimes(1))
    expect(mockedPostJson).toHaveBeenCalledWith('/api/token/', expect.objectContaining({
      auto_groups: '',
      cross_group_retry: false,
      group: 'vip',
    }))
  })

  it('converts a quota entered in currency with the divisor from /api/status', async () => {
    renderSettings()
    await screen.findByRole('heading', { name: 'Production Router' })

    const routerCard = screen.getByRole('heading', { name: 'Production Router' }).closest('article')
    fireEvent.click(within(routerCard as HTMLElement).getByRole('button', { name: 'Edit key' }))

    const dialog = screen.getByRole('dialog', { name: 'Edit API key' })
    expect(within(dialog).getByRole('textbox', { name: 'Key name' })).toHaveValue('Production Router')

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Unlimited quota' }))
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Remaining quota' }), {
      target: { value: '2.5' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update key' }))

    await waitFor(() => expect(mockedPutJson).toHaveBeenCalledTimes(1))
    // 2.5 * quota_per_unit (500000) — the divisor is never hardcoded in the page.
    expect(mockedPutJson).toHaveBeenCalledWith('/api/token/', expect.objectContaining({
      id: 1,
      remain_quota: 1_250_000,
      unlimited_quota: false,
    }))
  })

  it('shows a retryable error instead of an empty list when the fetch fails', async () => {
    mockedGetJson.mockImplementation(async (url) => {
      if (url === '/api/status') return { quota_per_unit: 500_000 }
      if (url === '/api/user/self/groups') return groupsFixture
      throw new Error('token list is unavailable')
    })
    renderSettings()

    expect(await screen.findByText('token list is unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('No API keys match these filters.')).not.toBeInTheDocument()
  })
})
