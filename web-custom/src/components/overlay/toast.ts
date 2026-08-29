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
export function toErrorMessage(error: unknown, fallback?: string): string {
  const resolvedFallback = fallback ?? t('Request failed')

  if (typeof error === 'string') {
    const trimmed = error.trim()
    return trimmed.length > 0 ? trimmed : resolvedFallback
  }

  if (axios.isAxiosError(error)) {
    return envelopeMessage(error.response?.data)
      ?? (error.message.trim().length > 0 ? error.message : resolvedFallback)
  }

  if (error instanceof Error) {
    return error.message.trim().length > 0 ? error.message : resolvedFallback
  }

  return envelopeMessage(error) ?? resolvedFallback
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
