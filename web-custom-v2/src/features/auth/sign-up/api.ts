import { getJson, postJson } from '@/lib/api/client'

import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * Registration and its e-mail verification step.
 *
 * Verified against the running backend (`controller/user.go#Register`,
 * `controller/misc.go#SendEmailVerification`, `router/api-router.go`):
 *
 *   POST /api/user/register?turnstile=<token>
 *     body {username, password, email?, verification_code?, aff_code?}
 *     -> {"success":true,"message":""} with NO `data`
 *     Server rules actually observed:
 *       - refused outright when `register_enabled` or `password_register_enabled` is off
 *       - `Username` max 20, `Password` min 8 / max 20, `Email` max 50 (go-playground tags
 *         on `model.User`); a violation answers
 *         `Invalid input Key: 'User.Password' Error:Field validation ... 'min' tag`
 *       - a taken name answers "Username already exists or has been deleted"
 *       - `email` / `verification_code` are read ONLY while `email_verification` is on;
 *         with the flag off the server drops the address instead of storing it, so this
 *         module omits both fields rather than sending values that would be ignored
 *       - success does NOT authenticate: no bundle, no cookie. The caller sends the user
 *         to the sign-in page.
 *
 *   GET /api/verification?email=<address>&turnstile=<token>
 *     -> {"success":true,"message":""}; failures answer `success:false` with a message
 *        ("Invalid parameters", "invalid SMTP account", a whitelist/alias rejection…).
 *     The code is 6 characters of a UUID's hex (`common.GenerateVerificationCode(6)`) and
 *     is compared byte for byte by `VerifyCodeWithKey`.
 *
 * Both routes sit behind `middleware.TurnstileCheck()`, which reads the `turnstile` QUERY
 * parameter — never the body — and only when the operator enabled the check. Cloudflare
 * burns a token on the first siteverify call, so a token spent here cannot be reused.
 */

/** `model.User` validation tags, mirrored so the form never sends a request the server refuses. */
export const USERNAME_MAX_LENGTH = 20
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 20
export const EMAIL_MAX_LENGTH = 50
/** `common.GenerateVerificationCode(6)`. */
export const VERIFICATION_CODE_LENGTH = 6
/** Seconds the resend control stays locked after a code was sent. */
export const RESEND_COUNTDOWN_SECONDS = 30

export type RegisterPayload = {
  username: string
  password: string
  email?: string
  verification_code?: string
  aff_code?: string
}

/** These surfaces own every message, so the shared interceptor must not toast for them. */
const anonymousRequest: ApiRequestConfig = {
  skipAuthRefresh: true,
  skipBusinessError: true,
  skipErrorHandler: true,
}

export function registerAccount(payload: RegisterPayload, turnstileToken: string): Promise<null> {
  return postJson<null>('/api/user/register', payload, {
    ...anonymousRequest,
    params: { turnstile: turnstileToken },
  })
}

export function sendEmailVerificationCode(email: string, turnstileToken: string): Promise<null> {
  return getJson<null>('/api/verification', {
    ...anonymousRequest,
    // A resend must reach the server; the shared GET de-duplicator would otherwise hand
    // back the in-flight promise for the identical URL.
    disableDuplicate: true,
    params: { email, turnstile: turnstileToken },
  })
}
