import { queryOptions } from '@tanstack/react-query'

import { getJson, postJson } from '@/lib/api/client'
import type { PageInfo } from '@/lib/api/types'

/**
 * A configured payment method from `GET /api/user/topup/info`.
 * `min_topup` is a STRING on the wire (the Go type is map[string]string) — parse before comparing.
 */
export type PayMethod = {
  type: string
  name: string
  color?: string
  min_topup?: string
}

/** `GET /api/user/topup/info` (controller/topup.go GetTopUpInfo). */
export type TopUpInfo = {
  amount_options: number[]
  min_topup: number
  topup_link: string
  pay_methods: PayMethod[]
  waffo_pay_methods: PayMethod[] | null
  discount: Record<string, number>
  creem_products: string
  enable_online_topup: boolean
  enable_stripe_topup: boolean
  enable_creem_topup: boolean
  enable_nowpayments_topup: boolean
  enable_waffo_topup: boolean
  enable_waffo_pancake_topup: boolean
  enable_redemption: boolean
  stripe_min_topup: number
  nowpayments_min_topup: number
  waffo_min_topup: number
  waffo_pancake_min_topup: number
  payment_compliance_confirmed: boolean
  payment_compliance_terms_version: string
}

/** `GET /api/user/topup/self` — capped to the last 30 days server-side. */
export type TopUpRecord = {
  id: number
  user_id: number
  amount: number
  money: number
  trade_no: string
  create_time: number
  complete_time: number
  status: string
}

export function topUpInfoQuery() {
  return queryOptions({
    queryKey: ['topup', 'info'],
    queryFn: () => getJson<TopUpInfo>('/api/user/topup/info'),
    staleTime: 5 * 60 * 1000,
  })
}

export function topUpHistoryQuery(page: number, pageSize: number, keyword = '') {
  return queryOptions({
    queryKey: ['topup', 'history', page, pageSize, keyword],
    queryFn: () =>
      getJson<PageInfo<TopUpRecord>>('/api/user/topup/self', {
        params: { p: page, page_size: pageSize, keyword },
      }),
    staleTime: 30 * 1000,
  })
}

/** Quotes the payable amount for a top-up. Every provider has its own quote route. */
export type QuoteRoute = 'epay' | 'stripe' | 'nowpayments' | 'waffo' | 'waffo-pancake'

const quotePaths: Record<QuoteRoute, string> = {
  epay: '/api/user/amount',
  stripe: '/api/user/stripe/amount',
  nowpayments: '/api/user/nowpayments/amount',
  waffo: '/api/user/waffo/amount',
  'waffo-pancake': '/api/user/waffo-pancake/amount',
}

/**
 * These routes answer HTTP 200 with `{message, data}` and NO `success` field on failure,
 * so the shared envelope unwrapping cannot classify them. Callers get the raw payload
 * and must decide whether `data` is a quote or an error string.
 */
export function requestTopUpQuote(route: QuoteRoute, body: Record<string, unknown>): Promise<unknown> {
  return postJson<unknown>(quotePaths[route], body, { skipBusinessError: true })
}

/** Redeems a redemption code, crediting the balance directly. */
export function redeemCode(key: string): Promise<number> {
  return postJson<number>('/api/user/topup', { key })
}

export function parseMinTopUp(method: PayMethod, fallback: number): number {
  const parsed = Number(method.min_topup)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
