import { ErrorPage } from '@/features/errors/ErrorPage'

/**
 * The router's `notFoundComponent`. It renders the same surface as the addressable
 * `/404` route so an unmatched URL and a deliberate visit look identical.
 */
export function NotFoundPage() {
  return <ErrorPage variant="404" />
}
