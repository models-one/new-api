/**
 * The popup protocol for binding an OAuth account to a signed-in user.
 *
 * `GET /api/oauth/:provider` refuses a `bind` flow unless the request carries the
 * dashboard session that created it (`controller/oauth.go`), and the popup has no
 * access token of its own. So the popup never calls the backend: it hands the
 * `code`/`state` pair to the window that opened it, the opener performs the
 * exchange with its own credentials, and the verdict comes back the same way.
 *
 * Every message is posted to and accepted from `window.location.origin` only.
 */

export const OAUTH_BIND_CALLBACK_MESSAGE = 'oauth:binding:callback'
export const OAUTH_BIND_RESULT_MESSAGE = 'oauth:binding:result'
export const TELEGRAM_BIND_RESULT_MESSAGE = 'telegram:binding:result'

/** How long the popup waits for the opener before it gives up. */
export const OAUTH_BIND_RESPONSE_TIMEOUT_MS = 30_000

/** What the popup hands the opener. */
export type OAuthBindCallbackMessage = {
  type: typeof OAUTH_BIND_CALLBACK_MESSAGE
  provider: string
  code: string
  state: string
  error?: string
  errorDescription?: string
}

/** What the opener hands back once it has called the backend. */
export type OAuthBindResultMessage = {
  type: typeof OAUTH_BIND_RESULT_MESSAGE
  provider: string
  state: string
  success: boolean
  message?: string
}

type OpenerWindow = Pick<Window, 'closed' | 'postMessage'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a message is this popup's verdict.
 *
 * The `provider` and `state` checks are not decoration: a page can receive
 * messages from anything it opened or that opened it, and a stale result from an
 * earlier attempt would otherwise close the window on the wrong answer.
 */
export function isOAuthBindResult(
  value: unknown,
  provider: string,
  state: string,
): value is OAuthBindResultMessage {
  if (!isRecord(value)) return false
  return (
    value.type === OAUTH_BIND_RESULT_MESSAGE
    && value.provider === provider
    && value.state === state
    && typeof value.success === 'boolean'
  )
}

export function buildBindCallbackMessage(input: {
  provider: string
  code: string
  state: string
  error: string
  errorDescription: string
}): OAuthBindCallbackMessage {
  return {
    type: OAUTH_BIND_CALLBACK_MESSAGE,
    provider: input.provider,
    code: input.code,
    state: input.state,
    error: input.error === '' ? undefined : input.error,
    errorDescription: input.errorDescription === '' ? undefined : input.errorDescription,
  }
}

/**
 * Telegram does not come back through the OAuth callback: `GET
 * /api/oauth/telegram/bind/:flow_token` performs the bind server-side and then
 * redirects the popup here with its verdict already decided.
 */
export type TelegramBindCallback =
  | { kind: 'result'; flowToken: string; success: boolean; code?: string }
  | { kind: 'invalid' }
  | null

export function parseTelegramBindCallback(search: {
  telegram_bind?: string
  flow_token?: string
  error_code?: string
}): TelegramBindCallback {
  if (search.telegram_bind !== 'success' && search.telegram_bind !== 'error') return null
  if (search.flow_token === undefined || search.flow_token === '') return { kind: 'invalid' }

  if (search.telegram_bind === 'success') {
    return { kind: 'result', flowToken: search.flow_token, success: true }
  }
  return {
    kind: 'result',
    flowToken: search.flow_token,
    success: false,
    code: search.error_code,
  }
}

/** Returns false when there was nothing usable to post, or no live opener to post it to. */
export function postTelegramBindResult(
  callback: TelegramBindCallback,
  opener: OpenerWindow | null,
  targetOrigin: string,
): boolean {
  if (callback?.kind !== 'result') return false
  if (opener === null || opener.closed) return false

  opener.postMessage(
    {
      type: TELEGRAM_BIND_RESULT_MESSAGE,
      flow_token: callback.flowToken,
      success: callback.success,
      code: callback.code,
    },
    targetOrigin,
  )
  return true
}
