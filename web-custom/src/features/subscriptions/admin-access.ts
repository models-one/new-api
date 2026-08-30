import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { selfUserQuery } from '@/lib/api/user'

/**
 * `common.RoleAdminUser` (common/constants.go). `middleware.AdminAuth()` rejects any
 * account whose `role` is below it, and the whole `/api/subscription/admin` group sits
 * behind that middleware, so this is the exact threshold the plan routes enforce.
 *
 * The other rungs are 1 (`RoleCommonUser`) and 100 (`RoleRootUser`); root therefore
 * clears this bar as well.
 */
export const ADMIN_ROLE_THRESHOLD = 10

export function isConsoleAdmin(role: number): boolean {
  return role >= ADMIN_ROLE_THRESHOLD
}

/**
 * `beforeLoad` guard for the `/subscriptions` route. Register it on the route rather
 * than relying on the page alone: the page guards itself too, but the route guard keeps
 * a non-admin from ever loading the chunk or firing an admin query.
 *
 * A failed `/api/user/self` does NOT redirect. The parent console route already owns
 * authentication, and turning a transient network failure into a 403 would tell an
 * administrator they lack a role they actually have; the page renders its own error
 * state instead.
 */
export async function requireSubscriptionsAdmin(queryClient: QueryClient): Promise<void> {
  const user = await queryClient.fetchQuery(selfUserQuery()).catch(() => null)
  if (user === null) return
  if (!isConsoleAdmin(user.role)) throw redirect({ to: '/403' })
}
