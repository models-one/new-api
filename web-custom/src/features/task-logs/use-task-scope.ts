import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { ADMIN_ROLE } from '@/features/task-logs/task-presentation'
import type { TaskScope } from '@/features/task-logs/api'
import { selfUserQuery } from '@/lib/api/user'
import { useAuthStore } from '@/stores/auth-store'

export type TaskScopeState = {
  /** Role >= 10, so `GET /api/mj/` and `GET /api/task/` would answer. */
  canViewEveryone: boolean
  /** Still resolving the role; the scope control is disabled meanwhile. */
  isResolving: boolean
  scope: TaskScope
  setScope: (scope: TaskScope) => void
  /**
   * The scope actually in force. An admin who has not switched to "everyone" is
   * treated exactly like a normal user, and a non-admin can never leave `mine`
   * however the state is poked.
   */
  effectiveScope: TaskScope
}

/**
 * Both task pages are open to every signed-in account — `/api/mj/self` and
 * `/api/task/self` need only `UserAuth`. Admin does not unlock the page, it
 * unlocks a wider SCOPE: the sibling `/api/mj/` and `/api/task/` listings that
 * span all users and accept the `channel_id` filter.
 *
 * The role rides on the sign-in bundle when this SPA performed the login; a cold
 * load into the URL falls back to `GET /api/user/self`, the same query the rest of
 * the console caches. A role that never resolves simply leaves the user on their
 * own tasks, which is the safe direction to fail.
 */
export function useTaskScope(): TaskScopeState {
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })
  const [scope, setScope] = useState<TaskScope>('mine')

  const role = storedRole ?? selfQuery.data?.role
  const canViewEveryone = role !== undefined && role >= ADMIN_ROLE
  const isResolving = role === undefined && !selfQuery.isError

  return {
    canViewEveryone,
    isResolving,
    scope,
    setScope,
    effectiveScope: canViewEveryone && scope === 'all' ? 'all' : 'mine',
  }
}
