import { queryOptions } from '@tanstack/react-query'

import { deleteJson, getJson, postJson, putJson } from '@/lib/api/client'
import type { PageInfo } from '@/lib/api/types'

/**
 * A row from `GET /api/user/` and `GET /api/user/search` (controller/user.go,
 * model/user.go). Verified field-by-field against the running dev server; this is
 * a verbatim item from `GET /api/user/?p=1&page_size=1`, with only the value of
 * `setting` elided:
 *
 *   { "id": 10, "username": "ua_probe_1", "password": "", "original_password": "",
 *     "display_name": "Renamed Probe", "role": 1, "status": 1, "email": "",
 *     "github_id": "", "discord_id": "", "oidc_id": "", "wechat_id": "",
 *     "telegram_id": "", "verification_code": "", "quota": 250000, "used_quota": 0,
 *     "request_count": 0, "group": "vip", "aff_code": "Xk3p", "aff_count": 0,
 *     "aff_quota": 0, "aff_history_quota": 0, "inviter_id": 0, "DeletedAt": null,
 *     "linux_do_id": "", "setting": "{…}", "stripe_customer": "",
 *     "created_at": 1788048856, "last_login_at": 0, "remark": "internal note" }
 *
 * Fields deliberately NOT modelled:
 *   `password` / `original_password` / `verification_code` — `Omit`ted or `gorm:"-:all"`,
 *      always the empty string on a read. There is no way to read a password back.
 *   `access_token` — `json:"-"`, never serialised at all.
 *   `setting` — a JSON string of the user's OWN notification preferences. No admin
 *      endpoint writes it (`PUT /api/user/setting` is self-only), so it is not shown.
 *   `admin_permissions` — present on `GET /api/user/:id` only, and writable only by
 *      root through the authz catalog. Out of this page's scope; see the README note
 *      in `user-presentation.ts`.
 */
export type AdminUser = {
  id: number
  username: string
  display_name: string
  /** 0 guest, 1 common, 10 admin, 100 root (common/constants.go). */
  role: number
  /** 1 enabled, 2 disabled. Soft deletion is `DeletedAt`, not a status value. */
  status: number
  email: string
  group: string
  /** Remaining balance in integer quota units; divide by `quota_per_unit` for money. */
  quota: number
  /** Lifetime consumption in integer quota units. */
  used_quota: number
  request_count: number
  aff_code: string
  aff_count: number
  aff_quota: number
  aff_history_quota: number
  /** 0 when nobody invited this account. */
  inviter_id: number
  /**
   * `gorm.DeletedAt`. An RFC3339 string once the row is soft-deleted, null otherwise.
   * BOTH list endpoints run `Unscoped()`, so soft-deleted rows are returned here.
   */
  DeletedAt: string | null
  /** Unix SECONDS. */
  created_at: number
  /** Unix SECONDS; 0 when the account has never signed in. */
  last_login_at: number
  /** `json:"remark,omitempty"` — the key is ABSENT when the admin note is empty. */
  remark?: string
  github_id: string
  discord_id: string
  oidc_id: string
  wechat_id: string
  telegram_id: string
  linux_do_id: string
  stripe_customer: string
}

/** The six columns `model.userSortColumns` accepts; anything else falls back to `id desc`. */
export const USER_SORT_COLUMNS = [
  'id',
  'username',
  'quota',
  'group',
  'created_at',
  'last_login_at',
] as const

export type UserSortColumn = (typeof USER_SORT_COLUMNS)[number]

export function isUserSortColumn(value: string): value is UserSortColumn {
  return (USER_SORT_COLUMNS as readonly string[]).includes(value)
}

export type UserFilters = {
  keyword: string
  /** A group name from `GET /api/group/`, or '' for every group. */
  group: string
  /** A stringified role, or '' for every role. */
  role: string
  /** A stringified status, `'-1'` for soft-deleted rows, or '' for every status. */
  status: string
}

export type UserSort = {
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export const EMPTY_USER_FILTERS: UserFilters = { group: '', keyword: '', role: '', status: '' }

export function hasActiveUserFilters(filters: UserFilters): boolean {
  return (
    filters.keyword.trim() !== ''
    || filters.group !== ''
    || filters.role !== ''
    || filters.status !== ''
  )
}

/**
 * One factory for both list endpoints, which return the identical `PageInfo`
 * envelope. `/api/user/search` adds a `LIKE` across id, username, email and
 * display_name plus the group/role/status predicates; with no filter at all the
 * plain `/api/user/` list skips that machinery, so the unfiltered view uses it.
 *
 * `sort_by` and `sort_order` are understood by BOTH (controller.GetAllUsers and
 * controller.SearchUsers both build `model.NewUserSortOptions`).
 */
export function usersQuery(filters: UserFilters, page: number, pageSize: number, sort: UserSort) {
  const keyword = filters.keyword.trim()
  const isSearch = hasActiveUserFilters({ ...filters, keyword })

  return queryOptions({
    queryKey: ['users', 'list', keyword, filters.group, filters.role, filters.status, page, pageSize, sort] as const,
    queryFn: () =>
      getJson<PageInfo<AdminUser>>(isSearch ? '/api/user/search' : '/api/user/', {
        params: isSearch
          ? {
            group: filters.group,
            keyword,
            p: page,
            page_size: pageSize,
            role: filters.role,
            status: filters.status,
            ...sort,
          }
          : { p: page, page_size: pageSize, ...sort },
        // The page renders its own error panel; the global interceptor must not
        // also fire a toast for the same failure.
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    staleTime: 10 * 1000,
  })
}

/**
 * `GET /api/group/` (router/api-router.go, behind `AdminAuth`) → a flat array of
 * group names, e.g. `["svip","default","vip"]`. This is the same list the group
 * facet and the edit drawer offer; there is no description or ratio on this
 * payload (that is `/api/user/self/groups`, which is self-scoped).
 */
export function userGroupNamesQuery() {
  return queryOptions({
    queryKey: ['users', 'groups'] as const,
    queryFn: () =>
      getJson<string[]>('/api/group/', { skipBusinessError: true, skipErrorHandler: true }),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * `GET /api/user/:id`. Refused with "No permission to update users of same or
 * higher permission level" when `canManageTargetRole` fails, and with
 * "record not found" for a soft-deleted row (`GetUserById` is scoped).
 */
export function fetchAdminUser(id: number): Promise<AdminUser> {
  return getJson<AdminUser>(`/api/user/${id}`, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/**
 * The body `POST /api/user/` binds. `controller.CreateUser` keeps ONLY these four
 * fields (it rebuilds a `cleanUser` before inserting), so quota, group and remark
 * are not settable at creation — they are a second call.
 */
export type CreateUserPayload = {
  username: string
  password: string
  display_name: string
  role: number
}

export function createUser(payload: CreateUserPayload): Promise<unknown> {
  return postJson('/api/user/', payload, { skipBusinessError: true, skipErrorHandler: true })
}

/**
 * The body `PUT /api/user/` binds.
 *
 * `model.User.EditWithTx` writes exactly four columns — username, display_name,
 * group, remark — plus password when a non-empty one is sent. Quota, email, status
 * and role on this payload are IGNORED, which is why this console does not offer
 * them here: quota goes through `adjustUserQuota`, status and role through
 * `manageUser`, and there is no admin path to a user's e-mail at all.
 *
 * `role` must still be sent as the target's CURRENT role or omitted entirely:
 * `UpdateUser` rejects any other value with "Invalid parameters" (0, the zero
 * value of an omitted field, is `RoleGuestUser` and is the accepted "unchanged").
 */
export type UpdateUserPayload = {
  id: number
  username: string
  display_name: string
  group: string
  remark: string
  /** Omit or leave empty to keep the current password. 8–20 characters when set. */
  password?: string
}

export function updateUser(payload: UpdateUserPayload): Promise<unknown> {
  return putJson('/api/user/', payload, { skipBusinessError: true, skipErrorHandler: true })
}

/**
 * The `action` strings `controller.ManageUser` switches on, verbatim. Anything
 * else answers "Invalid parameters".
 *
 * `delete` here is a SOFT delete (`user.Delete()` sets `DeletedAt`). It is
 * deliberately not wired to a control — see `USER_SOFT_DELETE_ACTION` below.
 */
export const MANAGE_ACTION = {
  promote: 'promote',
  demote: 'demote',
  enable: 'enable',
  disable: 'disable',
  addQuota: 'add_quota',
} as const

export type ManageAction = (typeof MANAGE_ACTION)[keyof typeof MANAGE_ACTION]

/**
 * The fifth string `ManageUser` accepts. Recorded so the action set is complete,
 * and left unused on purpose: a soft-deleted row is inert afterwards. Verified on
 * the dev server against id 9 (`DeletedAt` set):
 *   GET /api/user/9            → "record not found"
 *   PUT /api/user/             → "record not found"
 *   DELETE /api/user/9         → "record not found"
 *   POST /api/user/manage      → "record not found" for enable/disable/promote/demote
 *   POST … {action:"add_quota"} → success:true, and the quota does not move
 * The legacy console reaches the same conclusion from the other end: its Delete
 * row action calls `DELETE /api/user/:id`, and it hides every row action once
 * `DeletedAt` is set.
 */
export const USER_SOFT_DELETE_ACTION = 'delete'

export function manageUser(id: number, action: ManageAction): Promise<unknown> {
  return postJson('/api/user/manage', { action, id }, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/** The three `mode` values the `add_quota` branch switches on. */
export const QUOTA_MODE = {
  add: 'add',
  subtract: 'subtract',
  override: 'override',
} as const

export type QuotaMode = (typeof QUOTA_MODE)[keyof typeof QUOTA_MODE]

/**
 * `POST /api/user/manage` with `action: "add_quota"`.
 *
 * `add` and `subtract` reject a value of 0 or less ("Quota change amount cannot be
 * zero") and move the balance relatively; `override` writes the column outright and
 * accepts any integer, including a negative one.
 *
 * `value` is in integer QUOTA UNITS — multiply the typed amount by `quota_per_unit`
 * before calling.
 */
export function adjustUserQuota(id: number, mode: QuotaMode, value: number): Promise<unknown> {
  return postJson('/api/user/manage', { action: MANAGE_ACTION.addQuota, id, mode, value }, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/**
 * `DELETE /api/user/:id` → `model.HardDeleteUserById`. Permanent, and the only
 * delete this console offers. Refused unless the caller's role is STRICTLY greater
 * than the target's, so root cannot delete another root and an admin cannot delete
 * another admin.
 */
export function deleteUser(id: number): Promise<unknown> {
  return deleteJson(`/api/user/${id}`, { skipBusinessError: true, skipErrorHandler: true })
}
