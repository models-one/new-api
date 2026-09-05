// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LogStatsStrip } from '@/features/logs/components/LogStatsStrip'
import type { LogScope } from '@/features/logs/api'
import { getJson } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  getJson: vi.fn(async () => ({ quota: 1_000_000, rpm: 12, tpm: 3400 })),
}))

vi.mock('@/hooks/use-server-status', () => ({
  useQuotaPerUnit: () => 500_000,
}))

const mockedGetJson = vi.mocked(getJson)

afterEach(cleanup)

async function renderStrip(scope?: LogScope) {
  mockedGetJson.mockClear()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <LogStatsStrip filters={{}} scope={scope} />
    </QueryClientProvider>,
  )
  await screen.findByText('$2.00')
}

describe('LogStatsStrip', () => {
  it('converts the spend with quota_per_unit rather than showing the raw quota', async () => {
    await renderStrip()

    // 1,000,000 quota over a divisor of 500,000.
    expect(screen.getByText('$2.00')).toBeInTheDocument()
    expect(screen.queryByText('1000000')).not.toBeInTheDocument()
  })

  it('captions rpm and tpm as a live rate, because the server ignores the time filters for them', async () => {
    await renderStrip()

    // model/log.go pins these to the last 60 seconds regardless of start/end_timestamp,
    // so presenting them as a total for the filtered window would be wrong.
    expect(
      screen.getAllByText('Live rate over the last 60 seconds, not a total for this view.'),
    ).toHaveLength(2)
  })

  it('says the spend figure does follow the filters, since that one actually does', async () => {
    await renderStrip()

    expect(screen.getByText('Matches the filters above.')).toBeInTheDocument()
  })

  it('names the region so the totals are reachable as a group', async () => {
    await renderStrip()

    expect(screen.getByRole('region', { name: 'Log totals' })).toBeInTheDocument()
  })

  it('also says the spend total ignores the type filter, because SumUsedQuota pins type=2', async () => {
    await renderStrip()

    expect(
      screen.getByText(
        'Usage rows only — the server pins type=2 for this total and ignores the type filter.',
      ),
    ).toBeInTheDocument()
  })

  it('reads the self stat route by default', async () => {
    await renderStrip()

    expect(mockedGetJson).toHaveBeenCalledWith('/api/log/self/stat', { params: {} })
  })

  it('reads the admin stat route in the everyone scope and says whose spend it is', async () => {
    await renderStrip('everyone')

    expect(mockedGetJson).toHaveBeenCalledWith('/api/log/stat', { params: {} })
    expect(screen.getByText('Spend in this view (all users)')).toBeInTheDocument()
  })
})
