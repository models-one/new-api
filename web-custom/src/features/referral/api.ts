import { postJson } from '@/lib/api/client'

/**
 * Referral (affiliate) calls that the shared `src/lib/api` layer does not expose yet.
 * Everything here was checked against the running backend and the Go handlers it serves.
 */

/**
 * `POST /api/user/aff_transfer` (controller/user.go `TransferAffQuota`).
 *
 * The body is `{ quota }` in raw QUOTA UNITS — not currency. Server-side rules, read from
 * model/user.go `TransferAffQuotaToQuota`:
 *   - `quota` must be at least `common.QuotaPerUnit` (the same divisor `/api/status` reports
 *     as `quota_per_unit`), i.e. one full currency unit;
 *   - `quota` must not exceed the caller's `aff_quota`;
 *   - the route sits behind `requirePaymentCompliance`, so the whole feature answers
 *     `success: false` while an administrator has not confirmed the compliance terms.
 *
 * A success answer carries no payload (`data` is null).
 *
 * `skipBusinessError` keeps the shared axios interceptor from toasting: this form owns its
 * messaging and renders the server message inline instead.
 */
export function transferAffQuota(quota: number): Promise<null> {
  return postJson<null>('/api/user/aff_transfer', { quota }, { skipBusinessError: true })
}

/**
 * The sign-up path that records a referral. `/register` exists too but is only a redirect
 * to `/sign-up` in the legacy dashboard router (web/src/routes/(auth)/register.tsx), so the
 * link points straight at the page that reads `?aff=` and stores it for registration
 * (web/src/features/auth/sign-up/components/sign-up-form.tsx).
 */
const SIGN_UP_PATH = '/sign-up'

/** Query parameter the sign-up page reads the referral code from. */
const REFERRAL_PARAM = 'aff'

/**
 * Builds the invitation link from the deployment's configured `server_address`
 * (`/api/status`), falling back to the origin the console is being browsed from when the
 * deployment has none configured. Returns an empty string when there is no code yet.
 */
export function buildInvitationLink(
  serverAddress: string | undefined,
  affCode: string,
  fallbackOrigin: string,
): string {
  const code = affCode.trim()
  if (code === '') return ''

  const configured = serverAddress?.trim() ?? ''
  const base = (configured === '' ? fallbackOrigin : configured).replace(/\/+$/, '')
  if (base === '') return ''

  return `${base}${SIGN_UP_PATH}?${REFERRAL_PARAM}=${encodeURIComponent(code)}`
}

/**
 * The smallest transfer the backend accepts, expressed in currency units:
 * `TransferAffQuotaToQuota` rejects anything below one `quota_per_unit`.
 */
export const MINIMUM_TRANSFER_UNITS = 1

/**
 * Turns a currency amount typed by the user into the integer quota the API expects.
 * The result is clamped to the balance actually available so a rounded-up cent can never
 * push the request past the server's `aff_quota` check.
 */
export function currencyToQuota(amount: number, quotaPerUnit: number, available: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.min(Math.round(amount * quotaPerUnit), available)
}
