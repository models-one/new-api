import axios from 'axios'

/**
 * Why `GET /api/rankings` refused, in the terms the gateway actually answers in.
 *
 * `middleware.HeaderNavModuleAuth("rankings")` has exactly two refusals, and they mean very
 * different things to a visitor:
 *
 * - **403** — the operator turned the module off; the handler answers
 *   `{"success":false,"message":"rankings is disabled"}` before any auth runs. The page reads
 *   `/api/status` before asking, so this only happens when the option changed between the two
 *   requests, or when `/api/status` was served from a stale cache.
 * - **401** — `requireAuth` is on and this visitor has no session. The middleware delegates to
 *   `middleware.UserAuth()`, which aborts with a `{"success":false,"code":"AUTH_…"}` envelope.
 *
 * Anything else — a 500, a dropped connection, a proxy in the way — is a failure of the request
 * itself and has to be reported as itself. Reading "sign in" off a network drop would be the UI
 * inventing a cause the server never gave.
 */
export type RankingsFailure = 'disabled' | 'sign-in-required' | 'other'

export function rankingsFailureKind(error: unknown): RankingsFailure {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status === 403) return 'disabled'
  if (status === 401) return 'sign-in-required'
  return 'other'
}
