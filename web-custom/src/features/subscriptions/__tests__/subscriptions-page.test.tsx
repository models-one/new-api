// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put } }))

const { SubscriptionsPage } = await import('@/features/subscriptions/SubscriptionsPage')
const { ADMIN_ROLE_THRESHOLD, isConsoleAdmin } = await import('@/features/subscriptions/admin-access')

/** Captured from the seeded dev server. */
const statusFixture = { quota_per_unit: 500_000 }
const rootUser = { id: 1, role: 100, username: 'root' }
const plainUser = { id: 2, role: 1, username: 'member' }

/** Shape of one `SubscriptionPlanDTO`, field for field. */
const starterPlan = {
  id: 3,
  title: 'Starter',
  subtitle: 'For light usage',
  price_amount: 12.5,
  currency: 'USD',
  duration_unit: 'month',
  duration_value: 1,
  custom_seconds: 0,
  enabled: true,
  sort_order: 20,
  allow_balance_pay: true,
  allow_wallet_overflow: true,
  stripe_price_id: 'price_123',
  creem_product_id: '',
  waffo_pancake_product_id: '',
  max_purchase_per_user: 0,
  upgrade_group: 'vip',
  downgrade_group: '',
  total_amount: 10_000_000,
  quota_reset_period: 'monthly',
  quota_reset_custom_seconds: 0,
  created_at: 1_787_812_853,
  updated_at: 1_787_812_853,
}

const retiredPlan = {
  ...starterPlan,
  enabled: false,
  id: 4,
  sort_order: 0,
  stripe_price_id: '',
  title: 'Legacy',
  total_amount: 0,
  upgrade_group: '',
}

type ServerState = {
  user: typeof rootUser
  plans: { plan: typeof starterPlan }[]
  complianceConfirmed: boolean
  plansFail?: boolean
}

let server: ServerState

function envelope(data: unknown) {
  return Promise.resolve({ data: { success: true, data } })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<SubscriptionsPage />, { wrapper })
}

/** The overlays share their action labels with the row buttons behind them. */
function openOverlay() {
  return screen.findByRole('dialog')
}

function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } })
}

beforeEach(() => {
  server = { complianceConfirmed: true, plans: [], user: rootUser }
  get.mockReset()
  post.mockReset()
  put.mockReset()
  get.mockImplementation((url: string) => {
    if (url === '/api/status') return envelope(statusFixture)
    if (url === '/api/user/self') return envelope(server.user)
    if (url === '/api/user/topup/info') {
      return envelope({ payment_compliance_confirmed: server.complianceConfirmed })
    }
    if (url === '/api/subscription/admin/plans') {
      if (server.plansFail) return Promise.reject(new Error('plans are unavailable'))
      return envelope(server.plans)
    }
    if (url === '/api/group/') return envelope(['default', 'vip', 'svip'])
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

describe('admin gate', () => {
  it('uses the RoleAdminUser threshold the AdminAuth middleware enforces', () => {
    expect(ADMIN_ROLE_THRESHOLD).toBe(10)
    expect(isConsoleAdmin(1)).toBe(false)
    expect(isConsoleAdmin(10)).toBe(true)
    expect(isConsoleAdmin(100)).toBe(true)
  })

  it('refuses a non-admin and never calls the admin endpoints', async () => {
    server.user = plainUser
    renderPage()

    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New plan' })).not.toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/subscription/admin/plans', expect.anything())
  })

  it('surfaces a failure to read the viewer instead of claiming they lack the role', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/api/user/self') return Promise.reject(new Error('self is unavailable'))
      if (url === '/api/status') return envelope(statusFixture)
      throw new Error(`unmocked GET ${url}`)
    })
    renderPage()

    expect(await screen.findByText('This section could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByText('Administrator access required')).not.toBeInTheDocument()
  })
})

describe('plan list', () => {
  it('renders a real empty state for an instance with no plans', async () => {
    renderPage()

    expect(await screen.findByText('No subscription plans yet')).toBeInTheDocument()
    expect(screen.getByText(/A plan describes what a subscriber pays/)).toBeInTheDocument()
    expect(screen.getByText('0 plans configured')).toBeInTheDocument()
  })

  it('shows every column a plan actually carries', async () => {
    server.plans = [{ plan: starterPlan }, { plan: retiredPlan }]
    renderPage()

    const starterRow = (await screen.findByText('Starter')).closest('tr')
    expect(starterRow).not.toBeNull()
    const starter = within(starterRow as HTMLElement)
    expect(starter.getByText('$12.50')).toBeInTheDocument()
    expect(starter.getByText('1 months')).toBeInTheDocument()
    expect(starter.getByText('Monthly')).toBeInTheDocument()
    // 10,000,000 quota units / quota_per_unit 500,000.
    expect(starter.getByText('$20.00')).toBeInTheDocument()
    expect(starter.getByText('Stripe')).toBeInTheDocument()
    expect(starter.getByText('vip')).toBeInTheDocument()
    expect(starter.getByText('Enabled')).toBeInTheDocument()

    const legacyRow = (await screen.findByText('Legacy')).closest('tr')
    const legacy = within(legacyRow as HTMLElement)
    expect(legacy.getByText('Disabled')).toBeInTheDocument()
    expect(legacy.getByText('Unlimited')).toBeInTheDocument()
    expect(legacy.getByText('Balance only')).toBeInTheDocument()
    expect(legacy.getByText('No group change')).toBeInTheDocument()
  })

  it('offers a retry when the list request fails', async () => {
    server.plansFail = true
    renderPage()

    expect(await screen.findByText('This section could not be loaded.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('payment compliance lock', () => {
  it('disables every write the backend would refuse, and leaves the reset alone', async () => {
    server.complianceConfirmed = false
    server.plans = [{ plan: starterPlan }]
    renderPage()

    expect(await screen.findByText('Plan changes are locked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New plan' })).toBeDisabled()
    expect(await screen.findByRole('button', { name: 'Edit plan' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Disable plan' })).toBeDisabled()
    // AdminResetPlanSubscriptions has no compliance check, verified against the server.
    expect(screen.getByRole('button', { name: 'Reset quota' })).toBeEnabled()
  })

  it('unlocks the writes once compliance is confirmed', async () => {
    server.plans = [{ plan: starterPlan }]
    renderPage()

    expect(await screen.findByRole('button', { name: 'Edit plan' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'New plan' })).toBeEnabled()
    expect(screen.queryByText('Plan changes are locked')).not.toBeInTheDocument()
  })
})

describe('the create drawer', () => {
  it('refuses to submit an untitled plan and says which field is wrong', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'New plan' }))
    const drawer = within(await openOverlay())
    fireEvent.click(drawer.getByRole('button', { name: 'Create plan' }))

    expect(await screen.findByText('Some fields need attention.')).toBeInTheDocument()
    expect(screen.getByText('A plan title is required.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('posts the draft with the quota converted through quota_per_unit', async () => {
    post.mockResolvedValue({ data: { success: true, data: { ...starterPlan, id: 9 } } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'New plan' }))
    const drawer = within(await openOverlay())
    type(drawer.getByLabelText(/Plan title/), 'Pro')
    type(drawer.getByLabelText(/Plan quota/), '20')
    fireEvent.click(drawer.getByRole('button', { name: 'Create plan' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const [url, body] = post.mock.calls[0] as [string, { plan: Record<string, unknown> }]
    expect(url).toBe('/api/subscription/admin/plans')
    expect(body.plan).toMatchObject({
      currency: 'USD',
      duration_unit: 'month',
      duration_value: 1,
      enabled: true,
      quota_reset_period: 'never',
      title: 'Pro',
      total_amount: 10_000_000,
    })
  })

  it('seeds the edit form from the stored row, quota converted back to currency', async () => {
    server.plans = [{ plan: starterPlan }]
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit plan' }))
    const drawer = within(await openOverlay())

    expect(drawer.getByLabelText(/Plan title/)).toHaveValue('Starter')
    expect(drawer.getByLabelText(/Price/)).toHaveValue(12.5)
    // 10,000,000 quota units back through quota_per_unit 500,000.
    expect(drawer.getByLabelText(/Plan quota/)).toHaveValue(20)
    expect(drawer.getByLabelText(/Upgrade group/)).toHaveValue('vip')
    expect(drawer.getByLabelText(/Stripe price ID/)).toHaveValue('price_123')
  })

  it('swaps in the seconds field only for a custom duration', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'New plan' }))
    const drawer = within(await openOverlay())
    expect(drawer.queryByLabelText(/Duration in seconds/)).not.toBeInTheDocument()

    fireEvent.change(drawer.getByLabelText(/Duration unit/), { target: { value: 'custom' } })
    expect(await drawer.findByLabelText(/Duration in seconds/)).toBeInTheDocument()
    expect(drawer.queryByLabelText('Duration')).not.toBeInTheDocument()
  })
})

describe('the bulk quota reset', () => {
  it('gates the reset behind typing the plan title and reports the counts', async () => {
    server.plans = [{ plan: starterPlan }]
    post.mockResolvedValue({
      data: {
        success: true,
        data: {
          advance_reset_time: true,
          matched_count: 42,
          plan_id: 3,
          reset_count: 42,
          user_count: 37,
        },
      },
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Reset quota' }))
    const dialog = within(await openOverlay())

    const confirm = dialog.getByRole('button', { name: 'Reset quota' })
    expect(confirm).toBeDisabled()
    expect(dialog.getByText(/cannot count the affected subscriptions beforehand/)).toBeInTheDocument()

    type(dialog.getByLabelText(/Type the plan title/), 'Starter')
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith(
      '/api/subscription/admin/plans/3/subscriptions/reset',
      { advance_reset_time: true },
      undefined,
    )
    expect(await screen.findByText('Matched subscriptions: 42')).toBeInTheDocument()
    expect(screen.getByText('Reset subscriptions: 42')).toBeInTheDocument()
    expect(screen.getByText('Users affected: 37')).toBeInTheDocument()
    expect(screen.getByText('Next reset date advanced')).toBeInTheDocument()
  })

  it('sends advance_reset_time explicitly when it is switched off', async () => {
    server.plans = [{ plan: starterPlan }]
    post.mockResolvedValue({
      data: {
        success: true,
        data: {
          advance_reset_time: false,
          matched_count: 0,
          plan_id: 3,
          reset_count: 0,
          user_count: 0,
        },
      },
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Reset quota' }))
    const dialog = within(await openOverlay())

    fireEvent.click(dialog.getByRole('switch', { name: 'Advance the next reset date' }))
    type(dialog.getByLabelText(/Type the plan title/), 'Starter')
    fireEvent.click(dialog.getByRole('button', { name: 'Reset quota' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith(
      '/api/subscription/admin/plans/3/subscriptions/reset',
      { advance_reset_time: false },
      undefined,
    )
    expect(await screen.findByText('Next reset date unchanged')).toBeInTheDocument()
  })

  it('keeps the reset unsent while the typed title does not match', async () => {
    server.plans = [{ plan: starterPlan }]
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Reset quota' }))
    const dialog = within(await openOverlay())

    type(dialog.getByLabelText(/Type the plan title/), 'Start')
    const confirm = dialog.getByRole('button', { name: 'Reset quota' })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(post).not.toHaveBeenCalled()
  })

  it('surfaces a failed reset instead of reporting counts', async () => {
    server.plans = [{ plan: starterPlan }]
    post.mockRejectedValue(new Error('plan not found'))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Reset quota' }))
    const dialog = within(await openOverlay())

    type(dialog.getByLabelText(/Type the plan title/), 'Starter')
    fireEvent.click(dialog.getByRole('button', { name: 'Reset quota' }))

    expect(await screen.findByText('The reset did not run.')).toBeInTheDocument()
    expect(screen.queryByText(/Matched subscriptions/)).not.toBeInTheDocument()
  })
})

describe('enable and disable', () => {
  it('writes the whole row back so a PUT cannot blank another column', async () => {
    server.plans = [{ plan: starterPlan }]
    put.mockResolvedValue({ data: { success: true, data: null } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Disable plan' }))
    const dialog = within(await openOverlay())
    fireEvent.click(dialog.getByRole('button', { name: 'Disable plan' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    const [url, body] = put.mock.calls[0] as [string, { plan: Record<string, unknown> }]
    expect(url).toBe('/api/subscription/admin/plans/3')
    expect(body.plan).toMatchObject({
      enabled: false,
      stripe_price_id: 'price_123',
      title: 'Starter',
      total_amount: 10_000_000,
      upgrade_group: 'vip',
    })
  })
})
