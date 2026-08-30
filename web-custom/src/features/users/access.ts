import { useQuery } from '@tanstack/react-query'

import { USER_ROLE } from '@/features/users/user-presentation'
import { selfUserQuery } from '@/lib/api/user'
import { useAuthStore } from '@/stores/auth-store'

/**
 * `common.RoleAdminUser` (common/constants.go): the minimum role
 * `middleware.AdminAuth()` lets through, and the guard on every `/api/user/*`
 * management route plus `GET /api/group/` (router/api-router.go).
 *
 * NOT 100 — that is `RoleRootUser`, which none of these ROUTES require. Root is
 * checked inside two handlers instead (`promote`, and the admin-permission
 * matrix), so the page needs the caller's exact role, not just a boolean.
 */
export const ADMIN_ROLE = USER_ROLE.admin

export type UsersAccessState = 'checking' | 'unavailable' | 'denied' | 'granted'

export type UsersAccess = {
  state: UsersAccessState
  /** The signed-in account's role once known; undefined while `state` is 'checking'. */
  role: number | undefined
  /** Present only while `state` is 'unavailable'. */
  error: unknown
  isRefetching: boolean
  retry: () => void
}

/**
 * The role comes from the sign-in bundle held in the auth store whenever this SPA
 * performed the login itself. A cold load into `/users` (a hard refresh, a
 * bookmark) has a session cookie but no bundle, so `GET /api/user/self` is the
 * fallback — the same query the dashboard already caches.
 */
export function useUsersAccess(): UsersAccess {
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })

  const role = storedRole ?? selfQuery.data?.role

  const state = ((): UsersAccessState => {
    if (role !== undefined) return role >= ADMIN_ROLE ? 'granted' : 'denied'
    if (selfQuery.isError) return 'unavailable'
    return 'checking'
  })()

  return {
    state,
    role,
    error: selfQuery.error,
    isRefetching: selfQuery.isFetching,
    retry: () => void selfQuery.refetch(),
  }
}
