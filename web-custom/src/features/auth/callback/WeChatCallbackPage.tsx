import { Link, useNavigate } from '@tanstack/react-router'
import i18next from 'i18next'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from '@/components/overlay/toast'
import { Button } from '@/components/ui/Button'
import { getSavedLanguage, resolveAuthRedirect } from '@/features/auth/auth-redirect'
import { exchangeWeChatLogin } from '@/features/auth/callback/api'
import { CallbackScreen } from '@/features/auth/callback/CallbackScreen'
import { providerIdentity } from '@/features/auth/callback/provider-identity'
import { readCallbackQuery } from '@/features/auth/callback/query'
import { applyAuthBundle } from '@/lib/auth-session'

import type { OAuthExchangeResult } from '@/features/auth/callback/api'

type FailureReason = 'unsupported_provider' | 'missing_code' | 'exchange_failed'

type Phase =
  | { kind: 'working' }
  | { kind: 'failed'; reason: FailureReason; serverMessage: string }

/**
 * `/oauth` — the WeChat official-account callback.
 *
 * WeChat is the one provider that names itself in the query string rather than
 * the path, which is why it has a route of its own. The legacy page rendered
 * `null` for the whole exchange and, on failure, bounced to sign-in behind a
 * toast — so a user whose code was rejected watched a blank white page and then
 * arrived back at sign-in with no idea why. This one narrates the wait through a
 * live region and stops on an explanation with a way forward.
 */
export function WeChatCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>({ kind: 'working' })

  /**
   * The verification code is spent by the first exchange, so the request is started at
   * most once for the life of this page. React replays effects on mount in StrictMode,
   * and a second call would be answered on an already-consumed code.
   */
  const exchange = useRef<Promise<OAuthExchangeResult> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const query = readCallbackQuery(window.location.search)
    if (query.provider !== '' && query.provider !== 'wechat') {
      setPhase({ kind: 'failed', reason: 'unsupported_provider', serverMessage: '' })
      return undefined
    }
    if (query.code === '') {
      setPhase({ kind: 'failed', reason: 'missing_code', serverMessage: '' })
      return undefined
    }

    let cancelled = false
    void (async () => {
      exchange.current ??= exchangeWeChatLogin(query.code)
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
      // `replace` so the spent verification code does not sit in history.
      void navigate({
        href: resolveAuthRedirect(query.redirect, window.location.origin),
        replace: true,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [navigate])

  const identity = providerIdentity('wechat')

  if (phase.kind === 'working') {
    return (
      <CallbackScreen
        busyLabel={t('Completing sign-in')}
        description={t('Hold on while we check the response and start your session.')}
        hint={t('This takes a moment. You will be moved on automatically.')}
        icon={identity.icon}
        status="working"
        title={t('Signing you in with {{provider}}', { provider: identity.label })}
      />
    )
  }

  return (
    <CallbackScreen
      actions={<Button render={<Link to="/sign-in" />}>{t('Back to sign in')}</Button>}
      description={t('No session was created, so nothing has changed. You can try again.')}
      heading={t('Sign-in could not be completed')}
      icon={identity.icon}
      message={failureMessage(phase, t)}
      status="failed"
      title={t('Signing you in with {{provider}}', { provider: identity.label })}
    />
  )
}

function failureMessage(
  phase: Extract<Phase, { kind: 'failed' }>,
  t: (key: string) => string,
): string {
  switch (phase.reason) {
    case 'unsupported_provider':
      return t('This address only completes WeChat sign-ins, and the link named a different provider.')
    case 'missing_code':
      return t('This link is missing the verification code WeChat should have sent back.')
    case 'exchange_failed':
      return phase.serverMessage === ''
        ? t('The provider response was rejected. The link may have already been used, or it may have expired.')
        : phase.serverMessage
  }
}
