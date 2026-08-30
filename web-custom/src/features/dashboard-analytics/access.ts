import { useQuery } from '@tanstack/react-query'

import { selfUserQuery } from '@/lib/api/user'
import { useAuthStore } from '@/stores/auth-store'

/**
 * `common.RoleAdminUser` (common/constants.go) — the floor `middleware.AdminAuth()`
 * lets through, and the guard on `/api/data/`, `/api/data/users` and `/api/data/flow`
 * (router/api-router.go). NOT 100, which is `RoleRootUser`.
 *
 * The server refuses below this regardless of what the console renders; the
 * check here only spares a non-admin a page of failed requests.
 */
export const ADMIN_ROLE = 10

/**
 * `common.RoleRootUser`. Root is not a stricter guard on these routes — none of
 * them use `RootAuth()` — but it CHANGES THE PAYLOAD: `GetFlowQuotaData`
 * selects node_name and token_id for root and omits both for a plain admin, so
 * the flow page has to know which shape it is about to receive.
 */
export const ROOT_ROLE = 100

export type AccessState = 'checking' | 'unavailable' | 'denied' | 'granted'

export type ConsoleAccess = {
  /** `granted` once a role is known; the caller decides what that role may see. */
  state: AccessState
  role: number | undefined
  isAdmin: boolean
  isRoot: boolean
  error: unknown
  isRefetching: boolean
  retry: () => void
}

/**
 * The role rides on the sign-in bundle whenever this SPA performed the login. A
 * cold load (hard refresh, bookmark) has only the session cookie, so
 * `GET /api/user/self` fills the gap — the query the console already caches.
 *
 * `requiredRole` decides whether a known role counts as granted or denied; pass
 * 0 for a page every signed-in user may open, which still needs the role to
 * pick between the self and admin data shapes.
 */
export function useConsoleAccess(requiredRole = 0): ConsoleAccess {
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })

  const role = storedRole ?? selfQuery.data?.role

  const state = ((): AccessState => {
    if (role !== undefined) return role >= requiredRole ? 'granted' : 'denied'
    if (selfQuery.isError) return 'unavailable'
    return 'checking'
  })()

  return {
    state,
    role,
    isAdmin: role !== undefined && role >= ADMIN_ROLE,
    isRoot: role !== undefined && role >= ROOT_ROLE,
    error: selfQuery.error,
    isRefetching: selfQuery.isFetching,
    retry: () => void selfQuery.refetch(),
  }
}
