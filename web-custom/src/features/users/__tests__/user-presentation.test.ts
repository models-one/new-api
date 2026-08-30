import { describe, expect, it } from 'vitest'

import type { AdminUser } from '@/features/users/api'
import {
  canManageTargetRole,
  creatableRoles,
  currencyToQuota,
  isQuotaAmountValid,
  isUserDeleted,
  previewQuota,
  quotaShareTone,
  remainingQuotaShare,
  resolveUserActions,
  USER_ROLE,
  USER_STATUS,
  userRowState,
  validateUserForm,
  type UserFormValues,
} from '@/features/users/user-presentation'

/** A verbatim row from `GET /api/user/?p=1&page_size=10` on the dev server. */
const baseUser: AdminUser = {
  DeletedAt: null,
  aff_code: '799u',
  aff_count: 0,
  aff_history_quota: 0,
  aff_quota: 0,
  created_at: 1_788_017_013,
  discord_id: '',
  display_name: 'Probe Ident',
  email: '',
  github_id: '',
  group: 'default',
  id: 9,
  inviter_id: 0,
  last_login_at: 1_788_017_055,
  linux_do_id: '',
  oidc_id: '',
  quota: 0,
  request_count: 0,
  role: USER_ROLE.common,
  status: USER_STATUS.enabled,
  stripe_customer: '',
  telegram_id: '',
  used_quota: 0,
  username: 'probe_ident',
  wechat_id: '',
}

function user(overrides: Partial<AdminUser>): AdminUser {
  return { ...baseUser, ...overrides }
}

describe('canManageTargetRole', () => {
  it('lets root reach every role, including another root', () => {
    expect(canManageTargetRole(USER_ROLE.root, USER_ROLE.root)).toBe(true)
    expect(canManageTargetRole(USER_ROLE.root, USER_ROLE.admin)).toBe(true)
    expect(canManageTargetRole(USER_ROLE.root, USER_ROLE.common)).toBe(true)
  })

  it('stops an admin at its own rank, the way the handler does', () => {
    expect(canManageTargetRole(USER_ROLE.admin, USER_ROLE.common)).toBe(true)
    expect(canManageTargetRole(USER_ROLE.admin, USER_ROLE.admin)).toBe(false)
    expect(canManageTargetRole(USER_ROLE.admin, USER_ROLE.root)).toBe(false)
  })
})

describe('row state', () => {
  it('treats a set DeletedAt as deleted whatever the status column still says', () => {
    const row = user({ DeletedAt: '2026-08-29T23:24:15.246953+08:00', status: USER_STATUS.enabled })
    expect(isUserDeleted(row)).toBe(true)
    expect(userRowState(row)).toBe('deleted')
  })

  it('separates enabled from disabled for a live row', () => {
    expect(userRowState(user({ status: USER_STATUS.enabled }))).toBe('enabled')
    expect(userRowState(user({ status: USER_STATUS.disabled }))).toBe('disabled')
  })
})

describe('resolveUserActions', () => {
  it('withdraws everything from a soft-deleted row, which no endpoint will touch again', () => {
    const actions = resolveUserActions(user({ DeletedAt: '2026-08-29T23:24:15+08:00' }), USER_ROLE.root)

    for (const availability of Object.values(actions)) {
      expect(availability.allowed).toBe(false)
      expect(availability.denial).toBe('deleted')
    }
  })

  it('protects root from disable, demote and delete even for a root viewer', () => {
    const actions = resolveUserActions(user({ id: 1, role: USER_ROLE.root, username: 'root' }), USER_ROLE.root)

    expect(actions.disable).toEqual({ allowed: false, denial: 'root-protected' })
    expect(actions.demote).toEqual({ allowed: false, denial: 'root-protected' })
    // DeleteUser refuses on `myRole <= originUser.Role`, so root cannot delete root.
    expect(actions.delete).toEqual({ allowed: false, denial: 'rank' })
    // Editing and adjusting the balance are still allowed: canManageTargetRole passes.
    expect(actions.edit.allowed).toBe(true)
    expect(actions.quota.allowed).toBe(true)
  })

  it('offers promote only to root, because ManageUser requires myRole == RoleRootUser', () => {
    const target = user({ role: USER_ROLE.common })

    expect(resolveUserActions(target, USER_ROLE.root).promote).toEqual({ allowed: true })
    expect(resolveUserActions(target, USER_ROLE.admin).promote).toEqual({
      allowed: false,
      denial: 'root-only',
    })
  })

  it('names the no-op refusals rather than sending them', () => {
    const admin = user({ role: USER_ROLE.admin })
    expect(resolveUserActions(admin, USER_ROLE.root).promote).toEqual({
      allowed: false,
      denial: 'already-admin',
    })
    expect(resolveUserActions(user({ role: USER_ROLE.common }), USER_ROLE.root).demote).toEqual({
      allowed: false,
      denial: 'already-common',
    })
    expect(resolveUserActions(user({ status: USER_STATUS.enabled }), USER_ROLE.root).enable).toEqual({
      allowed: false,
      denial: 'already-enabled',
    })
    expect(resolveUserActions(user({ status: USER_STATUS.disabled }), USER_ROLE.root).disable).toEqual({
      allowed: false,
      denial: 'already-disabled',
    })
  })

  it('refuses an admin every action against a peer administrator', () => {
    const actions = resolveUserActions(user({ role: USER_ROLE.admin }), USER_ROLE.admin)

    expect(actions.edit).toEqual({ allowed: false, denial: 'rank' })
    expect(actions.quota).toEqual({ allowed: false, denial: 'rank' })
    expect(actions.delete).toEqual({ allowed: false, denial: 'rank' })
    expect(actions.disable).toEqual({ allowed: false, denial: 'rank' })
  })

  it('lets an admin act on a regular user, including the hard delete', () => {
    const actions = resolveUserActions(user({ role: USER_ROLE.common }), USER_ROLE.admin)

    expect(actions.edit.allowed).toBe(true)
    expect(actions.quota.allowed).toBe(true)
    expect(actions.disable.allowed).toBe(true)
    expect(actions.delete.allowed).toBe(true)
  })
})

describe('creatableRoles', () => {
  it('mirrors the `user.Role >= myRole` refusal in CreateUser', () => {
    expect(creatableRoles(USER_ROLE.root)).toEqual([USER_ROLE.common, USER_ROLE.admin])
    expect(creatableRoles(USER_ROLE.admin)).toEqual([USER_ROLE.common])
  })
})

describe('quota arithmetic', () => {
  it('multiplies by quota_per_unit rather than a hardcoded divisor', () => {
    expect(currencyToQuota(2.5, 500_000)).toBe(1_250_000)
    expect(currencyToQuota(1, 1_000)).toBe(1_000)
    expect(currencyToQuota(Number.NaN, 500_000)).toBe(0)
  })

  it('derives the balance share as quota / (quota + used_quota)', () => {
    expect(remainingQuotaShare({ quota: 250_000, used_quota: 250_000 })).toBe(50)
    expect(remainingQuotaShare({ quota: 0, used_quota: 0 })).toBe(0)
    expect(remainingQuotaShare({ quota: 0, used_quota: 500_000 })).toBe(0)
  })

  it('escalates the meter tone as the balance runs down', () => {
    expect(quotaShareTone(80)).toBe('success')
    expect(quotaShareTone(25)).toBe('warning')
    expect(quotaShareTone(5)).toBe('destructive')
  })

  it('rejects a non-positive add or subtract, which the server calls a change of zero', () => {
    expect(isQuotaAmountValid(0, 'add')).toBe(false)
    expect(isQuotaAmountValid(-1, 'subtract')).toBe(false)
    expect(isQuotaAmountValid(0.5, 'add')).toBe(true)
    expect(isQuotaAmountValid(null, 'override')).toBe(false)
  })

  it('accepts a negative override, the one mode that writes the column outright', () => {
    expect(isQuotaAmountValid(-5, 'override')).toBe(true)
    expect(previewQuota(1_000, 'override', -500)).toBe(-500)
    expect(previewQuota(1_000, 'add', 500)).toBe(1_500)
    expect(previewQuota(1_000, 'subtract', 500)).toBe(500)
  })
})

describe('validateUserForm', () => {
  const form: UserFormValues = {
    display_name: '',
    group: 'default',
    password: 'Passw0rd-123',
    remark: '',
    role: USER_ROLE.common,
    username: 'probe',
  }

  it('accepts a form the handlers would accept', () => {
    expect(validateUserForm(form, { isEdit: false })).toEqual({})
  })

  it('enforces the 20-character username the model declares', () => {
    expect(validateUserForm({ ...form, username: '   ' }, { isEdit: false }).username)
      .toBe('username-length')
    expect(validateUserForm({ ...form, username: 'x'.repeat(21) }, { isEdit: false }).username)
      .toBe('username-length')
    expect(validateUserForm({ ...form, username: 'x'.repeat(20) }, { isEdit: false }).username)
      .toBeUndefined()
  })

  it('requires a password on create and treats a blank one as "keep" on edit', () => {
    expect(validateUserForm({ ...form, password: '' }, { isEdit: false }).password)
      .toBe('password-required')
    expect(validateUserForm({ ...form, password: '' }, { isEdit: true }).password)
      .toBeUndefined()
  })

  it('holds a supplied password to the 8-20 range go-playground enforces', () => {
    expect(validateUserForm({ ...form, password: 'short' }, { isEdit: true }).password)
      .toBe('password-length')
    expect(validateUserForm({ ...form, password: 'y'.repeat(21) }, { isEdit: false }).password)
      .toBe('password-length')
  })

  it('caps the admin note at 255 characters, and only on the edit path that sends it', () => {
    expect(validateUserForm({ ...form, remark: 'r'.repeat(256) }, { isEdit: true }).remark)
      .toBe('remark-length')
    expect(validateUserForm({ ...form, remark: 'r'.repeat(256) }, { isEdit: false }).remark)
      .toBeUndefined()
  })
})
