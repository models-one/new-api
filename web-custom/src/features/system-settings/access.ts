import { useQuery } from '@tanstack/react-query'

import { selfUserQuery } from '@/lib/api/user'
import { useAuthStore } from '@/stores/auth-store'

/**
 * `common.RoleRootUser` — 100.
 *
 * NOT 10. `router/api-router.go` puts the entire `/api/option` group behind
 * `middleware.RootAuth()`:
 *
 *   optionRoute := apiRouter.Group("/option")
 *   optionRoute.Use(middleware.RootAuth())
 *
 * and `RootAuth` is `authHelper(c, common.RoleRootUser)`, which rejects anything below
 * 100. Verified on the dev server: an unauthenticated `GET /api/option/` answers 401.
 * An administrator (role 10) can therefore neither read nor write a single setting, so
 * this whole area is gated at 100 and shows a denial rather than 41 failing panels.
 *
 * The legacy console reaches the same threshold from the other end — its
 * `/_authenticated/system-settings` route redirects to /403 unless the role is
 * `ROLE.SUPER_ADMIN`, which is 100.
 */
export const SYSTEM_SETTINGS_ROLE = 100

export type SystemSettingsAccessState = 'checking' | 'unavailable' | 'denied' | 'granted'

export type SystemSettingsAccess = {
  state: SystemSettingsAccessState
  /** The signed-in account's role once known; undefined while `state` is 'checking'. */
  role: number | undefined
  /** Present only while `state` is 'unavailable'. */
  error: unknown
  isRefetching: boolean
  retry: () => void
}

/**
 * The role comes from the sign-in bundle in the auth store when this SPA performed the
 * login itself. A cold load into `/system-settings` — a hard refresh, a bookmark — has a
 * session cookie but no bundle, so `GET /api/user/self` is the fallback.
 */
export function useSystemSettingsAccess(): SystemSettingsAccess {
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })

  const role = storedRole ?? selfQuery.data?.role

  const state = ((): SystemSettingsAccessState => {
    if (role !== undefined) return role >= SYSTEM_SETTINGS_ROLE ? 'granted' : 'denied'
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
