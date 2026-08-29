// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'

import {
  REFERRAL_STORAGE_KEY,
  captureReferralCode,
  clearReferralCode,
  readReferralCode,
  saveReferralCode,
} from '@/features/auth/referral'

beforeEach(() => {
  window.localStorage.clear()
})

describe('referral code capture', () => {
  it('persists the aff parameter and reads it back', () => {
    expect(captureReferralCode('?aff=PARTNER7')).toBe('PARTNER7')
    expect(window.localStorage.getItem(REFERRAL_STORAGE_KEY)).toBe('PARTNER7')
    expect(readReferralCode()).toBe('PARTNER7')
  })

  it('trims the code and ignores a blank one', () => {
    expect(captureReferralCode('?aff=%20%20SPACED%20%20')).toBe('SPACED')

    window.localStorage.clear()
    expect(captureReferralCode('?aff=%20%20')).toBe('')
    expect(window.localStorage.getItem(REFERRAL_STORAGE_KEY)).toBeNull()
  })

  it('keeps an earlier code when a later visit carries no aff parameter', () => {
    saveReferralCode('PARTNER7')
    expect(captureReferralCode('?tab=usage')).toBe('PARTNER7')
    expect(captureReferralCode('')).toBe('PARTNER7')
  })

  it('replaces the stored code when a new referral link is used', () => {
    saveReferralCode('OLD')
    expect(captureReferralCode('?aff=NEW')).toBe('NEW')
  })

  it('reports no code once cleared', () => {
    saveReferralCode('PARTNER7')
    clearReferralCode()
    expect(readReferralCode()).toBe('')
  })
})
