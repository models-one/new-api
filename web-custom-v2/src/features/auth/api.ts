import axios from 'axios'

import { readReferralCode } from '@/features/auth/referral'
import type { TelegramAuthorization } from '@/features/auth/telegram'
import { clearAuthenticatedClientState, refreshAuthentication, type RefreshOutcome } from '@/lib/auth-session'
import { api } from '@/lib/http-client'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'

export type ApiResponse<T = unknown> = {
  success: boolean
  message?: string
  data?: T
  /**
   * Machine-readable failure code. The auth-session endpoints set it (see
   * `service/auth_session.go#authSessionErrorCode`) and leave `message` as the bare
   * HTTP status text, so anything user-facing has to be derived from this, not from
   * `message`.
   */
  code?: string
}

type LogoutRuntime = {
  getExpectedSid: () => string | undefined
  request: (expectedSid?: string) => Promise<ApiResponse>
  refresh: () => Promise<RefreshOutcome>
}

export async function executeLogout(runtime: LogoutRuntime, allowMismatchRecovery = true): Promise<ApiResponse> {
  try {
    return await runtime.request(runtime.getExpectedSid())
  } catch (error: unknown) {
    const code = axios.isAxiosError(error) ? error.response?.data?.code : undefined
    if (
      allowMismatchRecovery
      && axios.isAxiosError(error)
      && error.response?.status === 409
      && code === 'AUTH_SESSION_MISMATCH'
    ) {
      const outcome = await runtime.refresh()
      if (outcome.kind === 'authenticated') return executeLogout(runtime, false)
      if (outcome.kind === 'anonymous') return { success: true, message: '' }
    }
    throw error
  }
}

export async function logout(): Promise<ApiResponse> {
  const result = await executeLogout({
    getExpectedSid: () => useAuthStore.getState().auth.session?.sid,
    request: async (sid) => {
      const response = await api.post('/api/user/auth/logout', undefined, {
        headers: sid ? { 'X-Auth-Session': sid } : undefined,
        skipAuthRefresh: true,
        skipErrorHandler: true,
      })
      return response.data
    },
    refresh: refreshAuthentication,
  })

  if (result.success) clearAuthenticatedClientState(queryClient)
  return result
}

// ---------------------------------------------------------------------------
// OAuth, WeChat, Telegram and passkey calls used by the authentication pages.
//
// These deliberately opt out of the global toast (`skipBusinessError`,
// `skipErrorHandler`) and return the raw envelope. Authentication surfaces need
// to branch on `success` themselves — a failed sign-in is a form state, not a
// floating notification — so the caller owns every message.
// ---------------------------------------------------------------------------

export type OAuthIntent = 'login' | 'bind'

/** `controller/oauth.go` rejects a state request whose `aff` exceeds this length. */
const OAUTH_STATE_MAX_AFFILIATE_LENGTH = 32

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Exchanges provider + intent for the single-use CSRF state token that
 * `POST /api/oauth/state` mints. The referral code rides along on a login so a
 * user who arrived through a referral link still gets credited after the
 * provider round trip.
 *
 * Verified against the dev server: the payload is `{ flow_token, expires_at }`.
 * The bare-string branch covers the older response shape.
 */
export async function createOAuthState(provider: string, intent: OAuthIntent): Promise<string> {
  // The server rejects the whole request when `aff` is longer than 32 characters
  // (controller/oauth.go), so a junk referral code must not take sign-in down with it.
  const storedCode = intent === 'login' ? readReferralCode() : ''
  const referralCode = storedCode.length > OAUTH_STATE_MAX_AFFILIATE_LENGTH ? '' : storedCode

  const response = await api.post<ApiResponse<unknown>>(
    '/api/oauth/state',
    { provider, intent, aff: referralCode === '' ? undefined : referralCode },
    { skipAuthRefresh: intent === 'login', skipBusinessError: true, skipErrorHandler: true },
  )

  const body = response.data
  if (body?.success) {
    if (typeof body.data === 'string' && body.data !== '') return body.data
    if (isRecord(body.data) && typeof body.data.flow_token === 'string' && body.data.flow_token !== '') {
      return body.data.flow_token
    }
  }

  throw new Error(body?.message || 'Failed to initialize OAuth')
}

/** Exchanges a WeChat official-account verification code for an auth bundle. */
export async function wechatLoginByCode(code: string): Promise<ApiResponse> {
  const response = await api.get('/api/oauth/wechat', {
    params: { code },
    disableDuplicate: true,
    skipAuthRefresh: true,
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  return response.data
}

/** Exchanges a signed Telegram widget authorization for an auth bundle. */
export async function telegramLogin(authorization: TelegramAuthorization): Promise<ApiResponse> {
  const response = await api.get('/api/oauth/telegram/login', {
    params: authorization,
    disableDuplicate: true,
    skipAuthRefresh: true,
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  return response.data
}

/** `data.options` is Go's `protocol.CredentialAssertion`, i.e. `{ publicKey: {...} }`. */
export type PasskeyChallenge = {
  options?: unknown
  flow_token?: string
  expires_at?: number
}

export async function beginPasskeyLogin(): Promise<ApiResponse<PasskeyChallenge>> {
  const response = await api.post<ApiResponse<PasskeyChallenge>>(
    '/api/user/passkey/login/begin',
    undefined,
    { skipAuthRefresh: true, skipBusinessError: true, skipErrorHandler: true },
  )
  return response.data
}

export async function finishPasskeyLogin(
  flowToken: string,
  credential: Record<string, unknown>,
): Promise<ApiResponse> {
  const response = await api.post(
    '/api/user/passkey/login/finish',
    { flow_token: flowToken, credential },
    { skipAuthRefresh: true, skipBusinessError: true, skipErrorHandler: true },
  )
  return response.data
}
