import { describe, expect, it } from 'vitest'

import { REDEMPTION_STATUS, type RedemptionCode } from '@/features/redemption/api'
import {
  canEditRedemption,
  canToggleRedemption,
  currencyToQuota,
  isRedemptionExpired,
  redemptionState,
  resolveExpiryTimestamp,
  validateRedemptionForm,
} from '@/features/redemption/redemption-presentation'

const NOW = 1_788_016_601

function code(overrides: Partial<RedemptionCode> = {}): RedemptionCode {
  return {
    created_time: NOW - 3600,
    expired_time: 0,
    id: 1,
    key: 'aaaaaaaabbbbccccddddeeeeffff0001',
    name: 'probe',
    quota: 500_000,
    redeemed_time: 0,
    status: REDEMPTION_STATUS.unused,
    used_user_id: 0,
    user_id: 1,
    ...overrides,
  }
}

describe('redemptionState', () => {
  it('reads an unused code with no expiry as unused', () => {
    expect(redemptionState(code(), NOW)).toBe('unused')
  })

  it('derives expired only for an unused code whose expiry has passed', () => {
    expect(redemptionState(code({ expired_time: NOW - 1 }), NOW)).toBe('expired')
    expect(redemptionState(code({ expired_time: NOW + 1 }), NOW)).toBe('unused')
  })

  it('never calls expired_time = 0 an expiry', () => {
    expect(isRedemptionExpired(code({ expired_time: 0 }), NOW)).toBe(false)
  })

  it('keeps disabled and redeemed states even once the expiry has passed', () => {
    const lapsed = { expired_time: NOW - 10 }
    expect(redemptionState(code({ ...lapsed, status: REDEMPTION_STATUS.disabled }), NOW)).toBe('disabled')
    expect(redemptionState(code({ ...lapsed, status: REDEMPTION_STATUS.used }), NOW)).toBe('used')
  })
})

describe('row action gating', () => {
  it('offers edit only for a live unused code', () => {
    expect(canEditRedemption(code(), NOW)).toBe(true)
    expect(canEditRedemption(code({ expired_time: NOW - 1 }), NOW)).toBe(false)
    expect(canEditRedemption(code({ status: REDEMPTION_STATUS.disabled }), NOW)).toBe(false)
    expect(canEditRedemption(code({ status: REDEMPTION_STATUS.used }), NOW)).toBe(false)
  })

  it('offers the enable/disable toggle until a code is redeemed or lapsed', () => {
    expect(canToggleRedemption(code(), NOW)).toBe(true)
    expect(canToggleRedemption(code({ status: REDEMPTION_STATUS.disabled }), NOW)).toBe(true)
    expect(canToggleRedemption(code({ status: REDEMPTION_STATUS.used }), NOW)).toBe(false)
    expect(canToggleRedemption(code({ expired_time: NOW - 1 }), NOW)).toBe(false)
  })
})

describe('resolveExpiryTimestamp', () => {
  const base = new Date('2026-01-31T12:00:00.000Z')

  it('maps never to the 0 the API reads as "no expiry"', () => {
    expect(resolveExpiryTimestamp('never', base)).toBe(0)
  })

  it('advances a day and a week in whole days', () => {
    expect(resolveExpiryTimestamp('1d', base)).toBe(Math.floor(base.getTime() / 1000) + 86_400)
    expect(resolveExpiryTimestamp('1w', base)).toBe(Math.floor(base.getTime() / 1000) + 7 * 86_400)
  })

  it('advances the calendar month, matching the legacy setMonth behaviour', () => {
    const expected = new Date(base.getTime())
    expected.setMonth(expected.getMonth() + 1)
    expect(resolveExpiryTimestamp('1m', base)).toBe(Math.floor(expected.getTime() / 1000))
  })

  it('returns the row’s stored expiry for the edit-only keep option', () => {
    expect(resolveExpiryTimestamp('keep', base, 1_788_000_000)).toBe(1_788_000_000)
    expect(resolveExpiryTimestamp('keep', base)).toBe(0)
  })
})

describe('currencyToQuota', () => {
  it('multiplies by quota_per_unit and rounds to an integer', () => {
    expect(currencyToQuota(10, 500_000)).toBe(5_000_000)
    expect(currencyToQuota(0.01, 500_000)).toBe(5_000)
    expect(currencyToQuota(1 / 3, 500_000)).toBe(166_667)
  })

  it('never uses a hardcoded divisor', () => {
    expect(currencyToQuota(2, 1_000)).toBe(2_000)
  })

  it('treats a non-finite amount as zero', () => {
    expect(currencyToQuota(Number.NaN, 500_000)).toBe(0)
  })
})

describe('validateRedemptionForm', () => {
  const valid = { amount: 10, count: 1, expiry: 'never' as const, name: 'promo' }

  it('accepts a well-formed create', () => {
    expect(validateRedemptionForm(valid, { requireCount: true })).toEqual({})
  })

  it('rejects an empty or over-long name, counting characters not bytes', () => {
    expect(validateRedemptionForm({ ...valid, name: '   ' }, { requireCount: true })).toHaveProperty('name')
    expect(validateRedemptionForm({ ...valid, name: 'x'.repeat(21) }, { requireCount: true })).toHaveProperty('name')
    expect(validateRedemptionForm({ ...valid, name: '兑'.repeat(20) }, { requireCount: true })).toEqual({})
    expect(validateRedemptionForm({ ...valid, name: '兑'.repeat(21) }, { requireCount: true })).toHaveProperty('name')
  })

  it('rejects a missing or negative amount', () => {
    expect(validateRedemptionForm({ ...valid, amount: null }, { requireCount: true })).toHaveProperty('amount')
    expect(validateRedemptionForm({ ...valid, amount: -1 }, { requireCount: true })).toHaveProperty('amount')
    expect(validateRedemptionForm({ ...valid, amount: 0 }, { requireCount: true })).toEqual({})
  })

  it('holds the batch count to the server range of 1 to 100', () => {
    expect(validateRedemptionForm({ ...valid, count: 0 }, { requireCount: true })).toHaveProperty('count')
    expect(validateRedemptionForm({ ...valid, count: 101 }, { requireCount: true })).toHaveProperty('count')
    expect(validateRedemptionForm({ ...valid, count: 1.5 }, { requireCount: true })).toHaveProperty('count')
    expect(validateRedemptionForm({ ...valid, count: 100 }, { requireCount: true })).toEqual({})
  })

  it('ignores the count entirely when editing', () => {
    expect(validateRedemptionForm({ ...valid, count: null }, { requireCount: false })).toEqual({})
  })
})
