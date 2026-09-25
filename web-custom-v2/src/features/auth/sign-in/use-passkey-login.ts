import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage, toast } from '@/components/overlay/toast'
import { beginPasskeyLogin, finishPasskeyLogin } from '@/features/auth/api'
import {
  buildAssertionResult,
  getCredential,
  isPasskeySupported,
  prepareCredentialRequestOptions,
} from '@/features/auth/passkey'
import { isAuthBundle } from '@/lib/auth-session'

import type { AuthBundle } from '@/features/auth/types'

export type UsePasskeyLoginOptions = {
  /** `passkey_login` from /api/status. The device probe only runs when this is true. */
  enabled: boolean
  onAuthenticated: (bundle: AuthBundle) => void | Promise<void>
  /** Gate run before the ceremony starts — legal consent, for instance. */
  canStart?: () => boolean
}

export type UsePasskeyLoginResult = {
  /** Null until the device probe settles; the button stays disabled meanwhile. */
  supported: boolean | null
  pending: boolean
  start: () => void
}

/**
 * The WebAuthn half of sign-in: `passkey/login/begin` -> authenticator -> `finish`.
 *
 * Support is probed rather than assumed. `supported` starts as null so the button is
 * never briefly offered to a browser that cannot honour it, and a device that fails the
 * probe gets an honest explanation instead of a button that throws when pressed.
 */
export function usePasskeyLogin(options: UsePasskeyLoginOptions): UsePasskeyLoginResult {
  const { canStart, enabled, onAuthenticated } = options
  const { t } = useTranslation()

  const [supported, setSupported] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setSupported(null)
      return undefined
    }

    let active = true
    isPasskeySupported()
      .then((available) => {
        if (active) setSupported(available)
      })
      .catch(() => {
        if (active) setSupported(false)
      })

    return () => {
      active = false
    }
  }, [enabled])

  const start = useCallback(() => {
    if (canStart && !canStart()) return
    if (supported !== true) return

    const run = async () => {
      setPending(true)
      try {
        const begin = await beginPasskeyLogin()
        if (!begin.success) {
          toast.error(begin.message || t('Could not start passkey sign-in. Please try again.'))
          return
        }

        const flowToken = begin.data?.flow_token?.trim() ?? ''
        if (flowToken === '') {
          toast.error(t('This sign-in attempt expired. Please try again.'))
          return
        }

        const publicKey = prepareCredentialRequestOptions(begin.data)
        // `navigator.credentials.get` is typed as the generic Credential union; a
        // publicKey request can only ever resolve to a PublicKeyCredential or null.
        const credential = (await getCredential(publicKey)) as PublicKeyCredential | null
        if (credential === null) {
          toast.info(t('Passkey sign-in was cancelled.'))
          return
        }

        const assertion = buildAssertionResult(credential)
        if (assertion === null) {
          toast.error(t('This device returned a passkey response the server cannot read.'))
          return
        }

        const finish = await finishPasskeyLogin(flowToken, assertion)
        if (!finish.success || !isAuthBundle(finish.data)) {
          toast.error(finish.message || t('Sign-in failed. Please try again.'))
          return
        }

        await onAuthenticated(finish.data)
      } catch (error: unknown) {
        // The authenticator reports a dismissed or timed-out prompt this way. It is a
        // choice the user made, not a failure worth an error toast.
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          toast.info(t('Passkey sign-in was cancelled.'))
          return
        }
        toast.error(toErrorMessage(error, t('Sign-in failed. Please try again.')))
      } finally {
        setPending(false)
      }
    }

    void run()
  }, [canStart, onAuthenticated, supported, t])

  return { supported, pending, start }
}
