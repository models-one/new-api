// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PENDING_2FA_STORAGE_KEY,
  clearPending2FAChallenge,
  readPending2FAChallenge,
  setPending2FAChallenge,
} from '@/features/auth/otp/pending-2fa'

const FUTURE = Math.floor(Date.now() / 1000) + 300

beforeEach(() => {
  globalThis.sessionStorage.clear()
  clearPending2FAChallenge()
})

afterEach(() => {
  globalThis.sessionStorage.clear()
  clearPending2FAChallenge()
})

describe('pending 2FA challenge', () => {
  it('reads back what the sign-in page stored', () => {
    setPending2FAChallenge({ expiresAt: FUTURE, flowToken: 'flow-token', redirectTo: '/wallet' })

    expect(readPending2FAChallenge()).toEqual({
      expiresAt: FUTURE,
      flowToken: 'flow-token',
      redirectTo: '/wallet',
    })
  })

  it('mirrors the challenge into sessionStorage so a reload of /otp keeps it', () => {
    setPending2FAChallenge({ expiresAt: FUTURE, flowToken: 'flow-token' })

    const raw = globalThis.sessionStorage.getItem(PENDING_2FA_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ flowToken: 'flow-token' })
  })

  it('hydrates from sessionStorage when the module loads into a fresh document', async () => {
    globalThis.sessionStorage.setItem(
      PENDING_2FA_STORAGE_KEY,
      JSON.stringify({ expiresAt: FUTURE, flowToken: 'restored', redirectTo: null }),
    )
    vi.resetModules()
    const reloaded = await import('@/features/auth/otp/pending-2fa')
    expect(reloaded.readPending2FAChallenge()?.flowToken).toBe('restored')
  })

  it('treats an already-expired challenge as absent and drops the stored copy', () => {
    setPending2FAChallenge({ expiresAt: FUTURE, flowToken: 'flow-token' })

    expect(readPending2FAChallenge(FUTURE + 1)).toBeNull()
    expect(readPending2FAChallenge()).toBeNull()
    expect(globalThis.sessionStorage.getItem(PENDING_2FA_STORAGE_KEY)).toBeNull()
  })

  it('keeps a challenge the server gave no expiry for', () => {
    setPending2FAChallenge({ flowToken: 'flow-token' })

    expect(readPending2FAChallenge()).toEqual({
      expiresAt: null,
      flowToken: 'flow-token',
      redirectTo: null,
    })
  })

  it('refuses a blank flow token instead of storing an unusable challenge', () => {
    setPending2FAChallenge({ flowToken: '   ' })

    expect(readPending2FAChallenge()).toBeNull()
    expect(globalThis.sessionStorage.getItem(PENDING_2FA_STORAGE_KEY)).toBeNull()
  })

  it('ignores a stored value that is not a usable challenge', async () => {
    globalThis.sessionStorage.setItem(PENDING_2FA_STORAGE_KEY, 'not json')

    vi.resetModules()
    const reloaded = await import('@/features/auth/otp/pending-2fa')
    expect(reloaded.readPending2FAChallenge()).toBeNull()
  })

  it('clears on request', () => {
    setPending2FAChallenge({ expiresAt: FUTURE, flowToken: 'flow-token' })
    clearPending2FAChallenge()

    expect(readPending2FAChallenge()).toBeNull()
    expect(globalThis.sessionStorage.getItem(PENDING_2FA_STORAGE_KEY)).toBeNull()
  })
})
