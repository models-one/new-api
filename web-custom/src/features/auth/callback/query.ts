/**
 * The query string of an OAuth callback, read straight off the URL.
 *
 * These pages are only ever reached by a provider redirecting the browser to
 * them, so the parameters are whatever the provider put there — including keys
 * no route schema declares (`error_description`, `telegram_bind`). Reading the
 * raw search string keeps every one of them intact and keeps the pages usable
 * without a validated search schema per provider.
 *
 * Every value is untrusted. `redirect` in particular only ever reaches
 * `sanitizeAuthRedirect`, never a navigation directly.
 */
export type CallbackQuery = {
  code: string
  state: string
  /** The provider's own error code, e.g. `access_denied`. */
  error: string
  errorDescription: string
  redirect: string
  /** WeChat-style callbacks name their provider in the query rather than the path. */
  provider: string
  /** Telegram bind results, produced by `GET /api/oauth/telegram/bind/:flow_token`. */
  telegramBind: string
  flowToken: string
  errorCode: string
}

function read(params: URLSearchParams, key: string): string {
  return params.get(key) ?? ''
}

export function readCallbackQuery(search: string): CallbackQuery {
  const params = new URLSearchParams(search)
  return {
    code: read(params, 'code'),
    state: read(params, 'state'),
    error: read(params, 'error'),
    errorDescription: read(params, 'error_description'),
    redirect: read(params, 'redirect'),
    provider: read(params, 'provider'),
    telegramBind: read(params, 'telegram_bind'),
    flowToken: read(params, 'flow_token'),
    errorCode: read(params, 'error_code'),
  }
}
