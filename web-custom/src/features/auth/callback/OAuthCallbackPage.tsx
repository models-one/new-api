import { Link, useNavigate, useParams } from '@tanstack/react-router'
import i18next from 'i18next'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from '@/components/overlay/toast'
import { Button } from '@/components/ui/Button'
import { getSavedLanguage, resolveAuthRedirect } from '@/features/auth/auth-redirect'
import { exchangeOAuthLogin } from '@/features/auth/callback/api'
import {
  OAUTH_BIND_RESPONSE_TIMEOUT_MS,
  buildBindCallbackMessage,
  isOAuthBindResult,
  parseTelegramBindCallback,
  postTelegramBindResult,
} from '@/features/auth/callback/bind-window'
import { CallbackScreen } from '@/features/auth/callback/CallbackScreen'
import { providerIdentity } from '@/features/auth/callback/provider-identity'
import { readCallbackQuery } from '@/features/auth/callback/query'
import { applyAuthBundle } from '@/lib/auth-session'

import type { OAuthExchangeResult } from '@/features/auth/callback/api'

type CallbackMode = 'login' | 'bind'

type FailureReason =
  | 'missing_code'
  | 'exchange_failed'
  | 'opener_unavailable'
  | 'bind_timeout'
  | 'bind_rejected'
  | 'telegram_incomplete'

type Phase =
  | { kind: 'working' }
  | { kind: 'linked' }
  | { kind: 'failed'; reason: FailureReason; serverMessage: string }

function detectMode(): CallbackMode {
  if (typeof window === 'undefined') return 'login'
  return window.opener === null || window.opener === undefined ? 'login' : 'bind'
}

/**
 * `/oauth/$provider` — where every redirect provider comes back to.
 *
 * The route is dual-mode, and the mode is decided by whether this document has
 * an opener, because the same URL is registered as the provider's redirect URI
 * for both flows:
 *
 * LOGIN (a normal tab) exchanges `code`/`state` at `GET /api/oauth/:provider`,
 * applies the returned bundle and continues into the console.
 *
 * BIND (a popup) never calls the backend: that endpoint requires the dashboard
 * session that opened the flow, which the popup does not have. It hands the pair
 * to its opener and waits for the verdict.
 *
 * Telegram is a third shape again — the backend performs the bind itself and
 * redirects here with the answer already in the query string.
 */
export function OAuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { provider } = useParams({ from: '/oauth/$provider' })

  // Read once: `window.opener` is cleared when the opener navigates away, and a
  // popup that re-decided its mode halfway through would start calling an
  // endpoint that is guaranteed to reject it.
  const [mode] = useState<CallbackMode>(detectMode)
  const [phase, setPhase] = useState<Phase>({ kind: 'working' })

  /**
   * The exchange, started at most once for the life of this page.
   *
   * `model.ConsumeAuthFlow` burns the `state` on the first successful exchange, so a
   * second request carrying the same one is answered with HTTP 403 "State parameter is
   * empty or mismatched". React replays effects on mount in StrictMode, which would
   * otherwise turn a perfectly good sign-in into that 403 in every development build —
   * and the replay would win, because the first run's result is discarded by its own
   * cleanup. Holding the promise means the replay awaits the one request already in
   * flight instead of spending the state a second time.
   */
  const exchange = useRef<Promise<OAuthExchangeResult> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const query = readCallbackQuery(window.location.search)
    const opener: Window | null = window.opener ?? null

    const telegramCallback = provider === 'telegram'
      ? parseTelegramBindCallback({
        telegram_bind: query.telegramBind,
        flow_token: query.flowToken,
        error_code: query.errorCode,
      })
      : null

    if (telegramCallback !== null) {
      if (postTelegramBindResult(telegramCallback, opener, window.location.origin)) {
        setPhase({ kind: 'linked' })
        window.close()
        return undefined
      }
      setPhase({
        kind: 'failed',
        reason: telegramCallback.kind === 'invalid' ? 'telegram_incomplete' : 'opener_unavailable',
        serverMessage: '',
      })
      return undefined
    }

    if (mode === 'bind') {
      if (opener === null || opener.closed) {
        setPhase({ kind: 'failed', reason: 'opener_unavailable', serverMessage: '' })
        return undefined
      }

      let deadline: ReturnType<typeof globalThis.setTimeout> | undefined

      const handleResult = (event: MessageEvent<unknown>) => {
        // Same-origin and same-window: a page can be messaged by anything that
        // holds a handle to it, and a forged or stale verdict must not close
        // this window on the wrong answer.
        if (event.origin !== window.location.origin || event.source !== opener) return
        if (!isOAuthBindResult(event.data, provider, query.state)) return

        if (deadline !== undefined) {
          globalThis.clearTimeout(deadline)
          deadline = undefined
        }

        if (event.data.success) {
          setPhase({ kind: 'linked' })
          window.close()
          return
        }
        setPhase({
          kind: 'failed',
          reason: 'bind_rejected',
          serverMessage: event.data.message ?? '',
        })
      }

      window.addEventListener('message', handleResult)
      deadline = globalThis.setTimeout(() => {
        deadline = undefined
        setPhase({ kind: 'failed', reason: 'bind_timeout', serverMessage: '' })
      }, OAUTH_BIND_RESPONSE_TIMEOUT_MS)

      opener.postMessage(
        buildBindCallbackMessage({
          provider,
          code: query.code,
          state: query.state,
          error: query.error,
          errorDescription: query.errorDescription,
        }),
        window.location.origin,
      )

      return () => {
        window.removeEventListener('message', handleResult)
        if (deadline !== undefined) globalThis.clearTimeout(deadline)
      }
    }

    if (query.code === '' && query.error === '') {
      setPhase({ kind: 'failed', reason: 'missing_code', serverMessage: '' })
      return undefined
    }

    let cancelled = false
    void (async () => {
      exchange.current ??= exchangeOAuthLogin(provider, {
        code: query.code,
        state: query.state,
        error: query.error,
        errorDescription: query.errorDescription,
      })
      const result = await exchange.current
      if (cancelled) return

      if (!result.ok) {
        setPhase({ kind: 'failed', reason: 'exchange_failed', serverMessage: result.message })
        return
      }

      applyAuthBundle(result.bundle)
      const language = getSavedLanguage(result.bundle.user)
      if (language !== undefined && language !== i18next.language) {
        await i18next.changeLanguage(language)
      }

      toast.success(i18next.t('Signed in'))
      void navigate({
        href: resolveAuthRedirect(query.redirect, window.location.origin),
        replace: true,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [mode, navigate, provider])

  const identity = providerIdentity(provider)
  const isBind = mode === 'bind'

  if (phase.kind === 'working') {
    return (
      <CallbackScreen
        busyLabel={isBind ? t('Confirming the connection') : t('Completing sign-in')}
        description={
          isBind
            ? t('Hold on while the page that opened this window confirms the connection.')
            : t('Hold on while we check the response and start your session.')
        }
        hint={
          isBind
            ? t('You can close this window once the original page confirms it.')
            : t('This takes a moment. You will be moved on automatically.')
        }
        icon={identity.icon}
        status="working"
        title={
          isBind
            ? t('Linking your {{provider}} account', { provider: identity.label })
            : t('Signing you in with {{provider}}', { provider: identity.label })
        }
      />
    )
  }

  if (phase.kind === 'linked') {
    return (
      <CallbackScreen
        actions={<Button onClick={() => window.close()}>{t('Close')}</Button>}
        description={t('Your account is connected. This window can be closed.')}
        heading={t('Account linked')}
        icon={identity.icon}
        message={t('{{provider}} is now connected to your account.', { provider: identity.label })}
        status="done"
        title={t('{{provider}} account linked', { provider: identity.label })}
      />
    )
  }

  return (
    <CallbackScreen
      actions={
        isBind ? (
          <Button onClick={() => window.close()}>{t('Close')}</Button>
        ) : (
          <Button render={<Link to="/sign-in" />}>{t('Back to sign in')}</Button>
        )
      }
      description={
        isBind
          ? t('Your account was not changed.')
          : t('No session was created, so nothing has changed. You can try again.')
      }
      heading={isBind ? t('This account could not be linked') : t('Sign-in could not be completed')}
      icon={identity.icon}
      message={failureMessage(phase, t)}
      status="failed"
      title={
        isBind
          ? t('Linking your {{provider}} account', { provider: identity.label })
          : t('Signing you in with {{provider}}', { provider: identity.label })
      }
    />
  )
}

/**
 * Failure wording is resolved at render, not when the failure happens, so the
 * page keeps the reason rather than a frozen sentence and re-translates itself
 * if the interface language changes underneath it.
 */
function failureMessage(
  phase: Extract<Phase, { kind: 'failed' }>,
  t: (key: string) => string,
): string {
  switch (phase.reason) {
    case 'missing_code':
      return t('The provider did not send an authorization code back to this page.')
    case 'exchange_failed':
      return phase.serverMessage === ''
        ? t('The provider response was rejected. The link may have already been used, or it may have expired.')
        : phase.serverMessage
    case 'opener_unavailable':
      return t('This window is no longer connected to the page that opened it. Go back to that page and start again.')
    case 'bind_timeout':
      return t('The page that opened this window did not answer in time. Go back to it and try linking again.')
    case 'bind_rejected':
      return phase.serverMessage === ''
        ? t('The provider account could not be linked.')
        : phase.serverMessage
    case 'telegram_incomplete':
      return t('Telegram sent back an incomplete result, so the link could not be confirmed.')
  }
}
