import { isAuthBundle } from '@/lib/auth-session'
import { api } from '@/lib/http-client'

import type { AuthBundle } from '@/features/auth/types'

export type OAuthCallbackQuery = {
  code: string
  state: string
  error: string
  errorDescription: string
}

/**
 * Either a session to apply, or a message to show. Never a thrown error: the
 * callback pages are the last screen in the flow, and an unhandled rejection
 * there is exactly the blank page this rebuild exists to remove.
 */
export type OAuthExchangeResult =
  | { ok: true; bundle: AuthBundle }
  | { ok: false; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Pulls the server's own explanation out of whatever came back.
 *
 * `GET /api/oauth/:provider` was verified live: it answers HTTP 400 for an
 * unknown provider and HTTP 403 for a bad or replayed `state`, both with a
 * `{ success: false, message }` body, and HTTP 200 with the same shape when the
 * provider itself reported an error. So the message worth showing sits in the
 * body on every path, whether axios resolved or threw.
 */
function readEnvelopeMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const message = payload.message
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return trimmed === '' ? null : trimmed
}

/** `message` is empty when the server explained nothing; the page supplies the wording. */
function toFailure(payload: unknown): OAuthExchangeResult {
  return { ok: false, message: readEnvelopeMessage(payload) ?? '' }
}

function readAxiosBody(error: unknown): unknown {
  if (!isRecord(error)) return undefined
  const response = error.response
  return isRecord(response) ? response.data : undefined
}

function interpret(payload: unknown): OAuthExchangeResult {
  if (isRecord(payload) && payload.success === true && isAuthBundle(payload.data)) {
    return { ok: true, bundle: payload.data }
  }
  return toFailure(payload)
}

/**
 * Completes the login half of an OAuth handshake.
 *
 * Every shared interceptor is switched off on purpose. `skipAuthRefresh` and
 * `skipErrorHandler` matter most: a 401 on this request must not be read as an
 * expired dashboard session and bounce the browser to sign-in mid-callback,
 * because there is no session yet — this request is how one gets created.
 *
 * `disableDuplicate` is NOT set, and that is load-bearing. `model.ConsumeAuthFlow`
 * burns the `state` on the first successful exchange, so a second request with the
 * same state is answered with HTTP 403 "State parameter is empty or mismatched".
 * React's StrictMode runs every effect twice in development, so without the
 * client's in-flight GET de-duplication the second run would fire a real second
 * request and the user would watch a perfectly good sign-in fail. Sharing the
 * in-flight promise means both runs read one exchange.
 */
export async function exchangeOAuthLogin(
  provider: string,
  query: OAuthCallbackQuery,
): Promise<OAuthExchangeResult> {
  try {
    const response = await api.get(`/api/oauth/${encodeURIComponent(provider)}`, {
      params: {
        code: query.code === '' ? undefined : query.code,
        state: query.state,
        error: query.error === '' ? undefined : query.error,
        error_description: query.errorDescription === '' ? undefined : query.errorDescription,
      },
      skipAuthRefresh: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    })
    return interpret(response.data)
  } catch (error: unknown) {
    return toFailure(readAxiosBody(error))
  }
}

/**
 * Completes a WeChat official-account sign-in.
 *
 * `GET /api/oauth/wechat` (`controller.WeChatAuth`) rather than
 * `/api/oauth/:provider`: WeChat hands back a verification code the user typed,
 * not an OAuth authorization code, and the route has no `state` to validate.
 * Verified live — with WeChat login off it answers HTTP 200 with
 * `{"success":false,"message":"管理员未开启通过微信登录以及注册"}`, so the
 * refusal only ever arrives in the body.
 *
 * Deliberately self-contained rather than routed through a shared helper: this
 * is the only caller in the console, and the interceptor opt-outs below are the
 * whole reason the call is written out.
 */
export async function exchangeWeChatLogin(code: string): Promise<OAuthExchangeResult> {
  try {
    const response = await api.get('/api/oauth/wechat', {
      params: { code },
      skipAuthRefresh: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    })
    return interpret(response.data)
  } catch (error: unknown) {
    return toFailure(readAxiosBody(error))
  }
}
