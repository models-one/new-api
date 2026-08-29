import { queryOptions } from '@tanstack/react-query'

import type { QuoteRoute } from '@/lib/api/topup'
import { api } from '@/lib/http-client'

/**
 * The `/amount` quote routes answer HTTP 200 with `{message, data}` and NO `success`
 * field for BOTH outcomes — `{"message":"success","data":"365.00"}` on a quote and
 * `{"message":"error","data":"充值数量不能小于 1"}` on a rejection (verified against the
 * live server for all five routes).
 *
 * `requestTopUpQuote` in `@/lib/api/topup` funnels those bodies through `postJson`,
 * whose `unwrap` throws whenever `success !== true` — so it throws `ApiError('success')`
 * on the happy path and discards the quoted figure. The wallet therefore reads the raw
 * body here instead. See the report: this belongs in the shared layer.
 */
const quotePaths: Record<QuoteRoute, string> = {
  epay: '/api/user/amount',
  stripe: '/api/user/stripe/amount',
  nowpayments: '/api/user/nowpayments/amount',
  waffo: '/api/user/waffo/amount',
  'waffo-pancake': '/api/user/waffo-pancake/amount',
}

/** The server's own discriminator: `message` is literally "success" or "error". */
const QUOTE_OK = 'success'

export type TopUpQuote =
  | {
    kind: 'quote'
    /** Parsed payable figure. The server sends no currency code alongside it. */
    payable: number
    /** The server's own fixed-point string, e.g. "365.00" — rendered verbatim. */
    raw: string
  }
  | {
    kind: 'rejected'
    /** The provider's rejection text; may be empty. */
    message: string
  }

type QuoteBody = {
  message?: unknown
  data?: unknown
}

/**
 * Never throws for a business rejection — both outcomes come back as data so the
 * call site can render the provider's own words inline.
 */
export async function fetchTopUpQuote(route: QuoteRoute, amount: number): Promise<TopUpQuote> {
  const response = await api.post<QuoteBody>(
    quotePaths[route],
    { amount },
    { skipBusinessError: true, skipErrorHandler: true },
  )

  const body = response.data
  const payload = typeof body.data === 'string' ? body.data : ''

  if (body.message !== QUOTE_OK) return { kind: 'rejected', message: payload }

  const payable = Number.parseFloat(payload)
  if (!Number.isFinite(payable)) return { kind: 'rejected', message: payload }

  return { kind: 'quote', payable, raw: payload }
}

export function topUpQuoteQuery(route: QuoteRoute, amount: number) {
  return queryOptions({
    queryKey: ['wallet', 'topup-quote', route, amount],
    queryFn: () => fetchTopUpQuote(route, amount),
    staleTime: 60 * 1000,
    retry: false,
  })
}
