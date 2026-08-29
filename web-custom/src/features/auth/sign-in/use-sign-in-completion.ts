import { useNavigate } from '@tanstack/react-router'
import i18n from 'i18next'
import { useCallback } from 'react'

import { getSavedLanguage, resolveAuthRedirect } from '@/features/auth/auth-redirect'
import { clearPending2FAChallenge } from '@/features/auth/otp/pending-2fa'
import { applyAuthBundle } from '@/lib/auth-session'

import type { AuthBundle } from '@/features/auth/types'

export type SignInCompletion = (bundle: AuthBundle) => Promise<void>

/**
 * What happens after any of the five sign-in mechanisms produces an auth bundle.
 *
 * One place, because every mechanism has to do all four things: adopt the session,
 * switch the interface to the language the account saved, drop any half-finished 2FA
 * challenge, and land on a redirect target that has been through the open-redirect guard.
 * The raw `?redirect=` value is never navigated to.
 */
export function useSignInCompletion(redirectTo?: string): SignInCompletion {
  const navigate = useNavigate()

  return useCallback(async (bundle: AuthBundle) => {
    applyAuthBundle(bundle)
    clearPending2FAChallenge()

    const language = getSavedLanguage(bundle.user)
    if (language !== undefined && language !== '' && language !== i18n.language) {
      try {
        await i18n.changeLanguage(language)
      } catch {
        // An unknown saved language is not a reason to fail a successful sign-in.
      }
    }

    const origin = typeof window === 'undefined' ? '' : window.location.origin
    await navigate({ href: resolveAuthRedirect(redirectTo, origin), replace: true })
  }, [navigate, redirectTo])
}
