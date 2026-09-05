import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import type { LogScope } from '@/features/logs/api'
import { ADMIN_ROLE } from '@/features/logs/log-presentation'
import { selfUserQuery } from '@/lib/api/user'
import { useAuthStore } from '@/stores/auth-store'

export type LogScopeState = {
  /** Role >= 10, so `GET /api/log/` and `GET /api/log/stat` would answer. */
  canViewEveryone: boolean
  /** Still resolving the role; the scope control stays disabled meanwhile. */
  isResolving: boolean
  scope: LogScope
  setScope: (scope: LogScope) => void
  /**
   * The scope actually in force. An admin who has not switched is treated exactly
   * like a normal user, and a non-admin can never leave `mine` however the state
   * is poked — the server would answer 403 anyway.
   */
  effectiveScope: LogScope
}

/**
 * The log page is open to every signed-in account: `/api/log/self` needs only
 * `UserAuth`. Admin does not unlock the page, it unlocks a wider SCOPE — the
 * sibling `/api/log/` listing that spans every user and accepts the `username`
 * and `channel` filters.
 *
 * The role rides on the sign-in bundle when this SPA performed the login; a cold
 * load into the URL falls back to `GET /api/user/self`, the query the rest of the
 * console already caches. A role that never resolves leaves the user on their own
 * traffic, which is the safe direction to fail.
 */
export function useLogScope(): LogScopeState {
  const storedRole = useAuthStore((state) => state.auth.user?.role)
  const selfQuery = useQuery({ ...selfUserQuery(), enabled: storedRole === undefined })
  const [scope, setScope] = useState<LogScope>('mine')

  const role = storedRole ?? selfQuery.data?.role
  const canViewEveryone = role !== undefined && role >= ADMIN_ROLE
  const isResolving = role === undefined && !selfQuery.isError

  return {
    canViewEveryone,
    isResolving,
    scope,
    setScope,
    effectiveScope: canViewEveryone && scope === 'everyone' ? 'everyone' : 'mine',
  }
}
