import { useQuery } from '@tanstack/react-query'

import { selfUserQuery } from '@/lib/api/user'
import { useAuthStore } from '@/stores/auth-store'

/**
 * `common.RoleAdminUser`. `router/api-router.go` puts exactly ONE guard on the whole
 * `/api/deployments` group:
 *
 *   deploymentsRoute := apiRouter.Group("/deployments")
 *   deploymentsRoute.Use(middleware.AdminAuth())
 *
 * There is no `RootAuth()` and no `middleware.RequirePermission` anywhere in the group,
 * so 10 is both the floor and the ceiling: a role-10 administrator may call every one of
 * the eighteen deployment routes, including the ones that spend money. The page therefore
 * gates on the administrator role and nothing finer — there is no per-action grant to
 * consult, and inventing one would misdescribe the server.
 */
export const DEPLOYMENT_ADMIN_ROLE = 10

export type DeploymentsAccessState = 'checking' | 'unavailable' | 'denied' | 'granted'

export type DeploymentsAccess = {
  state: DeploymentsAccessState
  /** The signed-in account's role once known; undefined while `state` is 'checking'. */
  role: number | undefined
  /** Present only while `state` is 'unavailable'. */
  error: unknown
  isRefetching: boolean
  retry: () => void
}

/**
 * The role comes from the sign-in bundle the auth store holds whenever this SPA performed
 * the login itself. A cold load straight into `/models/deployments` (a refresh, a
 * bookmark, the redirect away from the retired frontend) has the session cookie but no
 * bundle, so `GET /api/user/self` is the fallback.
 */
export function useDeploymentsAccess(): DeploymentsAccess {
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })

  const role = storedRole ?? selfQuery.data?.role

  const state = ((): DeploymentsAccessState => {
    if (role !== undefined) return role >= DEPLOYMENT_ADMIN_ROLE ? 'granted' : 'denied'
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
