import { isAuthBundle } from '@/lib/auth-session'
import { api } from '@/lib/http-client'

import type { ApiResponse } from '@/features/auth/api'
import type { AuthBundle } from '@/features/auth/types'

/**
 * Password sign-in.
 *
 * Verified live against the dev backend (`controller/user.go` `Login`):
 *
 *   POST /api/user/login?turnstile=<token>   body {username, password}
 *     -> {"success":true,"message":"","data":{access_token,token_type,access_expires_at,user,session}}
 *     -> {"success":true,"data":{"require_2fa":true,"flow_token":"…","expires_at":1788010374}}
 *        when the account has 2FA enabled: HTTP 200, `success: true`, and NO auth bundle.
 *     -> {"success":false,"message":"Username or password is incorrect, or user has been banned"}
 *        ALSO HTTP 200 — a rejected password is a business error here, never a 4xx. A page
 *        that only branches on the HTTP status treats a wrong password as a success.
 *
 * The Turnstile token has to ride in the query string: `middleware/turnstile-check.go`
 * reads it with `c.Query("turnstile")` and ignores a body field. The check is enforced
 * server-side, so sending the token is not optional when the operator enabled it.
 */

export type PasswordLoginInput = {
  username: string
  password: string
  /** Cloudflare Turnstile token. Sent empty when the operator has the check off. */
  turnstile: string
}

/**
 * Posts the credentials and returns the raw envelope.
 *
 * Every global handler is opted out of on purpose: a failed sign-in is form state, not a
 * floating toast, and a 401 here must not kick off the session-refresh machinery.
 */
export async function passwordLogin(input: PasswordLoginInput): Promise<ApiResponse<unknown>> {
  const response = await api.post<ApiResponse<unknown>>(
    '/api/user/login',
    { username: input.username, password: input.password },
    {
      params: { turnstile: input.turnstile },
      skipAuthRefresh: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    },
  )
  return response.data
}

/** What a login envelope actually means. */
export type LoginOutcome =
  /** Signed in: apply the bundle. */
  | { kind: 'authenticated'; bundle: AuthBundle }
  /** Credentials accepted, second factor required. */
  | { kind: 'two-factor'; flowToken: string; expiresAt: number | null }
  /**
   * The server refused. `message` may be empty, and for auth-session failures it is
   * only the HTTP status text ("Conflict"), so `code` is the field worth branching on.
   */
  | { kind: 'rejected'; message: string; code: string }
  /** `require_2fa` without a usable flow token — the challenge cannot be continued. */
  | { kind: 'flow-expired' }
  /** `success: true` with a payload that is neither a bundle nor a challenge. */
  | { kind: 'unreadable' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Classifies a `/api/user/login` envelope.
 *
 * Kept pure and separate from the form so the four branches the backend can return are
 * testable without a DOM. The 2FA branch is checked BEFORE the bundle check: it arrives
 * with `success: true` and would otherwise fall through to "unreadable".
 */
export function readLoginOutcome(response: ApiResponse<unknown> | null | undefined): LoginOutcome {
  if (!response || response.success !== true) {
    return {
      kind: 'rejected',
      message: response?.message?.trim() ?? '',
      code: response?.code?.trim() ?? '',
    }
  }

  const data: unknown = response.data

  if (isRecord(data) && data.require_2fa === true) {
    const flowToken = typeof data.flow_token === 'string' ? data.flow_token.trim() : ''
    if (flowToken === '') return { kind: 'flow-expired' }
    return {
      kind: 'two-factor',
      flowToken,
      expiresAt: typeof data.expires_at === 'number' ? data.expires_at : null,
    }
  }

  if (isAuthBundle(data)) return { kind: 'authenticated', bundle: data }

  return { kind: 'unreadable' }
}

export type SignInCredentials = {
  username: string
  password: string
}

export type SignInFieldError = 'username-required' | 'password-required'

export type SignInFieldErrors = Partial<Record<'username' | 'password', SignInFieldError>>

/**
 * Client-side credential check. Mirrors the legacy form schema: both fields are simply
 * required. No length or shape rule is applied — the backend accepts a username OR an
 * email here, and guessing at a format would reject accounts the server would allow.
 */
export function validateSignInCredentials(values: SignInCredentials): SignInFieldErrors {
  const errors: SignInFieldErrors = {}
  if (values.username.trim() === '') errors.username = 'username-required'
  if (values.password === '') errors.password = 'password-required'
  return errors
}
