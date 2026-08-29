import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuthServerConfig, type AuthServerConfig } from '@/features/auth/server-config'

import type { ReactNode } from 'react'

type AuthConfigGateProps = {
  /** Rendered only once `/api/status` has answered. */
  children: (config: AuthServerConfig) => ReactNode
}

/**
 * Holds an authentication form back until `/api/status` answers.
 *
 * Every auth surface is config-driven: which providers exist, whether passwords
 * are accepted at all, whether registration is open. Rendering against defaults
 * first would flash a form the server may not honour, so this gate shows a
 * placeholder instead, and a recoverable error when the config cannot be read.
 */
export function AuthConfigGate(props: AuthConfigGateProps) {
  const { t } = useTranslation()
  const { config, isError, isPending, refetch } = useAuthServerConfig()

  if (isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4" role="status">
        <Skeleton height={40} variant="block" />
        <Skeleton height={40} variant="block" />
        <Skeleton height={40} variant="block" />
        <span className="sr-only">{t('Loading sign-in options')}</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm leading-6 text-muted" role="alert">
          {t('Sign-in is unavailable because the server configuration could not be read.')}
        </p>
        <Button onClick={refetch} variant="outline">{t('Try again')}</Button>
      </div>
    )
  }

  return <>{props.children(config)}</>
}
