// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AxiosError, type AxiosResponse } from 'axios'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RankingsPage } from '@/features/rankings/RankingsPage'
import type { RankingsSnapshot } from '@/features/rankings/api'
import { getJson } from '@/lib/api/client'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; activeProps?: unknown }

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, activeProps: _activeProps, children, ...rest }: LinkProps) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  getRawJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
}))

const mockedGetJson = vi.mocked(getJson)

/**
 * The rejection axios hands back for one of the gateway's refusals. `HeaderNavModuleAuth`
 * answers 403 with `{"message":"<module> is disabled"}` and delegates a gated module to
 * `UserAuth()`, which aborts 401 with a `{"success":false,"code":"AUTH_…"}` envelope.
 */
function httpError(status: number, message: string): AxiosError {
  const response = {
    config: { headers: {} },
    data: { success: false, message },
    headers: {},
    status,
    statusText: '',
  } as unknown as AxiosResponse
  return new AxiosError(message, undefined, undefined, undefined, response)
}

/** The week snapshot the seeded backend actually returned, trimmed to three models. */
const liveSnapshot: RankingsSnapshot = {
  models: [
    {
      rank: 1,
      previous_rank: 3,
      model_name: 'gpt-4o-mini',
      vendor: 'OpenAI',
      vendor_icon: 'OpenAI',
      category: 'all',
      total_tokens: 2737699,
      share: 0.267,
      growth_pct: 24.5565,
    },
    {
      rank: 4,
      previous_rank: 1,
      model_name: 'claude-sonnet-4',
      vendor: 'Unknown',
      category: 'all',
      total_tokens: 2390384,
      share: 0.2331,
      growth_pct: 2.1791,
    },
    {
      rank: 5,
      model_name: 'orphan-model',
      vendor: 'Unknown',
      category: 'all',
      total_tokens: 555,
      share: 0.0001,
      growth_pct: 100,
    },
  ],
  vendors: [
    {
      rank: 1,
      vendor: 'Unknown',
      total_tokens: 7515330,
      share: 0.733,
      growth_pct: 19.305,
      models_count: 4,
      top_model: 'deepseek-chat',
    },
    {
      rank: 2,
      vendor: 'OpenAI',
      vendor_icon: 'OpenAI',
      total_tokens: 2737699,
      share: 0.267,
      growth_pct: 24.5565,
      models_count: 1,
      top_model: 'gpt-4o-mini',
    },
  ],
  top_movers: [
    { model_name: 'gpt-4o-mini', vendor: 'OpenAI', vendor_icon: 'OpenAI', rank_delta: 2, current_rank: 1, growth_pct: 24.5565 },
  ],
  top_droppers: [
    { model_name: 'claude-sonnet-4', vendor: 'Unknown', rank_delta: -3, current_rank: 4, growth_pct: 2.1791 },
  ],
  models_history: {
    buckets: 2,
    models: [{ name: 'gpt-4o-mini', vendor: 'OpenAI', total: 2737699 }],
    points: [
      { ts: '2026-08-22T00:00:00Z', label: 'Aug 22', model: 'gpt-4o-mini', vendor: 'OpenAI', tokens: 100031 },
      { ts: '2026-08-23T00:00:00Z', label: 'Aug 23', model: 'gpt-4o-mini', vendor: 'OpenAI', tokens: 265515 },
    ],
  },
  vendor_share_history: {
    buckets: 1,
    vendors: [{ name: 'OpenAI', total: 2737699, share: 0.267 }],
    points: [
      { ts: '2026-08-22T00:00:00Z', label: 'Aug 22', vendor: 'OpenAI', share: 1, tokens: 100031 },
    ],
  },
}

const emptySnapshot: RankingsSnapshot = {
  models: [],
  vendors: [],
  top_movers: [],
  top_droppers: [],
  models_history: { buckets: 0, models: [], points: [] },
  vendor_share_history: { buckets: 0, vendors: [], points: [] },
}

/**
 * Routes the two endpoints this page is allowed to call. Any other URL fails the test, which
 * is how the "never touches an authenticated endpoint" promise is enforced.
 */
function serve(options: {
  headerNavModules: unknown
  rankings?: RankingsSnapshot
  rankingsError?: Error
}) {
  mockedGetJson.mockImplementation((url: string) => {
    if (url === '/api/status') {
      return Promise.resolve({ HeaderNavModules: options.headerNavModules } as never)
    }
    if (url === '/api/rankings') {
      if (options.rankingsError) return Promise.reject(options.rankingsError)
      return Promise.resolve((options.rankings ?? emptySnapshot) as never)
    }
    throw new Error(`unexpected request to ${url}`)
  })
}

function renderPage(): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RankingsPage />
    </QueryClientProvider>,
  )
  return null
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RankingsPage config gate', () => {
  it('renders the leaderboard when the option is empty, the live default', async () => {
    serve({ headerNavModules: '', rankings: liveSnapshot })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model leaderboard' })).toBeInTheDocument()
    // DataTable renders a mobile card list alongside the table, so every cell appears twice.
    expect(screen.getAllByText('gpt-4o-mini').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Provider leaderboard' })).toBeInTheDocument()
    // The compact cell keeps the exact count reachable on hover, grouped rather than raw.
    expect(screen.getAllByTitle('Exactly 2,737,699 tokens').length).toBeGreaterThan(0)
  })

  it('never requests the leaderboard when the module is disabled', async () => {
    serve({ headerNavModules: JSON.stringify({ rankings: false }) })
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Rankings are not published here' }),
    ).toBeInTheDocument()
    // The endpoint could only answer 403, so the page must not ask.
    expect(mockedGetJson).not.toHaveBeenCalledWith('/api/rankings', expect.anything())
    expect(screen.queryByRole('heading', { name: 'Model leaderboard' })).not.toBeInTheDocument()
  })

  it('offers a sign-in link instead of an error when requireAuth makes the call 401', async () => {
    serve({
      headerNavModules: JSON.stringify({ rankings: { enabled: true, requireAuth: true } }),
      rankingsError: httpError(401, 'unauthorized'),
    })
    renderPage()

    // Alert renders its title as a paragraph, not a heading.
    expect(await screen.findByText('Sign in to see rankings')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('falls back to the disabled state when a 403 contradicts the status answer', async () => {
    // /api/status can be five minutes stale, so the option may have been turned off since.
    serve({
      headerNavModules: '',
      rankingsError: httpError(403, 'rankings is disabled'),
    })
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Rankings are not published here' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('reports a transport failure on a gated deployment as itself, not as a sign-in prompt', async () => {
    serve({
      headerNavModules: JSON.stringify({ rankings: { enabled: true, requireAuth: true } }),
      rankingsError: new Error('Network Error'),
    })
    renderPage()

    expect(await screen.findByText('Could not load the rankings')).toBeInTheDocument()
    expect(screen.getByText('Network Error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('Sign in to see rankings')).not.toBeInTheDocument()
  })

  it('warns a visitor up front when the module is gated but still answering', async () => {
    serve({
      headerNavModules: JSON.stringify({ rankings: { enabled: true, requireAuth: true } }),
      rankings: liveSnapshot,
    })
    renderPage()

    expect(
      await screen.findByText('This gateway publishes rankings to signed-in visitors only.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Model leaderboard' })).toBeInTheDocument()
  })
})

describe('RankingsPage states', () => {
  it('shows a retryable error when the leaderboard call fails on a public module', async () => {
    serve({ headerNavModules: '', rankingsError: new Error('rankings exploded') })
    renderPage()

    expect(await screen.findByText('Could not load the rankings')).toBeInTheDocument()
    expect(screen.getByText('rankings exploded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows a real empty state when the gateway has relayed nothing', async () => {
    serve({ headerNavModules: '', rankings: emptySnapshot })
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'No rankings for this window' }),
    ).toBeInTheDocument()
    // No leaderboard, no charts, no stat cards for a window with no data.
    expect(screen.queryByRole('heading', { name: 'Model leaderboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Traffic over time' })).not.toBeInTheDocument()
  })

  it('labels a model with no previous rank as New rather than +100%', async () => {
    serve({ headerNavModules: '', rankings: liveSnapshot })
    renderPage()

    await screen.findByRole('heading', { name: 'Model leaderboard' })
    expect(screen.getAllByText('New').length).toBeGreaterThan(0)
    expect(screen.queryByText('+100%')).not.toBeInTheDocument()
    expect(screen.getAllByText('+24.6%').length).toBeGreaterThan(0)
  })

  it('re-requests the snapshot for the period the visitor picks', async () => {
    serve({ headerNavModules: '', rankings: liveSnapshot })
    renderPage()

    await screen.findByRole('heading', { name: 'Model leaderboard' })
    expect(mockedGetJson).toHaveBeenCalledWith(
      '/api/rankings',
      expect.objectContaining({ params: { period: 'week' } }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))

    await waitFor(() => {
      expect(mockedGetJson).toHaveBeenCalledWith(
        '/api/rankings',
        expect.objectContaining({ params: { period: 'month' } }),
      )
    })
  })

  it('carries the anonymous request flags so a 401 cannot redirect a visitor away', async () => {
    serve({ headerNavModules: '', rankings: liveSnapshot })
    renderPage()

    await screen.findByRole('heading', { name: 'Model leaderboard' })
    expect(mockedGetJson).toHaveBeenCalledWith(
      '/api/rankings',
      expect.objectContaining({
        skipAuthRefresh: true,
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    )
  })

  it('renders empty mover lists rather than hiding the panels', async () => {
    serve({
      headerNavModules: '',
      // The live `year` window returns rows but no movers at all.
      rankings: { ...liveSnapshot, top_movers: [], top_droppers: [] },
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Nothing climbed' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nothing fell' })).toBeInTheDocument()
  })
})
