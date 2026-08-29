import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { AuthServerConfig } from '@/features/auth/server-config'

/** Where the legacy frontend still serves the legal documents. */
export const USER_AGREEMENT_HREF = '/user-agreement'
export const PRIVACY_POLICY_HREF = '/privacy-policy'

const linkClassName = 'text-primary underline underline-offset-2 hover:text-primary-strong'

function LegalLinks(props: { config: AuthServerConfig }) {
  const { t } = useTranslation()
  const { privacyPolicyEnabled, userAgreementEnabled } = props.config

  const agreement: ReactNode = userAgreementEnabled
    ? (
      <a className={linkClassName} href={USER_AGREEMENT_HREF} rel="noopener noreferrer" target="_blank">
        {t('User Agreement')}
      </a>
    )
    : null

  const privacy: ReactNode = privacyPolicyEnabled
    ? (
      <a className={linkClassName} href={PRIVACY_POLICY_HREF} rel="noopener noreferrer" target="_blank">
        {t('Privacy Policy')}
      </a>
    )
    : null

  return (
    <>
      {agreement}
      {agreement && privacy ? ` ${t('and')} ` : null}
      {privacy}
    </>
  )
}

type LegalConsentProps = {
  config: AuthServerConfig
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

/**
 * The explicit consent checkbox, rendered only when the operator published at
 * least one legal document (`user_agreement_enabled` / `privacy_policy_enabled`).
 * When neither exists there is nothing to consent to, so nothing renders and the
 * caller must not gate submission on it — use `requiresLegalConsent`.
 */
export function LegalConsent(props: LegalConsentProps) {
  const { t } = useTranslation()
  const controlId = useId()

  if (!props.config.userAgreementEnabled && !props.config.privacyPolicyEnabled) return null

  return (
    <div className={cn('panel-muted flex items-start gap-3 px-3 py-3', props.className)}>
      <input
        checked={props.checked}
        className="mt-0.5 size-4 shrink-0 rounded-[3px] border border-border-strong bg-canvas accent-primary"
        disabled={props.disabled}
        id={controlId}
        onChange={(event) => props.onCheckedChange(event.target.checked)}
        type="checkbox"
      />
      <label className="text-xs leading-5 text-muted" htmlFor={controlId}>
        {t('I have read and agree to the')}
        {' '}
        <LegalLinks config={props.config} />
        .
      </label>
    </div>
  )
}

type AuthTermsFooterProps = {
  config: AuthServerConfig
  variant?: 'sign-in' | 'sign-up'
  className?: string
}

/**
 * The passive footnote under an auth form. Like the checkbox it only appears
 * when there is a document to point at.
 */
export function AuthTermsFooter(props: AuthTermsFooterProps) {
  const { t } = useTranslation()

  if (!props.config.userAgreementEnabled && !props.config.privacyPolicyEnabled) return null

  return (
    <p className={cn('text-center text-xs leading-5 text-muted', props.className)}>
      {props.variant === 'sign-up'
        ? t('By creating an account, you agree to our')
        : t('By signing in, you agree to our')}
      {' '}
      <LegalLinks config={props.config} />
      .
    </p>
  )
}
