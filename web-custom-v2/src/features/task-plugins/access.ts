import { useQuery } from '@tanstack/react-query'

import { selfUserQuery } from '@/lib/api/user'
import { useAuthStore } from '@/stores/auth-store'

/**
 * `common.RoleRootUser`. Every `/api/plugin/task` route sits behind
 * `middleware.RootAuth()` in `router/api-router.go`: installing a plugin runs
 * administrator-supplied JavaScript on the server, so a role-10 administrator
 * cannot reach any of them and the page gates on root alone.
 */
export const TASK_PLUGIN_ROOT_ROLE = 100

export type TaskPluginsAccessState = 'checking' | 'unavailable' | 'denied' | 'granted'

export type TaskPluginsAccess = {
  state: TaskPluginsAccessState
  error: unknown
  isRefetching: boolean
  retry: () => void
}

/**
 * A cold load straight into `/task-plugins` has the session cookie but no
 * sign-in bundle, so `GET /api/user/self` is the fallback for the role.
 */
export function useTaskPluginsAccess(): TaskPluginsAccess {
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })

  const role = storedRole ?? selfQuery.data?.role

  const state = ((): TaskPluginsAccessState => {
    if (role !== undefined) return role >= TASK_PLUGIN_ROOT_ROLE ? 'granted' : 'denied'
    if (selfQuery.isError) return 'unavailable'
    return 'checking'
  })()

  return {
    error: selfQuery.error,
    isRefetching: selfQuery.isFetching,
    retry: () => void selfQuery.refetch(),
    state,
  }
}
