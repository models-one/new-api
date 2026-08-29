// @vitest-environment happy-dom

import '@/i18n/config'

import { renderHook } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const { useSignInCompletion } = await import('@/features/auth/sign-in/use-sign-in-completion')
const { setPending2FAChallenge, readPending2FAChallenge } = await import(
  '@/features/auth/otp/pending-2fa'
)
const { useAuthStore } = await import('@/stores/auth-store')

import type { AuthBundle } from '@/features/auth/types'

function bundleFor(setting?: string): AuthBundle {
  return {
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 1788014277,
    user: { id: 1, username: 'root', role: 100, ...(setting === undefined ? {} : { setting }) },
    session: {
      sid: 'session-id',
      current: true,
      login_method: 'password',
      ip: '127.0.0.1',
      user_agent: 'vitest',
      created_at: 1788013377,
      last_active_at: 1788013377,
      expires_at: 1790605377,
    },
  }
}

/** Runs the completion the way every one of the five mechanisms does. */
async function completeWith(bundle: AuthBundle, redirectTo?: string) {
  const { result } = renderHook(() => useSignInCompletion(redirectTo))
  await result.current(bundle)
}

beforeEach(() => {
  navigate.mockReset()
  useAuthStore.getState().auth.reset()
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('useSignInCompletion', () => {
  it('adopts the session before navigating', async () => {
    await completeWith(bundleFor())

    const { auth } = useAuthStore.getState()
    expect(auth.user?.username).toBe('root')
    expect(auth.accessToken).toBe('token')
    expect(auth.session?.sid).toBe('session-id')
  })

  it('switches the interface to the language saved on the account', async () => {
    await completeWith(bundleFor(JSON.stringify({ language: 'ja' })))

    expect(i18n.language).toBe('ja')
  })

  it('keeps the current language when the account saved none', async () => {
    await i18n.changeLanguage('fr')

    await completeWith(bundleFor())

    expect(i18n.language).toBe('fr')
  })

  it('still signs the user in when the saved language cannot be applied', async () => {
    const changeLanguage = vi.spyOn(i18n, 'changeLanguage')
      .mockRejectedValueOnce(new Error('no such bundle'))

    await completeWith(bundleFor(JSON.stringify({ language: 'ja' })))

    expect(changeLanguage).toHaveBeenCalledWith('ja')
    expect(useAuthStore.getState().auth.user?.username).toBe('root')
    expect(navigate).toHaveBeenCalledWith({ href: '/dashboard', replace: true })
    changeLanguage.mockRestore()
  })

  it('drops a half-finished second-factor challenge', async () => {
    setPending2FAChallenge({ flowToken: 'flow-token', expiresAt: 4102444800 })

    await completeWith(bundleFor())

    expect(readPending2FAChallenge()).toBeNull()
  })

  it('lands on the requested page when it is same-origin', async () => {
    await completeWith(bundleFor(), '/wallet?tab=history')

    expect(navigate).toHaveBeenCalledWith({ href: '/wallet?tab=history', replace: true })
  })

  it('sends an off-origin redirect to the dashboard instead', async () => {
    await completeWith(bundleFor(), 'https://evil.test/steal')

    expect(navigate).toHaveBeenCalledWith({ href: '/dashboard', replace: true })
  })
})
