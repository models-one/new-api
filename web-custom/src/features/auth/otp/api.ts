import { api } from '@/lib/http-client'

import type { ApiResponse } from '@/features/auth/api'

export type TwoFactorLoginPayload = {
  /** A six-digit TOTP or an eight-character backup code. `controller.Verify2FARequest`. */
  code: string
  flow_token: string
}

/**
 * Completes a login that stopped at the second factor.
 *
 * Verified against the dev server: this endpoint answers HTTP 200 for every
 * outcome and puts the verdict in `success`, including for an expired flow token
 * ("会话已过期，请重新登录") and a wrong code. It opts out of every shared
 * interceptor because the challenge form owns its own messaging — a rejected
 * code belongs next to the field, not in a floating toast — and because a 401
 * here must never be read as "the session lapsed, bounce to sign-in": there is
 * no session yet.
 */
export async function verifyTwoFactorLogin(payload: TwoFactorLoginPayload): Promise<ApiResponse> {
  const response = await api.post<ApiResponse>('/api/user/login/2fa', payload, {
    skipAuthRefresh: true,
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  return response.data
}
