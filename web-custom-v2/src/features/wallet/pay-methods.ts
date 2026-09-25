import { parseMinTopUp, type PayMethod, type QuoteRoute, type TopUpInfo } from '@/lib/api/topup'

/**
 * `GET /api/user/topup/info` returns `pay_methods` as soon as the administrator has
 * confirmed the compliance terms — the per-provider `enable_*_topup` flags are what
 * actually turn a method on. A method whose flag is false is dropped here rather than
 * rendered as a dead tile.
 */
type ProviderBinding = {
  route: QuoteRoute
  enabledKey: 'enable_stripe_topup' | 'enable_nowpayments_topup' | 'enable_waffo_topup' | 'enable_waffo_pancake_topup'
  minKey: 'stripe_min_topup' | 'nowpayments_min_topup' | 'waffo_min_topup' | 'waffo_pancake_min_topup'
}

/**
 * Provider slugs come from `model.PaymentMethod*` in the Go backend. Anything not
 * listed here is an administrator-defined Epay method (alipay, wxpay, …) and is
 * quoted through `/api/user/amount`, matching the reference frontend's routing.
 */
const providerBindings: Record<string, ProviderBinding> = {
  stripe: { route: 'stripe', enabledKey: 'enable_stripe_topup', minKey: 'stripe_min_topup' },
  nowpayments: { route: 'nowpayments', enabledKey: 'enable_nowpayments_topup', minKey: 'nowpayments_min_topup' },
  waffo: { route: 'waffo', enabledKey: 'enable_waffo_topup', minKey: 'waffo_min_topup' },
  waffo_pancake: { route: 'waffo-pancake', enabledKey: 'enable_waffo_pancake_topup', minKey: 'waffo_pancake_min_topup' },
}

export type EnabledPayMethod = {
  method: PayMethod
  route: QuoteRoute
  /** Effective floor for this method: its own `min_topup`, else the provider default. */
  minTopUp: number
}

function resolvePayMethod(info: TopUpInfo, method: PayMethod): EnabledPayMethod | null {
  const binding = providerBindings[method.type]

  if (binding) {
    if (info[binding.enabledKey] !== true) return null
    return { method, route: binding.route, minTopUp: parseMinTopUp(method, info[binding.minKey]) }
  }

  if (info.enable_online_topup !== true) return null
  return { method, route: 'epay', minTopUp: parseMinTopUp(method, info.min_topup) }
}

/**
 * The methods this deployment will actually accept money through. May be empty.
 *
 * `pay_methods` is a Go slice built with `append([]map[string]string(nil), …)`, so it
 * marshals to `null` — not `[]` — whenever the administrator has confirmed the
 * compliance terms but configured no Epay method and enabled no provider. That is
 * exactly the state reached by turning on redemption codes alone, so the null is
 * reachable in production even though this dev server returns `[]`. The shared
 * `TopUpInfo` type declares the field non-nullable; iterating the null would throw.
 */
export function enabledPayMethods(info: TopUpInfo | undefined): EnabledPayMethod[] {
  if (!info || !Array.isArray(info.pay_methods)) return []

  const enabled: EnabledPayMethod[] = []
  for (const method of info.pay_methods) {
    const resolved = resolvePayMethod(info, method)
    if (resolved) enabled.push(resolved)
  }
  return enabled
}
