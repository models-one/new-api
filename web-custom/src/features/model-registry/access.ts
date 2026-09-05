import { useQuery } from '@tanstack/react-query'

import { selfUserQuery } from '@/lib/api/user'
import { useAuthStore } from '@/stores/auth-store'

/**
 * `common.RoleAdminUser` (common/constants.go).
 *
 * `router/api-router.go` puts a bare `middleware.AdminAuth()` on the WHOLE `/api/models`
 * group and on `/api/vendors` — and, unlike the channel routes, NOT a single one of them
 * also names a `middleware.RequirePermission` action. So 10 is both the floor and the
 * ceiling: there is no finer grant to check, and no route here needs root (100).
 */
export const MODEL_REGISTRY_ADMIN_ROLE = 10

export type RegistryAccessState = 'checking' | 'unavailable' | 'denied' | 'granted'

export type RegistryAccess = {
  state: RegistryAccessState
  /** The signed-in account's role once known; undefined while `state` is 'checking'. */
  role: number | undefined
  /** Present only while `state` is 'unavailable'. */
  error: unknown
  isRefetching: boolean
  retry: () => void
}

/**
 * The role comes from the sign-in bundle held in the auth store whenever this SPA
 * performed the login itself. A cold load into `/models/metadata` (a hard refresh, a
 * bookmark) has a session cookie but no bundle, so `GET /api/user/self` is the fallback.
 */
export function useModelRegistryAccess(): RegistryAccess {
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })

  const role = storedRole ?? selfQuery.data?.role

  const state = ((): RegistryAccessState => {
    if (role !== undefined) return role >= MODEL_REGISTRY_ADMIN_ROLE ? 'granted' : 'denied'
    if (selfQuery.isError) return 'unavailable'
    return 'checking'
  })()

  return {
    error: selfQuery.error,
    isRefetching: selfQuery.isFetching,
    retry: () => void selfQuery.refetch(),
    role,
    state,
  }
}
