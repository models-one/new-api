import type { QuoteRoute } from '@/lib/api/topup'
import { api } from '@/lib/http-client'

type CheckoutBody = {
  message?: unknown
  data?: unknown
  url?: unknown
}

export type TopUpCheckout =
  | { kind: 'redirect'; url: string }
  | { kind: 'form'; url: string; params: Record<string, string> }

const payPaths: Record<QuoteRoute, string> = {
  epay: '/api/user/pay',
  stripe: '/api/user/stripe/pay',
  nowpayments: '/api/user/nowpayments/pay',
  waffo: '/api/user/waffo/pay',
  'waffo-pancake': '/api/user/waffo-pancake/pay',
}

const checkoutUrlFields: Record<Exclude<QuoteRoute, 'epay'>, string> = {
  stripe: 'pay_link',
  nowpayments: 'invoice_url',
  waffo: 'payment_url',
  'waffo-pancake': 'checkout_url',
}

function validCheckoutUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Invalid checkout link')

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Invalid checkout link')
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username !== '' || url.password !== '') {
    throw new Error('Invalid checkout link')
  }
  return url.href
}

/** The `/pay` routes use `{message, data}` without the shared `success` flag. */
export async function requestTopUpCheckout(
  route: QuoteRoute,
  amount: number,
  paymentMethod: string,
): Promise<TopUpCheckout> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid top-up amount')

  const body = route === 'epay' || route === 'stripe'
    ? { amount, payment_method: paymentMethod }
    : { amount }
  const response = await api.post<CheckoutBody>(payPaths[route], body, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  const result = response.data
  if (result?.message !== 'success') {
    const dataMessage = typeof result?.data === 'string' ? result.data.trim() : ''
    const envelopeMessage = typeof result?.message === 'string' && result.message !== 'error'
      ? result.message.trim()
      : ''
    throw new Error(dataMessage || envelopeMessage || 'Could not start payment')
  }

  if (route === 'epay') {
    const params = result.data
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      throw new Error('Invalid checkout link')
    }
    const entries = Object.entries(params)
    if (entries.length === 0 || entries.some(([, value]) => typeof value !== 'string')) {
      throw new Error('Invalid checkout link')
    }
    return { kind: 'form', url: validCheckoutUrl(result.url), params: Object.fromEntries(entries) }
  }

  const data = result.data
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Invalid checkout link')
  }
  const field = checkoutUrlFields[route]
  return { kind: 'redirect', url: validCheckoutUrl((data as Record<string, unknown>)[field]) }
}

/** Epay requires a POST form; hosted checkout providers return a redirect URL. */
export function openTopUpCheckout(
  checkout: TopUpCheckout,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): void {
  const url = validCheckoutUrl(checkout.url)
  if (checkout.kind === 'redirect') {
    navigate(url)
    return
  }

  const form = document.createElement('form')
  form.action = url
  form.method = 'POST'
  form.hidden = true
  for (const [name, value] of Object.entries(checkout.params)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  try {
    form.submit()
  } finally {
    form.remove()
  }
}
