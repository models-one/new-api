// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClientModule from '@/lib/api/client'

const mocks = vi.hoisted(() => ({ getJson: vi.fn(), postJson: vi.fn() }))

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClientModule>()),
  getJson: mocks.getJson,
  postJson: mocks.postJson,
}))

const { ReferralPage } = await import('@/features/referral/ReferralPage')

const status = {
  server_address: 'https://gateway.example.com',
  quota_per_unit: 500_000,
}

const activeUser = {
  aff_code: 'ujX8',
  aff_count: 3,
  aff_quota: 1_500_000,
  aff_history_quota: 2_500_000,
  inviter_id: 7,
}

const emptyUser = {
  aff_code: 'ujX8',
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  inviter_id: 0,
}

type Overrides = {
  user?: Record<string, unknown>
  complianceConfirmed?: boolean
}

function respond(overrides: Overrides = {}) {
  const { user = activeUser, complianceConfirmed = true } = overrides
  mocks.getJson.mockImplementation((url: string) => {
    if (url === '/api/status') return Promise.resolve(status)
    if (url === '/api/user/self') return Promise.resolve(user)
    if (url === '/api/user/aff') return Promise.resolve('ujX8')
    if (url === '/api/user/topup/info') {
      return Promise.resolve({ payment_compliance_confirmed: complianceConfirmed })
    }
    return Promise.reject(new Error(`unexpected request: ${url}`))
  })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ReferralPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.getJson.mockReset()
  mocks.postJson.mockReset()
})

afterEach(cleanup)

describe('ReferralPage', () => {
  it('announces loading, then renders the referral figures the backend reports', async () => {
    respond()
    renderPage()

    expect(screen.getByText('Loading referral summary')).toBeInTheDocument()

    expect(await screen.findByText('People invited')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    // aff_quota 1_500_000 / quota_per_unit 500_000
    expect(screen.getByText('$3.00')).toBeInTheDocument()
    // aff_history_quota 2_500_000 / quota_per_unit 500_000
    expect(screen.getByText('$5.00')).toBeInTheDocument()
    expect(screen.getByText('Account #7')).toBeInTheDocument()
  })

  it('builds the invitation link from the configured server address', async () => {
    respond()
    renderPage()

    expect(await screen.findByText('https://gateway.example.com/sign-up?aff=ujX8')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy invitation link' })).toBeInTheDocument()
  })

  it('enforces the server minimum before confirming a transfer', async () => {
    respond()
    renderPage()

    const amount = await screen.findByRole('spinbutton', { name: 'Amount to transfer' })
    const submit = screen.getByRole('button', { name: 'Transfer to main balance' })

    fireEvent.change(amount, { target: { value: '0.5' } })
    expect(screen.getByText('The minimum transfer is $1.00.')).toBeInTheDocument()
    expect(submit).toBeDisabled()

    fireEvent.change(amount, { target: { value: '2' } })
    expect(submit).toBeEnabled()

    mocks.postJson.mockResolvedValue(null)
    fireEvent.click(submit)

    const dialog = await screen.findByRole('dialog', { name: 'Transfer referral balance?' })
    expect(within(dialog).getByText(/\$2\.00/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer' }))

    await waitFor(() => {
      expect(mocks.postJson).toHaveBeenCalledWith(
        '/api/user/aff_transfer',
        { quota: 1_000_000 },
        { skipBusinessError: true },
      )
    })
  })

  it('disables transfers and says why when the deployment has not confirmed compliance', async () => {
    respond({ complianceConfirmed: false })
    renderPage()

    expect(await screen.findByText('Transfers are turned off')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Amount to transfer' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Transfer to main balance' })).toBeDisabled()
  })

  it('shows an honest empty state for an account that has invited nobody', async () => {
    respond({ user: emptyUser })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'No referrals yet' })).toBeInTheDocument()
    expect(screen.queryByText('Invited by')).not.toBeInTheDocument()
    expect(
      screen.getByText('You need at least $1.00 of referral balance before you can transfer.'),
    ).toBeInTheDocument()
  })

  it('never claims the deployment has no address when /api/status simply failed', async () => {
    mocks.getJson.mockImplementation((url: string) => {
      if (url === '/api/status') return Promise.reject(new Error('status down'))
      if (url === '/api/user/self') return Promise.resolve(activeUser)
      if (url === '/api/user/aff') return Promise.resolve('ujX8')
      return Promise.resolve({ payment_compliance_confirmed: true })
    })
    renderPage()

    expect(
      await screen.findByText('Unable to load the address your invitation link is built from.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'This deployment has no public address configured, so the link uses the address you are browsing from.',
      ),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/\/sign-up\?aff=/)).not.toBeInTheDocument()
  })

  it('surfaces a retry path when the summary request fails', async () => {
    mocks.getJson.mockImplementation((url: string) => {
      if (url === '/api/user/self') return Promise.reject(new Error('boom'))
      if (url === '/api/status') return Promise.resolve(status)
      if (url === '/api/user/aff') return Promise.resolve('ujX8')
      return Promise.resolve({ payment_compliance_confirmed: true })
    })
    renderPage()

    expect(await screen.findByText('Unable to load your referral summary.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0)
  })
})
