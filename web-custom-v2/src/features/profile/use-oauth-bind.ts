import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from '@/components/overlay'
import { createOAuthState } from '@/features/auth/api'
import {
  OAUTH_BIND_CALLBACK_MESSAGE,
  OAUTH_BIND_RESULT_MESSAGE,
} from '@/features/auth/callback/bind-window'
import { api } from '@/lib/http-client'

import type { OAuthProviderDescriptor } from '@/features/auth/oauth-providers'

/**
 * The opener half of the OAuth bind handshake.
 *
 * `GET /api/oauth/:provider` refuses a `bind` flow unless the request carries the dashboard
 * session that minted the state (controller/oauth.go), and the popup has none. So the popup
 * forwards `code`/`state` here, THIS page performs the exchange with its own credentials,
 * and the verdict is posted back. `features/auth/callback/bind-window.ts` defines both
 * message shapes; the popup side is already built.
 *
 * Deliberately NOT built on `startRedirectOAuth`: that helper calls `resetAuthSession()`
 * first, which is right for signing in and catastrophic here — it would sign the user out
 * of the very session the bind needs.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type BindCallback = {
  provider: string
  state: string
  code: string
  error: string
  errorDescription: string
}

/**
 * Whether a message is this attempt's callback. The provider and state checks are not
 * decoration: any page holding a handle to this window can post to it, and a stale message
 * from an abandoned attempt must not be exchanged.
 */
export function readBindCallback(
  value: unknown,
  provider: string,
  state: string,
): BindCallback | null {
  if (!isRecord(value)) return null
  if (value.type !== OAUTH_BIND_CALLBACK_MESSAGE) return null
  if (value.provider !== provider || value.state !== state) return null

  const text = (key: string): string => (typeof value[key] === 'string' ? value[key] : '')
  return {
    provider,
    state,
    code: text('code'),
    error: text('error'),
    errorDescription: text('errorDescription'),
  }
}

export type BindOutcome = { success: boolean; message: string }

/**
 * `GET /api/oauth/:provider` answers `{ success, message }` on every path — HTTP 200 when
 * the provider itself reported an error, 400 for an unknown provider, 403 for a spent or
 * mismatched state — so the explanation always sits in the body, whether axios resolved or
 * threw. An empty message means the caller supplies the wording.
 */
export function readBindOutcome(payload: unknown): BindOutcome {
  if (!isRecord(payload)) return { success: false, message: '' }
  const message = typeof payload.message === 'string' ? payload.message.trim() : ''
  return { success: payload.success === true, message }
}

function readAxiosBody(error: unknown): unknown {
  if (!isRecord(error)) return undefined
  const response = error.response
  return isRecord(response) ? response.data : undefined
}

async function exchangeBind(callback: BindCallback): Promise<BindOutcome> {
  try {
    const response = await api.get(`/api/oauth/${encodeURIComponent(callback.provider)}`, {
      params: {
        code: callback.code === '' ? undefined : callback.code,
        state: callback.state,
        error: callback.error === '' ? undefined : callback.error,
        error_description: callback.errorDescription === '' ? undefined : callback.errorDescription,
      },
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    })
    return readBindOutcome(response.data)
  } catch (error: unknown) {
    return readBindOutcome(readAxiosBody(error))
  }
}

type PendingBind = {
  descriptor: OAuthProviderDescriptor
  popup: Window
  state: string
  /** Cancels the "did the user close the popup?" watcher. */
  stopWatching: () => void
}

const POPUP_FEATURES = 'width=620,height=760,noopener=no,noreferrer=no'
const POPUP_CLOSE_POLL_MS = 500

export type UseOAuthBindOptions = {
  /** Runs after a successful exchange; refetch the account here. */
  onBound: (descriptor: OAuthProviderDescriptor) => void | Promise<void>
  /** Seam for tests. Defaults to `window.open`. */
  openWindow?: (url: string, features: string) => Window | null
}

export type UseOAuthBindResult = {
  /** Id of the provider whose popup is open, or null. */
  pendingProviderId: string | null
  start: (descriptor: OAuthProviderDescriptor) => void
}

export function useOAuthBind(options: UseOAuthBindOptions): UseOAuthBindResult {
  const { onBound, openWindow } = options
  const { t } = useTranslation()

  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null)
  const pending = useRef<PendingBind | null>(null)
  const onBoundRef = useRef(onBound)

  useEffect(() => {
    onBoundRef.current = onBound
  })

  const clearPending = useCallback((expected?: PendingBind) => {
    const current = pending.current
    if (current === null) return
    if (expected !== undefined && current !== expected) return
    current.stopWatching()
    pending.current = null
    setPendingProviderId(null)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return

      const current = pending.current
      if (current === null || event.source !== current.popup) return

      const callback = readBindCallback(event.data, current.descriptor.provider, current.state)
      if (callback === null) return

      const { descriptor, popup } = current
      clearPending(current)

      void (async () => {
        const outcome = await exchangeBind(callback)

        // Tell the popup before anything else: it is showing a spinner and gives up
        // after 30 seconds (OAUTH_BIND_RESPONSE_TIMEOUT_MS).
        if (!popup.closed) {
          popup.postMessage(
            {
              type: OAUTH_BIND_RESULT_MESSAGE,
              provider: descriptor.provider,
              state: callback.state,
              success: outcome.success,
              message: outcome.message,
            },
            window.location.origin,
          )
        }

        if (!outcome.success) {
          toast.error(
            outcome.message === ''
              ? t('{{provider}} could not be linked. Please try again.', { provider: descriptor.name })
              : outcome.message,
          )
          return
        }

        toast.success(t('{{provider}} is now linked to your account.', { provider: descriptor.name }))
        await onBoundRef.current(descriptor)
      })()
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [clearPending, t])

  // Closing the popup by hand has to end the pending state, or the button stays busy forever.
  useEffect(() => () => {
    const current = pending.current
    if (current === null) return
    current.stopWatching()
    if (!current.popup.closed) current.popup.close()
    pending.current = null
  }, [])

  const start = useCallback((descriptor: OAuthProviderDescriptor) => {
    const buildAuthorizationUrl = descriptor.buildAuthorizationUrl
    if (descriptor.kind !== 'redirect' || buildAuthorizationUrl === undefined) return

    const previous = pending.current
    if (previous !== null) {
      clearPending(previous)
      if (!previous.popup.closed) previous.popup.close()
    }

    // Opened synchronously, before any await: a popup opened from an async continuation is
    // blocked by every browser.
    const open = openWindow ?? ((url: string, features: string) => window.open(url, '_blank', features))
    const popup = open('', POPUP_FEATURES)
    if (popup === null) {
      toast.error(t('The pop-up was blocked. Allow pop-ups for this site and try again.'))
      return
    }

    const timer = globalThis.setInterval(() => {
      if (pending.current?.popup.closed === true) clearPending(pending.current)
    }, POPUP_CLOSE_POLL_MS)

    const attempt: PendingBind = {
      descriptor,
      popup,
      state: '',
      stopWatching: () => globalThis.clearInterval(timer),
    }
    pending.current = attempt
    setPendingProviderId(descriptor.id)

    void (async () => {
      try {
        const state = await createOAuthState(descriptor.provider, 'bind')
        if (pending.current !== attempt || popup.closed) return
        attempt.state = state
        popup.location.replace(buildAuthorizationUrl({ state, origin: window.location.origin }))
      } catch (error: unknown) {
        const wasCurrent = pending.current === attempt
        clearPending(attempt)
        if (!popup.closed) popup.close()
        if (wasCurrent) toast.error(error)
      }
    })()
  }, [clearPending, openWindow, t])

  return { pendingProviderId, start }
}
