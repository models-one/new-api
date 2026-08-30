import { useQuery } from '@tanstack/react-query'

import { selfUserQuery } from '@/lib/api/user'

/**
 * `common.RoleAdminUser`. `registerChannelRoutes` puts `middleware.AdminAuth()` on the
 * WHOLE `/api/channel` group, so 10 is the floor for every endpoint on this page. Root
 * (100) is required by exactly one route — `POST /api/channel/:id/key` — which this
 * console does not call, so the page gates on admin, not root.
 */
export const CHANNEL_ADMIN_ROLE = 10

/** `common.RoleRootUser`; a root account bypasses the per-action grants entirely. */
export const CHANNEL_ROOT_ROLE = 100

/**
 * The five actions `service/authz/resources_channel.go` registers on the `channel`
 * resource. Each route names exactly one of them through `middleware.RequirePermission`,
 * so a role-10 administrator can hold `read` + `operate` + `write` (the admin baseline)
 * without holding `sensitive_write`.
 *
 *   read            GET /, /search, /models, /models_enabled, /ops, /:id, /tag/models
 *   operate         GET /test/:id, /update_balance/:id, /fetch_models/:id,
 *                   POST /:id/status, /status/batch, /tag/enabled, /tag/disabled
 *   write           PUT /, POST /batch/tag
 *   sensitive_write POST / (create), DELETE /:id, POST /batch, DELETE /disabled,
 *                   POST /copy/:id, POST /fetch_models
 *   secret_view     reserved for reading a key back; unused here.
 */
export const CHANNEL_ACTIONS = ['read', 'operate', 'write', 'sensitive_write', 'secret_view'] as const

export type ChannelAction = (typeof CHANNEL_ACTIONS)[number]

export type ChannelsAccessState = 'checking' | 'unavailable' | 'denied' | 'granted'

export type ChannelsAccess = {
  state: ChannelsAccessState
  role: number | undefined
  /** True for each action the signed-in account may perform. */
  can: Record<ChannelAction, boolean>
  error: unknown
  isRefetching: boolean
  retry: () => void
}

const NO_ACCESS: Record<ChannelAction, boolean> = {
  operate: false,
  read: false,
  secret_view: false,
  sensitive_write: false,
  write: false,
}

/**
 * Resolves one action against the `permissions.admin_permissions` matrix that
 * `GET /api/user/self` returns, mirroring `authz.Can`: root is a superuser role and is
 * granted everything implicitly, so its matrix is not consulted.
 */
export function resolveChannelPermission(
  role: number,
  matrix: Record<string, Record<string, boolean>> | undefined,
  action: ChannelAction,
): boolean {
  if (role >= CHANNEL_ROOT_ROLE) return true
  if (role < CHANNEL_ADMIN_ROLE) return false
  return matrix?.channel?.[action] === true
}

/**
 * Unlike the users page, this hook always reads `GET /api/user/self` rather than the
 * sign-in bundle held in the auth store: the store's `AuthUser` schema does not model
 * `permissions`, and the per-action grants are what decide which controls this page may
 * offer at all.
 */
export function useChannelsAccess(): ChannelsAccess {
  const selfQuery = useQuery(selfUserQuery())
  const self = selfQuery.data
  const role = self?.role

  const state = ((): ChannelsAccessState => {
    if (role !== undefined) return role >= CHANNEL_ADMIN_ROLE ? 'granted' : 'denied'
    if (selfQuery.isError) return 'unavailable'
    return 'checking'
  })()

  const can = ((): Record<ChannelAction, boolean> => {
    if (role === undefined) return NO_ACCESS
    const matrix = self?.permissions?.admin_permissions
    return {
      operate: resolveChannelPermission(role, matrix, 'operate'),
      read: resolveChannelPermission(role, matrix, 'read'),
      secret_view: resolveChannelPermission(role, matrix, 'secret_view'),
      sensitive_write: resolveChannelPermission(role, matrix, 'sensitive_write'),
      write: resolveChannelPermission(role, matrix, 'write'),
    }
  })()

  return {
    can,
    error: selfQuery.error,
    isRefetching: selfQuery.isFetching,
    retry: () => void selfQuery.refetch(),
    role,
    state,
  }
}
