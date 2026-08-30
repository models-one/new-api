import { useQuery } from '@tanstack/react-query'

import { selfUserQuery } from '@/lib/api/user'
import { useAuthStore } from '@/stores/auth-store'

/**
 * `common.RoleRootUser` (common/constants.go). NOT `RoleAdminUser`, which is 10.
 *
 * `middleware.RootAuth()` calls `authHelper(c, common.RoleRootUser)` and every route
 * under `/api/system-info` and `/api/performance` is registered with it
 * (router/api-router.go), so an administrator at role 10 is refused with HTTP 403
 * `AUTH_INSUFFICIENT_PRIVILEGE` just like a plain user. The server is the boundary;
 * the check below only spares a non-root account a page of failed requests.
 */
export const ROOT_ROLE = 100

export type RootAccessState = 'checking' | 'unavailable' | 'denied' | 'granted'

export type RootAccess = {
  state: RootAccessState
  /** Present only while `state` is `unavailable`. */
  error: unknown
  isRefetching: boolean
  retry: () => void
}

/**
 * The role rides on the sign-in bundle whenever this SPA performed the login itself.
 * A cold load straight into `/system-info` (a bookmark, a hard refresh) has the session
 * cookie but no bundle, so `GET /api/user/self` is the fallback.
 */
export function useRootAccess(): RootAccess {
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })

  const role = storedRole ?? selfQuery.data?.role

  const state = ((): RootAccessState => {
    if (role !== undefined) return role >= ROOT_ROLE ? 'granted' : 'denied'
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
