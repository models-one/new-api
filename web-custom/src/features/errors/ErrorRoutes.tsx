import { useParams } from '@tanstack/react-router'

import { ErrorPage } from '@/features/errors/ErrorPage'
import { resolveErrorSlug } from '@/features/errors/error-catalog'

export function UnauthorizedPage() {
  return <ErrorPage variant="401" />
}

export function ForbiddenPage() {
  return <ErrorPage variant="403" />
}

export function NotFoundErrorPage() {
  return <ErrorPage variant="404" />
}

export function ServerErrorPage() {
  return <ErrorPage variant="500" />
}

export function MaintenancePage() {
  return <ErrorPage variant="503" />
}

/**
 * Renders whichever of the five surfaces a slug names. Kept separate from the route
 * component so the mapping can be exercised without a router param.
 */
export function ErrorSlugView(props: { slug: string }) {
  return <ErrorPage variant={resolveErrorSlug(props.slug)} />
}

/** Route component for `/errors/$error`. */
export function ErrorSlugPage() {
  const { error } = useParams({ from: '/errors/$error' })
  return <ErrorSlugView slug={error} />
}
