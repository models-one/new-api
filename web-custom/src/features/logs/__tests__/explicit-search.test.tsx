// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LogsPage } from '@/features/logs/LogsPage'

const getJson = vi.fn()

vi.mock('@/lib/api/client', () => ({
  getJson: (...args: unknown[]) => getJson(...args),
}))

vi.mock('@/hooks/use-server-status', () => ({
  useQuotaPerUnit: () => 500_000,
  useServerStatus: () => ({ data: undefined }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: { id: 1, username: 'someone', role: 1 } } }),
}))

beforeEach(() => {
  getJson.mockReset()
  getJson.mockImplementation(async (url: string) => {
    if (url.includes('/stat')) return { quota: 0, rpm: 0, tpm: 0 }
    if (url.includes('/groups')) return {}
    return { page: 1, page_size: 10, total: 0, items: [] }
  })
})

afterEach(cleanup)

function renderLogs() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <LogsPage />
    </QueryClientProvider>,
  )
}

/** Query calls carrying the given filter value, ignoring the stats and group lookups. */
function listCallsWith(value: string) {
  return getJson.mock.calls.filter(([url, config]) => {
    if (typeof url !== 'string' || url.includes('/stat') || url.includes('/groups')) return false
    const params = (config as { params?: Record<string, unknown> } | undefined)?.params ?? {}
    return Object.values(params).includes(value)
  })
}

describe('LogsPage text filters', () => {
  it('does not query while the user is still typing', async () => {
    renderLogs()
    await waitFor(() => expect(getJson).toHaveBeenCalled())

    const box = screen.getByRole('searchbox', { name: 'Request ID' })
    fireEvent.change(box, { target: { value: 'req-abc' } })

    // A per-keystroke query would scan the log table on every character; these
    // listings are expensive enough that the filter is committed deliberately.
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(listCallsWith('req-abc')).toHaveLength(0)
  })

  it('queries once the search action is taken', async () => {
    renderLogs()
    await waitFor(() => expect(getJson).toHaveBeenCalled())

    fireEvent.change(screen.getByRole('searchbox', { name: 'Request ID' }), {
      target: { value: 'req-abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(listCallsWith('req-abc').length).toBeGreaterThan(0))
  })

  it('accepts Enter as the same commit, so the keyboard path is not a dead end', async () => {
    renderLogs()
    await waitFor(() => expect(getJson).toHaveBeenCalled())

    const box = screen.getByRole('searchbox', { name: 'Request ID' })
    fireEvent.change(box, { target: { value: 'req-xyz' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    await waitFor(() => expect(listCallsWith('req-xyz').length).toBeGreaterThan(0))
  })
})
