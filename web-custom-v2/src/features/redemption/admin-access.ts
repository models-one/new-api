import { useQuery } from '@tanstack/react-query'

import { selfUserQuery } from '@/lib/api/user'
import { useAuthStore } from '@/stores/auth-store'

/**
 * `common.RoleAdminUser` (common/constants.go): the minimum role
 * `middleware.AdminAuth()` lets through, and every `/api/redemption/*` route sits
 * behind it (router/api-router.go). A non-admin gets HTTP 403
 * `AUTH_INSUFFICIENT_PRIVILEGE` from the server no matter what this console
 * renders — the guard below only spares them a page of failed requests.
 */
export const ADMIN_ROLE = 10

export type AdminAccessState = 'checking' | 'unavailable' | 'denied' | 'granted'

export type AdminAccess = {
  state: AdminAccessState
  /** Present only while `state` is `unavailable`. */
  error: unknown
  isRefetching: boolean
  retry: () => void
}

/**
 * The role comes from the sign-in bundle held in the auth store whenever this SPA
 * performed the login itself. A cold load into `/redemption-codes` (a hard refresh,
 * a bookmark) has a session cookie but no bundle, so `GET /api/user/self` is the
 * fallback — it is the same query the dashboard already caches.
 */
export function useAdminAccess(): AdminAccess {
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })

  const role = storedRole ?? selfQuery.data?.role

  const state = ((): AdminAccessState => {
    if (role !== undefined) return role >= ADMIN_ROLE ? 'granted' : 'denied'
    if (selfQuery.isError) return 'unavailable'
    return 'checking'
  })()

  return {
    state,
    error: selfQuery.error,
    isRefetching: selfQuery.isFetching,
    retry: () => void selfQuery.refetch(),
  }
}
