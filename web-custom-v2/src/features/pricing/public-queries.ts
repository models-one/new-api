import { queryOptions } from '@tanstack/react-query'

import { getJson, getRawJson } from '@/lib/api/client'
import type { ModelPerfSummary } from '@/lib/api/metrics'
import type { PricingResponse } from '@/lib/api/pricing'
import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * The request config every request this public surface makes has to carry.
 *
 * `lib/http-client` answers a 401 by refreshing the session and, when the refresh fails,
 * toasting "Session expired!" and hard-navigating to the legacy sign-in page. That is exactly
 * right inside the console and exactly wrong here: `GET /api/pricing` sits behind
 * `middleware.HeaderNavModuleAuth("pricing")`, so an operator who turns that module's
 * `requireAuth` on makes the endpoint answer 401 to anonymous visitors — and the default
 * console handling would then throw a visitor off the public page before it could render its
 * own sign-in notice.
 *
 * - `skipAuthRefresh` keeps a 401 a plain rejection instead of a redirect.
 * - `skipErrorHandler` keeps the toast off a page that already renders every failure inline.
 * - `skipBusinessError` does the same for a 200 carrying `success: false`.
 */
export const PUBLIC_REQUEST: ApiRequestConfig = {
  skipAuthRefresh: true,
  skipErrorHandler: true,
  skipBusinessError: true,
}

/**
 * `GET /api/pricing`, read anonymously.
 *
 * The key is deliberately NOT the console's `['pricing']`: `features/models` registers that key
 * with a fetcher that redirects on 401, and whichever query mounts first owns the fetcher for a
 * key. A separate key costs one extra request for the rare visitor who browses both surfaces in
 * one session, and buys a guarantee that this page never inherits console behaviour.
 */
export function publicPricingQuery() {
  return queryOptions({
    queryKey: ['pricing', 'public'],
    queryFn: () => getRawJson<PricingResponse>('/api/pricing', PUBLIC_REQUEST),
    staleTime: 5 * 60 * 1000,
  })
}

/** The server clamps `hours` to 1..720. */
export const PERF_SUMMARY_HOURS = 24

/**
 * `GET /api/perf-metrics/summary`, read anonymously. SERVICE-WIDE figures across every user's
 * traffic — never the viewer's own. Public alongside the pricing module
 * (`HeaderNavModulePublicOrUserAuth("pricing")`), which is why it needs the same 401 handling.
 */
export function publicPerfSummaryQuery(hours = PERF_SUMMARY_HOURS) {
  return queryOptions({
    queryKey: ['perf-metrics', 'summary', 'public', hours],
    queryFn: () =>
      getJson<{ models: ModelPerfSummary[] }>('/api/perf-metrics/summary', {
        ...PUBLIC_REQUEST,
        params: { hours: Math.min(720, Math.max(1, hours)) },
      }),
    staleTime: 60 * 1000,
  })
}
