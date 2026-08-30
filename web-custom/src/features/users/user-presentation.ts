import type { Tone } from '@/components/ui'
import type { AdminUser } from '@/features/users/api'

/**
 * `common/constants.go`. `RoleAdminUser` (10) is the floor `middleware.AdminAuth()`
 * enforces on every `/api/user/*` admin route; `RoleRootUser` (100) is root only and
 * is a stricter gate that a handful of branches inside the handlers apply on top.
 */
export const USER_ROLE = {
  guest: 0,
  common: 1,
  admin: 10,
  root: 100,
} as const

export type UserRoleValue = (typeof USER_ROLE)[keyof typeof USER_ROLE]

/** `common.UserStatusEnabled` / `common.UserStatusDisabled`. 0 is never stored. */
export const USER_STATUS = {
  enabled: 1,
  disabled: 2,
} as const

/**
 * Not a stored status: `model.SearchUsers` treats `status=-1` as
 * `WHERE deleted_at IS NOT NULL`, and every other value as
 * `deleted_at IS NULL AND status = ?`.
 */
export const DELETED_STATUS_FILTER = '-1'

/** `model.UserNameMaxLength`, and the `validate:"max=20"` tag on Username. */
export const USERNAME_MAX_LENGTH = 20
/** `validate:"max=20"` on DisplayName. */
export const DISPLAY_NAME_MAX_LENGTH = 20
/** `validate:"min=8,max=20"` on Password. */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 20
/** `validate:"max=255"` on Remark. */
export const REMARK_MAX_LENGTH = 255

export type UserRowState = 'enabled' | 'disabled' | 'deleted'

/** `gorm.DeletedAt` is serialised as null until the row is soft-deleted. */
export function isUserDeleted(user: Pick<AdminUser, 'DeletedAt'>): boolean {
  return user.DeletedAt !== null && user.DeletedAt !== undefined
}

/**
 * What a row actually is. Soft deletion outranks the stored status, because the
 * status column keeps whatever value it had when the row was deleted.
 */
export function userRowState(user: Pick<AdminUser, 'DeletedAt' | 'status'>): UserRowState {
  if (isUserDeleted(user)) return 'deleted'
  return user.status === USER_STATUS.disabled ? 'disabled' : 'enabled'
}

export const USER_STATE_TONE: Readonly<Record<UserRowState, Tone>> = {
  enabled: 'success',
  disabled: 'muted',
  deleted: 'destructive',
}

/** Translation keys; pass each through `t()` at the call site. */
export const USER_STATE_LABEL: Readonly<Record<UserRowState, string>> = {
  enabled: 'Enabled',
  disabled: 'Disabled',
  deleted: 'Deleted',
}

export const USER_ROLE_TONE: Readonly<Record<number, Tone>> = {
  [USER_ROLE.guest]: 'muted',
  [USER_ROLE.common]: 'muted',
  [USER_ROLE.admin]: 'info',
  [USER_ROLE.root]: 'warning',
}

export const USER_ROLE_LABEL: Readonly<Record<number, string>> = {
  [USER_ROLE.guest]: 'Guest',
  [USER_ROLE.common]: 'User',
  [USER_ROLE.admin]: 'Admin',
  [USER_ROLE.root]: 'Root',
}

export function userRoleLabel(role: number): string {
  return USER_ROLE_LABEL[role] ?? 'Unknown role'
}

export function userRoleTone(role: number): Tone {
  return USER_ROLE_TONE[role] ?? 'muted'
}

/**
 * `controller.canManageTargetRole`, verbatim:
 *
 *   myRole == RoleRootUser || myRole > targetRole
 *
 * It gates `GET /api/user/:id`, `PUT /api/user/` and every branch of
 * `POST /api/user/manage`. Note that root passes it against ANOTHER root, which is
 * why the individual branches carry their own root protections.
 */
export function canManageTargetRole(viewerRole: number, targetRole: number): boolean {
  return viewerRole === USER_ROLE.root || viewerRole > targetRole
}

export type UserActionId =
  | 'edit'
  | 'quota'
  | 'promote'
  | 'demote'
  | 'enable'
  | 'disable'
  | 'delete'

/**
 * Why a control is withheld. Each one corresponds to a specific refusal in
 * controller/user.go, so the console can say what the server would have said
 * instead of making the admin discover it through a red toast.
 */
export type UserActionDenial =
  | 'deleted'
  | 'rank'
  | 'root-protected'
  | 'root-only'
  | 'already-admin'
  | 'already-common'
  | 'already-enabled'
  | 'already-disabled'

export type UserActionAvailability = {
  allowed: boolean
  denial?: UserActionDenial
}

const ALLOWED: UserActionAvailability = { allowed: true }

function denied(denial: UserActionDenial): UserActionAvailability {
  return { allowed: false, denial }
}

export type UserActionMatrix = Readonly<Record<UserActionId, UserActionAvailability>>

/**
 * Every refusal controller/user.go can produce for one row, resolved up front.
 *
 * The server refuses regardless of what this returns — these gates exist so the
 * page does not offer a control that is guaranteed to 403 or to answer
 * "record not found".
 *
 *   deleted        every path is inert once `DeletedAt` is set (verified on the dev
 *                  server: GET/:id, PUT, DELETE and the four manage actions all
 *                  answer "record not found"; add_quota answers success and moves
 *                  nothing).
 *   rank           `canManageTargetRole` for everything except delete, which uses
 *                  `DeleteUser`'s stricter `myRole <= originUser.Role` refusal.
 *   root-protected `disable` and the soft `delete` branch refuse a root target
 *                  outright, and so does `demote`.
 *   root-only      `promote` requires `myRole == RoleRootUser`; a plain admin gets
 *                  "Admin cannot promote users".
 */
export function resolveUserActions(user: AdminUser, viewerRole: number): UserActionMatrix {
  if (isUserDeleted(user)) {
    const gone = denied('deleted')
    return {
      delete: gone,
      demote: gone,
      disable: gone,
      edit: gone,
      enable: gone,
      promote: gone,
      quota: gone,
    }
  }

  const outranked = canManageTargetRole(viewerRole, user.role)
  const rank = denied('rank')

  // `DeleteUser` refuses on `myRole <= originUser.Role`, which is stricter than
  // `canManageTargetRole`: root cannot hard-delete another root.
  const canDelete = viewerRole > user.role

  const promote = ((): UserActionAvailability => {
    if (!outranked) return rank
    if (viewerRole !== USER_ROLE.root) return denied('root-only')
    if (user.role >= USER_ROLE.admin) return denied('already-admin')
    return ALLOWED
  })()

  const demote = ((): UserActionAvailability => {
    if (!outranked) return rank
    if (user.role === USER_ROLE.root) return denied('root-protected')
    if (user.role === USER_ROLE.common) return denied('already-common')
    return ALLOWED
  })()

  const enable = ((): UserActionAvailability => {
    if (!outranked) return rank
    if (user.status === USER_STATUS.enabled) return denied('already-enabled')
    return ALLOWED
  })()

  const disable = ((): UserActionAvailability => {
    if (!outranked) return rank
    if (user.role === USER_ROLE.root) return denied('root-protected')
    if (user.status === USER_STATUS.disabled) return denied('already-disabled')
    return ALLOWED
  })()

  return {
    delete: canDelete ? ALLOWED : rank,
    demote,
    disable,
    edit: outranked ? ALLOWED : rank,
    enable,
    promote,
    quota: outranked ? ALLOWED : rank,
  }
}

/**
 * Short translation keys for each denial, rendered beside a disabled control so
 * the reason is part of the control's accessible name. Pass through `t()`.
 */
export const USER_ACTION_DENIAL_HINT: Readonly<Record<UserActionDenial, string>> = {
  deleted: 'soft-deleted',
  rank: 'outranks you',
  'root-protected': 'root is protected',
  'root-only': 'root only',
  'already-admin': 'already an admin',
  'already-common': 'already a user',
  'already-enabled': 'already enabled',
  'already-disabled': 'already disabled',
}

/**
 * The roles `POST /api/user/` will accept from this caller. `CreateUser` refuses
 * `user.Role >= myRole`, so root may create regular users and admins, and a plain
 * admin may create regular users only.
 */
export function creatableRoles(viewerRole: number): number[] {
  return [USER_ROLE.common, USER_ROLE.admin].filter((role) => role < viewerRole)
}

/**
 * The inverse of `quotaToCurrency`: the forms take an amount in the display
 * currency and every quota endpoint stores integer units.
 *
 *   quota = round(amount × QUOTA_PER_UNIT)
 *
 * QUOTA_PER_UNIT is `quota_per_unit` from `GET /api/status`, read through
 * `useQuotaPerUnit()`. It is never hardcoded.
 */
export function currencyToQuota(amount: number, quotaPerUnit: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * quotaPerUnit)
}

/**
 * The balance share the row's meter draws. DERIVED IN THIS PAGE — the server sends
 * no percentage:
 *
 *   share = quota ÷ (quota + used_quota)
 *
 * `quota` is what is left, `used_quota` is what has been spent, so the denominator
 * is everything the account has ever held. Returns 0 for a brand new account where
 * both are 0, which is the same thing the legacy console does.
 */
export function remainingQuotaShare(user: Pick<AdminUser, 'quota' | 'used_quota'>): number {
  const total = user.quota + user.used_quota
  if (total <= 0) return 0
  return (user.quota / total) * 100
}

/** Warns before the balance runs out. Thresholds match the legacy quota cell. */
export function quotaShareTone(share: number): Tone {
  if (share <= 10) return 'destructive'
  if (share <= 30) return 'warning'
  return 'success'
}

export type UserFormValues = {
  username: string
  display_name: string
  password: string
  /** Create only. */
  role: number
  /** Edit only. */
  group: string
  /** Edit only. */
  remark: string
}

export type UserFormErrorCode =
  | 'username-length'
  | 'display-name-length'
  | 'password-required'
  | 'password-length'
  | 'remark-length'

export type UserFormErrors = Partial<Record<'username' | 'display_name' | 'password' | 'remark', UserFormErrorCode>>

/**
 * Mirrors what the handlers enforce before the database sees the row, so the form
 * fails fast rather than round-tripping a `go-playground/validator` message:
 *
 *   username      trimmed, non-empty, `max=20`
 *   display_name  `max=20` (blank is fine: CreateUser copies the username)
 *   password      `min=8,max=20`; required on create, "leave blank to keep" on edit
 *   remark        `max=255`
 *
 * Character counts use spread, so an astral-plane character counts once — the same
 * way Go's validator counts runes.
 */
export function validateUserForm(
  values: UserFormValues,
  options: { isEdit: boolean },
): UserFormErrors {
  const errors: UserFormErrors = {}

  const usernameLength = [...values.username.trim()].length
  if (usernameLength === 0 || usernameLength > USERNAME_MAX_LENGTH) {
    errors.username = 'username-length'
  }

  if ([...values.display_name.trim()].length > DISPLAY_NAME_MAX_LENGTH) {
    errors.display_name = 'display-name-length'
  }

  const passwordLength = [...values.password].length
  if (!options.isEdit && passwordLength === 0) {
    errors.password = 'password-required'
  } else if (
    passwordLength > 0
    && (passwordLength < PASSWORD_MIN_LENGTH || passwordLength > PASSWORD_MAX_LENGTH)
  ) {
    errors.password = 'password-length'
  }

  if (options.isEdit && [...values.remark].length > REMARK_MAX_LENGTH) {
    errors.remark = 'remark-length'
  }

  return errors
}

/**
 * `add` and `subtract` are refused for a value of 0 or less ("Quota change amount
 * cannot be zero"); `override` writes the column outright and accepts anything,
 * including a negative balance.
 */
export function isQuotaAmountValid(amount: number | null, mode: string): boolean {
  if (amount === null || !Number.isFinite(amount)) return false
  if (mode === 'override') return true
  return amount > 0
}

/**
 * The balance the account would end up with, shown beside the amount before the
 * call goes out. Derived here; the server recomputes it the same way.
 */
export function previewQuota(currentQuota: number, mode: string, deltaQuota: number): number {
  if (mode === 'override') return deltaQuota
  if (mode === 'subtract') return currentQuota - deltaQuota
  return currentQuota + deltaQuota
}
