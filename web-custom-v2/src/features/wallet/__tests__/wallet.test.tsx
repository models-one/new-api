// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

const { WalletPage } = await import('@/features/wallet/WalletPage')
const { fetchTopUpQuote } = await import('@/features/wallet/topup-quote')
const { requestTopUpCheckout, openTopUpCheckout } = await import('@/features/wallet/topup-checkout')
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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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
    // And the panel must not tell the reader to pick a method it then says is absent.
    expect(screen.queryByText('Select an amount and payment method.')).not.toBeInTheDocument()
  })

  it('leaves the order pager out while there is nothing to page through', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/api/status') return Promise.resolve({ data: { success: true, data: statusFixture } })
      if (url === '/api/user/self') return Promise.resolve({ data: { success: true, data: selfFixture } })
      if (url === '/api/user/topup/info') {
        return Promise.resolve({ data: { success: true, data: topUpInfoFixture } })
      }
      if (url === '/api/user/topup/self') {
        return Promise.resolve({ data: { success: true, data: { page: 1, page_size: 10, total: 0, items: [] } } })
      }
      throw new Error(`unmocked GET ${url}`)
    })

    renderWallet()

    // Twice: the desktop table and the phone card list each show the empty state.
    await waitFor(() => expect(screen.getAllByText('No top-up orders yet')).toHaveLength(2))
    expect(screen.queryByRole('navigation', { name: 'Top-up order pages' })).not.toBeInTheDocument()
    expect(screen.queryByText('Showing 0-0 of 0')).not.toBeInTheDocument()
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

  it('repeats the orders as cards for a phone, where the seven columns do not fit', async () => {
    renderWallet()

    const cards = await screen.findByRole('region', { name: 'Top-up order cards' })
    await waitFor(() => expect(within(cards).getByText('TN17878128530')).toBeInTheDocument())
    // Trailing columns that scroll off the table on a phone are labelled in the card.
    expect(within(cards).getByText('Charged')).toBeInTheDocument()
    expect(within(cards).getByText('Completed')).toBeInTheDocument()
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

  it('keeps the Add funds subtitle when there really is a method to select', async () => {
    renderWallet()

    expect(await screen.findByText('Select an amount and payment method.')).toBeInTheDocument()
  })

  it('shows the redemption form once enable_redemption is true', async () => {
    renderWallet()

    expect(await screen.findByRole('button', { name: 'Redeem' })).toBeDisabled()
  })

  it('only creates an Epay order after a valid quote and displays a payment rejection', async () => {
    let finishQuote: ((value: { data: { message: string; data: string } }) => void) | undefined
    let quoteRequests = 0
    post.mockImplementation((url: string) => {
      if (url === '/api/user/amount') {
        quoteRequests += 1
        return quoteRequests === 1
          ? new Promise((resolve) => { finishQuote = resolve })
          : Promise.resolve({ data: { message: 'success', data: '73.00' } })
      }
      if (url === '/api/user/pay') return Promise.resolve({ data: { message: 'error', data: 'Gateway unavailable' } })
      throw new Error(`unmocked POST ${url}`)
    })

    renderWallet()
    const button = await screen.findByRole('button', { name: 'Proceed to payment' })
    expect(button).toBeDisabled()
    expect(post).not.toHaveBeenCalledWith('/api/user/pay', expect.anything(), expect.anything())

    finishQuote?.({ data: { message: 'success', data: '73.00' } })
    await screen.findByText('73.00')
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/user/pay',
      { amount: 10, payment_method: 'alipay' },
      expect.anything(),
    ))
    expect(await screen.findByRole('alert')).toHaveTextContent('Gateway unavailable')
  })

  it('does not create an order for a rejected quote', async () => {
    post.mockResolvedValue({ data: { message: 'error', data: 'Too low' } })

    renderWallet()
    const button = await screen.findByRole('button', { name: 'Proceed to payment' })
    await screen.findByText('Too low')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(post).not.toHaveBeenCalledWith('/api/user/pay', expect.anything(), expect.anything())
  })

  it('disables checkout while a changed amount is being quoted', async () => {
    let finishQuote: ((value: { data: { message: string; data: string } }) => void) | undefined
    post.mockImplementation((url: string, body: { amount: number }) => {
      if (url !== '/api/user/amount') throw new Error(`unexpected POST ${url}`)
      if (body.amount === 10) return Promise.resolve({ data: { message: 'success', data: '73.00' } })
      return new Promise((resolve) => { finishQuote = resolve })
    })

    renderWallet()
    const button = await screen.findByRole('button', { name: 'Proceed to payment' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Custom amount'), { target: { value: '20' } })

    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(post).not.toHaveBeenCalledWith('/api/user/pay', expect.anything(), expect.anything())
    finishQuote?.({ data: { message: 'success', data: '146.00' } })
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('keeps checkout disabled while an order request is pending', async () => {
    let finishPay: ((value: { data: { message: string; data: string } }) => void) | undefined
    post.mockImplementation((url: string) => {
      if (url === '/api/user/amount') return Promise.resolve({ data: { message: 'success', data: '73.00' } })
      if (url === '/api/user/pay') return new Promise((resolve) => { finishPay = resolve })
      throw new Error(`unmocked POST ${url}`)
    })

    renderWallet()
    const button = await screen.findByRole('button', { name: 'Proceed to payment' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(screen.getByRole('radio', { name: '10' })).toBeDisabled()
    expect(screen.getByLabelText('Custom amount')).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Alipay' })).toBeDisabled()
    fireEvent.click(button)
    await waitFor(() => expect(post.mock.calls.filter(([url]) => url === '/api/user/pay')).toHaveLength(1))

    finishPay?.({ data: { message: 'error', data: 'Try later' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Try later')
  })

  it('reports a failed provider handoff and unlocks checkout for retry', async () => {
    post.mockImplementation((url: string) => {
      if (url === '/api/user/amount') return Promise.resolve({ data: { message: 'success', data: '73.00' } })
      if (url === '/api/user/pay') {
        return Promise.resolve({
          data: { message: 'success', url: 'https://pay.example/submit', data: { pid: '123' } },
        })
      }
      throw new Error(`unmocked POST ${url}`)
    })
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {
      throw new Error('Checkout blocked')
    })

    renderWallet()
    const button = await screen.findByRole('button', { name: 'Proceed to payment' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent('Checkout blocked')
    expect(button).toBeEnabled()
  })

  it('requires review of a changed payable amount before creating an order', async () => {
    let quotes = 0
    post.mockImplementation((url: string) => {
      if (url !== '/api/user/amount') throw new Error(`unexpected POST ${url}`)
      quotes += 1
      return Promise.resolve({ data: { message: 'success', data: quotes === 1 ? '73.00' : '74.00' } })
    })

    renderWallet()
    const button = await screen.findByRole('button', { name: 'Proceed to payment' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent('The price changed. Review the new amount before paying.')
    expect(screen.getByText('74.00')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalledWith('/api/user/pay', expect.anything(), expect.anything())
  })

  it('creates a NOWPayments invoice for a Crypto method', async () => {
    const cryptoInfo = {
      ...enabledInfo,
      enable_online_topup: false,
      enable_nowpayments_topup: true,
      pay_methods: [{ type: 'nowpayments', name: 'Crypto', min_topup: '10' }],
    }
    get.mockImplementation((url: string) => {
      if (url === '/api/status') return Promise.resolve({ data: { success: true, data: statusFixture } })
      if (url === '/api/user/self') return Promise.resolve({ data: { success: true, data: selfFixture } })
      if (url === '/api/user/topup/info') return Promise.resolve({ data: { success: true, data: cryptoInfo } })
      if (url === '/api/user/topup/self') return Promise.resolve({ data: { success: true, data: historyFixture } })
      throw new Error(`unmocked GET ${url}`)
    })
    post.mockImplementation((url: string) => {
      if (url === '/api/user/nowpayments/amount') return Promise.resolve({ data: { message: 'success', data: '10.00' } })
      if (url === '/api/user/nowpayments/pay') return Promise.resolve({ data: { message: 'error', data: 'Invoice unavailable' } })
      throw new Error(`unmocked POST ${url}`)
    })

    renderWallet()
    const button = await screen.findByRole('button', { name: 'Proceed to payment' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/user/nowpayments/pay',
      { amount: 10 },
      expect.anything(),
    ))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invoice unavailable')
  })
})

describe('top-up checkout handoff', () => {
  it('parses Epay form fields from a response without success and posts in the same tab', async () => {
    post.mockResolvedValueOnce({
      data: { message: 'success', url: 'https://pay.example/submit', data: { pid: '123', sign: 'abc' } },
    })
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      expect(this.action).toBe('https://pay.example/submit')
      expect(this.method).toBe('POST')
      expect(this.target).toBe('')
      expect(new FormData(this).get('pid')).toBe('123')
      expect(new FormData(this).get('sign')).toBe('abc')
    })

    const checkout = await requestTopUpCheckout('epay', 10, 'alipay')
    expect(checkout).toEqual({ kind: 'form', url: 'https://pay.example/submit', params: { pid: '123', sign: 'abc' } })
    openTopUpCheckout(checkout)
    expect(submit).toHaveBeenCalledOnce()
    submit.mockRestore()
  })

  it.each([
    ['stripe', '/api/user/stripe/pay', 'pay_link'],
    ['nowpayments', '/api/user/nowpayments/pay', 'invoice_url'],
    ['waffo', '/api/user/waffo/pay', 'payment_url'],
    ['waffo-pancake', '/api/user/waffo-pancake/pay', 'checkout_url'],
  ] as const)('uses the %s checkout URL returned by %s', async (route, path, field) => {
    post.mockResolvedValueOnce({ data: { message: 'success', data: { [field]: 'https://pay.example/order' } } })

    const checkout = await requestTopUpCheckout(route, 10, route)
    expect(post).toHaveBeenCalledWith(
      path,
      route === 'stripe' ? { amount: 10, payment_method: 'stripe' } : { amount: 10 },
      expect.anything(),
    )
    expect(checkout).toEqual({ kind: 'redirect', url: 'https://pay.example/order' })

    const navigate = vi.fn()
    openTopUpCheckout(checkout, navigate)
    expect(navigate).toHaveBeenCalledWith('https://pay.example/order')
  })

  it('rejects an unsafe checkout URL instead of opening it', async () => {
    post.mockResolvedValueOnce({ data: { message: 'success', data: { invoice_url: 'javascript:alert(1)' } } })

    await expect(requestTopUpCheckout('nowpayments', 10, 'nowpayments')).rejects.toThrow('Invalid checkout link')
    const navigate = vi.fn()
    expect(() => openTopUpCheckout({ kind: 'redirect', url: 'javascript:alert(1)' }, navigate)).toThrow('Invalid checkout link')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows the server reason from an envelope-style payment rejection', async () => {
    post.mockResolvedValueOnce({ data: { success: false, message: 'Top-up amount cannot exceed 10000', data: 10 } })

    await expect(requestTopUpCheckout('stripe', 10001, 'stripe')).rejects.toThrow('Top-up amount cannot exceed 10000')
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
