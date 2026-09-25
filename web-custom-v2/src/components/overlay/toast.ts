import axios from 'axios'
import { t } from 'i18next'
import { toast as sonnerToast, type ExternalToast } from 'sonner'

/**
 * Toast helpers for the console.
 *
 * IMPORTANT — do not double-toast. `src/lib/http-client.ts` already toasts:
 *   - business errors (`{ success: false, message }` envelopes) unless `skipBusinessError`
 *   - transport/HTTP errors and expired sessions unless `skipErrorHandler`
 * So a plain `api.get(...)` failure has ALREADY shown a toast by the time your
 * catch block runs. Only call `toast.error(error)` when the request opted out with
 * `{ skipErrorHandler: true }` (or `{ skipBusinessError: true }`) and the caller owns
 * the messaging — for example inline form errors, retryable mutations, or a flow that
 * needs a domain-specific message instead of the raw server one.
 */

type ToastOptions = ExternalToast

type PromiseToastMessages<TData> = {
  loading: string
  success: string | ((data: TData) => string)
  /** Defaults to `toErrorMessage(error)`. */
  error?: string | ((error: unknown) => string)
}

/**
 * Copy for the server error codes whose `message` is only an HTTP reason phrase.
 *
 * `/api/user/login` answers a session-cap refusal with `{ code: 'AUTH_SESSION_LIMIT',
 * message: 'Conflict' }`, and rendering the message put the single word "Conflict" in
 * the sign-in form. The legacy console carries the same table at
 * `web/src/lib/server-error-message.ts`; keep the two in step when either gains a code.
 */
const serverErrorCodeMessages: Record<string, () => string> = {
  AUTH_SESSION_LIMIT: () =>
    t('You are signed in on too many devices. On one of them, go to Account → Security → Active sessions and choose “Sign out other sessions” — or reset your password, which signs out everything.'),
  AUTH_SESSION_ISSUANCE_LIMIT: () =>
    t('Too many sign-ins from here in a short time. Wait a few minutes and try again.'),
  TELEGRAM_BIND_DISABLED: () => t('Telegram sign-in is switched off on this deployment.'),
  TELEGRAM_BIND_INVALID_REQUEST: () => t('That Telegram authorization is invalid or has expired.'),
  TELEGRAM_BIND_FLOW_INVALID: () => t('That Telegram link has expired or has already been used.'),
  TELEGRAM_BIND_SESSION_INVALID: () =>
    t('The sign-in that started this Telegram link is no longer valid. Start again.'),
  TELEGRAM_BIND_ALREADY_BOUND: () => t('That Telegram account is already linked to an account.'),
  TELEGRAM_BIND_USER_DELETED: () => t('That account no longer exists.'),
  TELEGRAM_BIND_USER_DISABLED: () => t('That account is disabled.'),
  TELEGRAM_BIND_INTERNAL_ERROR: () => t('Telegram linking failed. Try again.'),
}

function codeMessage(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const code = (payload as { code?: unknown }).code
  if (typeof code !== 'string') return undefined
  return serverErrorCodeMessages[code]?.()
}

function envelopeMessage(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const message = (payload as { message?: unknown }).message
  if (typeof message !== 'string') return undefined
  const trimmed = message.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Turns anything thrown — an axios error carrying the `{ success, message }` envelope,
 * a plain `Error`, a string, a bare envelope object — into a message worth showing.
 */
/**
 * Copy for the transport failures that carry no `{ success, message }` envelope.
 *
 * Without this the axios message reaches the user verbatim — a sign-in form that has hit
 * the server's rate limit renders the literal string "Request failed with status code
 * 429", which names an implementation detail and tells nobody what to do next.
 */
function httpStatusMessage(status: number | undefined): string | undefined {
  switch (status) {
    case 401:
      return t('Your session has expired. Sign in again to continue.')
    case 403:
      return t('You do not have permission to do that.')
    case 404:
      return t('That resource no longer exists.')
    case 408:
      return t('The server took too long to answer. Try again.')
    case 429:
      return t('Too many attempts. Wait a few minutes and try again.')
    case 502:
    case 503:
    case 504:
      return t('The service is temporarily unavailable. Try again shortly.')
    default:
      return status !== undefined && status >= 500
        ? t('The server could not complete this request.')
        : undefined
  }
}

export function toErrorMessage(error: unknown, fallback?: string): string {
  const resolvedFallback = fallback ?? t('Request failed')

  if (typeof error === 'string') {
    const trimmed = error.trim()
    return trimmed.length > 0 ? trimmed : resolvedFallback
  }

  if (axios.isAxiosError(error)) {
    // The code wins over the message: the server pairs a specific code with a generic
    // reason phrase, and the phrase on its own tells the reader nothing to act on.
    return codeMessage(error.response?.data)
      ?? envelopeMessage(error.response?.data)
      ?? httpStatusMessage(error.response?.status)
      ?? (error.message.trim().length > 0 ? error.message : resolvedFallback)
  }

  if (error instanceof Error) {
    return error.message.trim().length > 0 ? error.message : resolvedFallback
  }

  return codeMessage(error) ?? envelopeMessage(error) ?? resolvedFallback
}

export const toast = {
  success(message: string, options?: ToastOptions) {
    return sonnerToast.success(message, options)
  },
  /** Accepts a message or any thrown value; unknown values go through `toErrorMessage`. */
  error(error: unknown, options?: ToastOptions) {
    return sonnerToast.error(toErrorMessage(error), options)
  },
  info(message: string, options?: ToastOptions) {
    return sonnerToast.info(message, options)
  },
  warning(message: string, options?: ToastOptions) {
    return sonnerToast.warning(message, options)
  },
  dismiss(id?: number | string) {
    return sonnerToast.dismiss(id)
  },
  promise<TData>(
    promise: Promise<TData> | (() => Promise<TData>),
    messages: PromiseToastMessages<TData>,
    options?: ToastOptions,
  ) {
    const errorMessage = messages.error
    return sonnerToast.promise(promise, {
      ...options,
      error: (error: unknown) => {
        if (typeof errorMessage === 'string') return errorMessage
        if (typeof errorMessage === 'function') return errorMessage(error)
        return toErrorMessage(error)
      },
      loading: messages.loading,
      success: messages.success,
    })
  },
}
