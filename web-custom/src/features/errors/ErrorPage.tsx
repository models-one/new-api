import CompassIcon from 'lucide-react/dist/esm/icons/compass'
import LockIcon from 'lucide-react/dist/esm/icons/lock'
import ShieldXIcon from 'lucide-react/dist/esm/icons/shield-x'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import WrenchIcon from 'lucide-react/dist/esm/icons/wrench'
import { Link, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/system/ErrorState'
import { Button } from '@/components/ui/Button'
import { getHttpStatus, type ErrorVariant } from '@/features/errors/error-catalog'

type ErrorContent = {
  code: string
  title: string
  description: string
  icon: ReactNode
}

type ErrorPageProps = {
  variant: ErrorVariant
  /**
   * The thrown error, when this page is standing in for a failed request. Only the 500
   * surface reads it: its `response.status` becomes the displayed numeral, and a 429
   * swaps the copy for rate limiting. Ported from the legacy general-error page.
   */
  error?: unknown
  /** Overrides the catalogue body copy. The numeral and title stay put. */
  description?: string
  /**
   * When supplied, the second control retries instead of going back in history. Used by
   * the router error boundary, which is handed a `reset` callback.
   */
  onRetry?: () => void
}

/**
 * Resolves the numeral, copy and mark for one variant. Split out from the component so
 * the 500 status dig has a single home.
 */
function useErrorContent(variant: ErrorVariant, error: unknown): ErrorContent {
  const { t } = useTranslation()

  switch (variant) {
    case '401':
      return {
        code: '401',
        title: t('Unauthorized access'),
        description: t('Sign in with an account that has permission to view this resource.'),
        icon: <LockIcon aria-hidden="true" />,
      }
    case '403':
      return {
        code: '403',
        title: t('Access forbidden'),
        description: t('You do not have permission to view this resource.'),
        icon: <ShieldXIcon aria-hidden="true" />,
      }
    case '404':
      return {
        code: '404',
        title: t('Page not found'),
        description: t('The page you requested does not exist.'),
        icon: <CompassIcon aria-hidden="true" />,
      }
    case '503':
      return {
        code: '503',
        title: t('Service unavailable'),
        description: t('The console is temporarily offline for maintenance.'),
        icon: <WrenchIcon aria-hidden="true" />,
      }
    default: {
      const status = getHttpStatus(error)
      if (status === 429) {
        return {
          code: '429',
          title: t('Too many requests'),
          description: t('Please wait a moment before trying again.'),
          icon: <TriangleAlertIcon aria-hidden="true" />,
        }
      }
      return {
        code: String(status ?? 500),
        title: t('Something went wrong'),
        description: t('The console could not complete this request.'),
        icon: <TriangleAlertIcon aria-hidden="true" />,
      }
    }
  }
}

/**
 * The console's only error presentation. Every addressable error route, the router's
 * not-found component and the router's error boundary all render this, so the five
 * surfaces stay identical apart from their copy.
 */
export function ErrorPage(props: ErrorPageProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const content = useErrorContent(props.variant, props.error)

  const secondaryAction = props.onRetry ? (
    <Button className="w-full sm:w-auto" onClick={props.onRetry} variant="outline">
      {t('Try again')}
    </Button>
  ) : (
    <Button className="w-full sm:w-auto" onClick={() => router.history.go(-1)} variant="outline">
      {t('Go back')}
    </Button>
  )

  return (
    <ErrorState
      action={
        <Button className="w-full sm:w-auto" render={<Link to="/" />}>
          {t('Back to home')}
        </Button>
      }
      code={content.code}
      description={props.description ?? content.description}
      icon={content.icon}
      label={content.title}
      secondaryAction={secondaryAction}
      title={content.title}
    />
  )
}
