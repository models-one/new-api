// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

const { UserAnalyticsPage } = await import('@/features/dashboard-analytics/UserAnalyticsPage')
const { ADMIN_ROLE } = await import('@/features/dashboard-analytics/access')

const statusFixture = { quota_per_unit: 500_000, enable_data_export: true }
const adminUser = { id: 11, role: 10, username: 'ua_admin_1' }
const plainUser = { id: 2, role: 1, username: 'member' }

const HOUR = 3600
const hourBucket = Math.floor((Math.floor(Date.now() / 1000) - HOUR) / HOUR) * HOUR

/**
 * `/api/data/users` fills username, created_at and the measures; user_id and
 * model_name come back zero and empty, which these fixtures keep.
 */
function userRow(username: string, quota: number, tokens: number, requests: number) {
  return {
    id: 0,
    user_id: 0,
    username,
    model_name: '',
    created_at: hourBucket,
    use_group: '',
    token_id: 0,
    channel_id: 0,
    node_name: '',
    token_used: tokens,
    count: requests,
    quota,
  }
}

/** `/api/data/` fills model_name and leaves username empty. */
function modelRow(model: string, quota: number) {
  return { ...userRow('', quota, 10, 1), model_name: model }
}

type ServerState = {
  user: typeof adminUser
  users: ReturnType<typeof userRow>[]
  models: ReturnType<typeof modelRow>[]
  usersFail: boolean
  modelsFail: boolean
  selfFails: boolean
}

let server: ServerState
let requestedUrls: string[]

function envelope(data: unknown) {
  return Promise.resolve({ data: { success: true, message: '', data } })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<UserAnalyticsPage />, { wrapper })
}

beforeEach(() => {
  requestedUrls = []
  server = {
    models: [modelRow('gpt-4o', 800_000), modelRow('deepseek-chat', 200_000)],
    modelsFail: false,
    selfFails: false,
    user: adminUser,
    users: [
      userRow('root', 2_500_000, 900_000, 400),
      userRow('member', 500_000, 100_000, 50),
    ],
    usersFail: false,
  }
  get.mockReset()

  get.mockImplementation((url: string) => {
    requestedUrls.push(url)
    if (url === '/api/status') return envelope(statusFixture)
    if (url === '/api/user/self') {
      if (server.selfFails) return Promise.reject(new Error('self is unavailable'))
      return envelope(server.user)
    }
    if (url === '/api/data/users') {
      if (server.usersFail) return Promise.reject(new Error('the user data endpoint is unavailable'))
      return envelope(server.users)
    }
    if (url === '/api/data/') {
      if (server.modelsFail) return Promise.reject(new Error('the model data endpoint is unavailable'))
      return envelope(server.models)
    }
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

async function userTable() {
  return within(await screen.findByRole('table', { name: 'Consumption by user' }))
}

describe('the administrator guard', () => {
  it('gates on RoleAdminUser, the floor AdminAuth enforces, not on root', () => {
    expect(ADMIN_ROLE).toBe(10)
  })

  it('refuses a non-admin with a denial and calls no data endpoint', async () => {
    server.user = plainUser
    renderPage()

    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(requestedUrls).not.toContain('/api/data/users')
    expect(requestedUrls).not.toContain('/api/data/')
  })

  it('admits a role 10 administrator', async () => {
    renderPage()

    expect(await screen.findByRole('table', { name: 'Consumption by user' })).toBeInTheDocument()
    expect(screen.queryByText('Administrator access required')).not.toBeInTheDocument()
  })

  it('separates a failed role lookup from a genuine denial', async () => {
    server.selfFails = true
    renderPage()

    expect(await screen.findByText('Could not confirm your permissions')).toBeInTheDocument()
    expect(screen.queryByText('Administrator access required')).not.toBeInTheDocument()
  })
})

describe('the ranking', () => {
  it('sums the hourly rows per user and converts with quota_per_unit', async () => {
    renderPage()

    const table = await userTable()
    const row = within((await table.findByText('root')).closest('tr') as HTMLElement)
    // 2_500_000 quota over a 500_000 divisor is $5.00; share is 5/6 of the total.
    expect(row.getByText('$5.00')).toBeInTheDocument()
    expect(row.getByText('83.3%')).toBeInTheDocument()
  })

  it('honours the Top-N selector', async () => {
    // Six users, because the selector is only offered when a cut can change what is
    // charted — the fixture used to hold two, where every option showed the same rows.
    server.users = Array.from({ length: 6 }, (_, index) =>
      userRow(`user-${index}`, 600_000 - index * 1000, 900_000, 400),
    )
    renderPage()
    await userTable()

    expect(await screen.findByText('Showing 6 of 6 users that recorded traffic in this range.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Users shown'), { target: { value: '5' } })

    expect(await screen.findByText('Showing 5 of 6 users that recorded traffic in this range.')).toBeInTheDocument()
    const rankChart = await screen.findByRole('img', { name: 'Spend by user' })
    expect(within(rankChart).queryByText('user-5')).not.toBeInTheDocument()
  })

  it('drops the Top-N selector when no cut could change what is charted', async () => {
    // Two users: "Top 5", "Top 10" and "Top 50" all draw the same two bars.
    renderPage()
    await userTable()

    expect(await screen.findByRole('img', { name: 'Spend by user' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Users shown')).not.toBeInTheDocument()
  })

  it('states a single user as a figure instead of drawing a one-bar chart', async () => {
    server.users = [userRow('root', 2_500_000, 900_000, 400)]
    renderPage()
    await userTable()

    // The same $5.00 is in the table, the phone cards and the figure, so this only
    // waits for the panels to settle; the point of the test is the two absences.
    await waitFor(() => expect(screen.getAllByText('$5.00').length).toBeGreaterThan(0))
    expect(screen.queryByRole('img', { name: 'Spend by user' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Users shown')).not.toBeInTheDocument()
  })

  it('reorders when the measure changes rather than relabelling a spend ranking', async () => {
    // `chatty` spends less but burns more tokens than `root`.
    server.users = [userRow('root', 2_500_000, 10, 1), userRow('chatty', 100, 9_000_000, 900)]
    renderPage()

    const rankChart = await screen.findByRole('img', { name: 'Spend by user' })
    expect(within(rankChart).queryByText('chatty')).not.toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('group', { name: 'Ranking measure' })).getByRole('button', { name: 'Tokens' }))

    expect(await screen.findByRole('img', { name: 'Tokens by user' })).toBeInTheDocument()
  })
})

describe('empty and error states', () => {
  it('shows a real empty state, which is what the seeded instance produces', async () => {
    server.users = []
    server.models = []
    renderPage()

    expect(await screen.findByText('Nothing to rank')).toBeInTheDocument()
    expect(await screen.findByText('No model traffic')).toBeInTheDocument()
    // The desktop table and the mobile card list are both in the DOM under happy-dom and
    // each renders its own empty state, which now sits beside the table rather than in it.
    expect(await screen.findAllByText('No user activity')).not.toHaveLength(0)
  })

  it('reports a failed user query with a retry and hides the panels', async () => {
    server.usersFail = true
    renderPage()

    expect(await screen.findByText('User consumption could not be loaded')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Consumption by user' })).not.toBeInTheDocument()
  })

  it('keeps the user panels alive when only the platform model mix fails', async () => {
    server.modelsFail = true
    renderPage()

    expect(await screen.findByText('The platform model mix could not be loaded')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Consumption by user' })).toBeInTheDocument()
  })
})

describe('what the endpoints do not report', () => {
  it('never claims a per-user model split, because the platform totals carry no username', async () => {
    renderPage()

    // The wording changed with the copy pass: the caption says what the reader can and
    // cannot conclude, without naming the endpoint it came from.
    expect(
      await screen.findByText(
        'Every user together. These platform totals carry no usernames, so they cannot be split per user.',
      ),
    ).toBeInTheDocument()
  })
})
