import { useTranslation } from 'react-i18next'

import { ErrorPage } from '@/features/errors/ErrorPage'
import { AuthenticationUnavailableError } from '@/lib/auth-session'

type RouteErrorPageProps = {
  error: unknown
  reset: () => void
}

/**
 * The router's `errorComponent`. Unlike the addressable error routes it offers a retry
 * rather than a history-back control, because the route that threw is still the current
 * one and going back would leave the user on a page that never loaded.
 */
export function RouteErrorPage(props: RouteErrorPageProps) {
  const { t } = useTranslation()

  // A failed auth bootstrap is not an HTTP failure and carries no status, so it gets its
  // own copy rather than the generic "could not complete this request".
  const description
    = props.error instanceof AuthenticationUnavailableError
      ? t('Authentication service is temporarily unavailable.')
      : undefined

  return (
    <ErrorPage
      description={description}
      error={props.error}
      onRetry={props.reset}
      variant="500"
    />
  )
}
