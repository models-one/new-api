/**
 * The OAuth callback routes.
 *
 * `/oauth/$provider` is the redirect URI every `redirect`-kind provider is
 * configured with (`${origin}/oauth/<slug>`); it serves both the login and the
 * bind flow. `/oauth` is WeChat's, which carries its provider in the query
 * string instead of the path.
 *
 * The settings page that opens the bind popup talks to it through
 * `bind-window.ts`: it receives `OAUTH_BIND_CALLBACK_MESSAGE`, performs the
 * exchange with its own session, and answers with `OAUTH_BIND_RESULT_MESSAGE`
 * carrying the same `provider` and `state`.
 */

export { OAuthCallbackPage } from '@/features/auth/callback/OAuthCallbackPage'
export { WeChatCallbackPage } from '@/features/auth/callback/WeChatCallbackPage'
export { CallbackScreen } from '@/features/auth/callback/CallbackScreen'
export {
  exchangeOAuthLogin,
  exchangeWeChatLogin,
  type OAuthCallbackQuery,
  type OAuthExchangeResult,
} from '@/features/auth/callback/api'
export {
  OAUTH_BIND_CALLBACK_MESSAGE,
  OAUTH_BIND_RESPONSE_TIMEOUT_MS,
  OAUTH_BIND_RESULT_MESSAGE,
  TELEGRAM_BIND_RESULT_MESSAGE,
  buildBindCallbackMessage,
  isOAuthBindResult,
  parseTelegramBindCallback,
  postTelegramBindResult,
  type OAuthBindCallbackMessage,
  type OAuthBindResultMessage,
  type TelegramBindCallback,
} from '@/features/auth/callback/bind-window'
export { providerIdentity } from '@/features/auth/callback/provider-identity'
export { readCallbackQuery, type CallbackQuery } from '@/features/auth/callback/query'
