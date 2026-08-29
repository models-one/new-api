import { ApiError, getJson, postJson } from '@/lib/api/client'

import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * Password reset, in two hops.
 *
 * Verified against the running backend (`controller/misc.go`, `router/api-router.go`):
 *
 *   GET /api/reset_password?email=<address>&turnstile=<token>
 *     -> {"success":true,"message":""} — even for an address with NO account. The handler
 *        looks the user up, silently skips the mail when there is none, and answers
 *        success either way, so the UI must not turn this into "we sent you a link":
 *        that would make the endpoint an account-existence oracle.
 *        A malformed address answers {"success":false,"message":"Invalid parameters"}.
 *     Behind `middleware.TurnstileCheck()`, which reads the `turnstile` QUERY parameter.
 *
 *   POST /api/user/reset   body {email, token}
 *     -> {"success":true,"message":"","data":"<generated password>"}
 *     The user does NOT choose a password here: `ResetPassword` generates one
 *     (`common.GenerateVerificationCode(12)`, the first 12 hex characters of a UUID),
 *     writes it to the account and returns it in `data`. It is shown once and never again.
 *     Observed failures: {"success":false,"message":"Invalid parameters"} for a missing
 *     field and {"success":false,"message":"Password reset link is invalid or has expired"}
 *     for a wrong or stale token. This route has NO Turnstile middleware.
 *
 * The token in the e-mailed link is `common.GenerateVerificationCode(0)` — a full 32-char
 * UUID hex — and `VerifyCodeWithKey` compares it byte for byte against an in-memory entry
 * keyed by the normalized (lower-cased, trimmed) address.
 */

/** Seconds the resend / retry control stays locked. */
export const RESET_COUNTDOWN_SECONDS = 30

/** These surfaces own every message, so the shared interceptor must not toast for them. */
const anonymousRequest: ApiRequestConfig = {
  skipAuthRefresh: true,
  skipBusinessError: true,
  skipErrorHandler: true,
}

export function requestPasswordResetEmail(email: string, turnstileToken: string): Promise<null> {
  return getJson<null>('/api/reset_password', {
    ...anonymousRequest,
    // A retry must reach the server; the shared GET de-duplicator would otherwise hand
    // back the in-flight promise for the identical URL.
    disableDuplicate: true,
    params: { email, turnstile: turnstileToken },
  })
}

/**
 * Confirms the e-mailed link and returns the password the SERVER generated.
 *
 * The envelope's `data` is typed `any` on the wire, so the string is checked here rather
 * than trusted: a page that renders a non-string as a credential would show the user
 * something they cannot sign in with.
 */
export async function confirmPasswordReset(email: string, token: string): Promise<string> {
  const password = await postJson<unknown>(
    '/api/user/reset',
    { email, token },
    anonymousRequest,
  )

  if (typeof password !== 'string' || password === '') {
    throw new ApiError('The server did not return a new password.')
  }
  return password
}
