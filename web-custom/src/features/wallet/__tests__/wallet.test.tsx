// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

const { WalletPage } = await import('@/features/wallet/WalletPage')
const { fetchTopUpQuote } = await import('@/features/wallet/topup-quote')
const { enabledPayMethods } = await import('@/features/wallet/pay-methods')
type TopUpInfo = Parameters<typeof enabledPayMethods>[0]
const { default: topUpInfoFixture } = await import('@/features/wallet/__tests__/fixtures/topup-info.json')

/** Captured verbatim from the seeded dev server. */
const statusFixture = { quota_per_unit: 500000 }
const selfFixture = { quota: 100000000, used_quota: 3750000, request_count: 1336 }
const historyFixture = {
  page: 1,
  page_size: 10,
  total: 1,
  items: [
    {
      id: 1,
      user_id: 1,
      amount: 50,
      money: 365,
      trade_no: 'TN17878128530',
      payment_method: 'epay',
      payment_provider: 'epay',
      create_time: 1787812853,
      complete_time: 1787812973,
      status: 'success',
    },
  ],
}

function renderWallet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<WalletPage />, { wrapper })
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  get.mockImplementation((url: string) => {
    if (url === '/api/status') return Promise.resolve({ data: { success: true, data: statusFixture } })
    if (url === '/api/user/self') return Promise.resolve({ data: { success: true, data: selfFixture } })
    if (url === '/api/user/topup/info') {
      return Promise.resolve({ data: { success: true, data: topUpInfoFixture } })
    }
    if (url === '/api/user/topup/self') {
      return Promise.resolve({ data: { success: true, data: historyFixture } })
    }
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

describe('WalletPage', () => {
  it('shows the balance, lifetime spend and request count from /api/user/self', async () => {
    renderWallet()

    expect(await screen.findByText('$200')).toBeInTheDocument()
    expect(screen.getByText('$7')).toBeInTheDocument()
    expect(screen.getByText('1,336')).toBeInTheDocument()
  })

  it('explains that online payment is unconfigured instead of rendering a dead form', async () => {
    renderWallet()

    expect(await screen.findByText('Online payment is not configured')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Payment method' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    // The mock's invented rate and hardcoded providers must be gone.
    expect(screen.queryByText('Alipay')).not.toBeInTheDocument()
    expect(screen.queryByText('340.00')).not.toBeInTheDocument()
  })

  it('hides the redemption form while enable_redemption is false', async () => {
    renderWallet()

    await screen.findByText('Online payment is not configured')
    expect(screen.queryByRole('button', { name: 'Redeem' })).not.toBeInTheDocument()
  })

  it('lists top-up orders and says the server caps the window at 30 days', async () => {
    renderWallet()

    const table = await screen.findByRole('table', { name: 'Top-up orders' })
    await waitFor(() => expect(within(table).getByText('TN17878128530')).toBeInTheDocument())
    expect(within(table).getByText('365.00')).toBeInTheDocument()
    expect(within(table).getByText('success')).toBeInTheDocument()
    expect(screen.getByText('The server only returns orders from the last 30 days.')).toBeInTheDocument()
  })
})

describe('WalletPage with a provider enabled', () => {
  const enabledInfo = {
    ...topUpInfoFixture,
    enable_online_topup: true,
    enable_redemption: true,
    pay_methods: [{ type: 'alipay', name: 'Alipay', color: '#1677FF', min_topup: '5' }],
  }

  beforeEach(() => {
    get.mockImplementation((url: string) => {
      if (url === '/api/status') return Promise.resolve({ data: { success: true, data: statusFixture } })
      if (url === '/api/user/self') return Promise.resolve({ data: { success: true, data: selfFixture } })
      if (url === '/api/user/topup/info') {
        return Promise.resolve({ data: { success: true, data: enabledInfo } })
      }
      if (url === '/api/user/topup/self') {
        return Promise.resolve({ data: { success: true, data: historyFixture } })
      }
      throw new Error(`unmocked GET ${url}`)
    })
    post.mockResolvedValue({ data: { message: 'success', data: '73.00' } })
  })

  it('renders the server amount options as radios and quotes the price from /api/user/amount', async () => {
    renderWallet()

    const first = await screen.findByRole('radio', { name: '10' })
    expect(first).toBeChecked()
    expect(screen.getByRole('radio', { name: '500' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Alipay' })).toBeChecked()

    await waitFor(() => expect(screen.getByText('73.00')).toBeInTheDocument())
    expect(post).toHaveBeenCalledWith('/api/user/amount', { amount: 10 }, expect.anything())
  })

  it('applies the string min_topup from the pay method', async () => {
    renderWallet()

    expect(await screen.findByText('Minimum 5 with Alipay')).toBeInTheDocument()
  })

  it('shows the redemption form once enable_redemption is true', async () => {
    renderWallet()

    expect(await screen.findByRole('button', { name: 'Redeem' })).toBeDisabled()
  })
})

describe('fetchTopUpQuote', () => {
  it('reads the quote out of a body that carries no success field', async () => {
    post.mockResolvedValueOnce({ data: { message: 'success', data: '365.00' } })

    await expect(fetchTopUpQuote('epay', 50)).resolves.toEqual({
      kind: 'quote',
      payable: 365,
      raw: '365.00',
    })
  })

  it('surfaces a rejection that also arrives as HTTP 200 without a success field', async () => {
    post.mockResolvedValueOnce({ data: { message: 'error', data: '充值数量不能小于 1' } })

    await expect(fetchTopUpQuote('epay', 0)).resolves.toEqual({
      kind: 'rejected',
      message: '充值数量不能小于 1',
    })
  })
})

describe('enabledPayMethods', () => {
  it('drops methods whose provider flag is off and keeps the ones the server enables', () => {
    const info = {
      ...topUpInfoFixture,
      enable_online_topup: false,
      enable_stripe_topup: true,
      pay_methods: [
        { type: 'alipay', name: 'Alipay' },
        { type: 'stripe', name: 'Stripe', min_topup: '5' },
      ],
    }

    const enabled = enabledPayMethods(info)

    expect(enabled).toHaveLength(1)
    expect(enabled[0]?.method.type).toBe('stripe')
    expect(enabled[0]?.route).toBe('stripe')
    // min_topup is a string on the wire; an unparsed compare would yield NaN.
    expect(enabled[0]?.minTopUp).toBe(5)
  })

  it('survives the null pay_methods a compliance-confirmed server sends', () => {
    // Go marshals the nil slice as null once compliance is confirmed with no method
    // configured — the shape TopUpInfo does not model. Iterating it used to throw.
    const info = { ...topUpInfoFixture, pay_methods: null } as unknown as TopUpInfo

    expect(enabledPayMethods(info)).toEqual([])
  })
})

describe('TopUpForm with a null amount_options', () => {
  it('still renders the custom amount field instead of throwing', async () => {
    const nullOptions = {
      ...topUpInfoFixture,
      amount_options: null,
      enable_online_topup: true,
      pay_methods: [{ type: 'alipay', name: 'Alipay', min_topup: '5' }],
    }
    get.mockImplementation((url: string) => {
      if (url === '/api/status') return Promise.resolve({ data: { success: true, data: statusFixture } })
      if (url === '/api/user/self') return Promise.resolve({ data: { success: true, data: selfFixture } })
      if (url === '/api/user/topup/info') {
        return Promise.resolve({ data: { success: true, data: nullOptions } })
      }
      if (url === '/api/user/topup/self') {
        return Promise.resolve({ data: { success: true, data: historyFixture } })
      }
      throw new Error(`unmocked GET ${url}`)
    })
    post.mockResolvedValue({ data: { message: 'success', data: '73.00' } })

    renderWallet()

    expect(await screen.findByLabelText('Custom amount')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '10' })).not.toBeInTheDocument()
  })
})
