// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  signInSearchSchema,
  signedInRedirectTarget,
  skipSignInWhenAuthenticated,
} from '@/features/auth/sign-in/route-guard'
import { useAuthStore } from '@/stores/auth-store'

import type { AuthBundle } from '@/features/auth/types'

/** The router's own `redirect` throws an opaque object; this keeps the assertion honest. */
vi.mock('@tanstack/react-router', () => ({
  redirect: (options: unknown) => Object.assign(new Error('redirect'), { options }),
}))

const ORIGIN = 'https://console.example.com'

const signedInBundle: AuthBundle = {
  access_token: 'token',
  token_type: 'Bearer',
  access_expires_at: 1788014277,
  user: { id: 1, username: 'root', role: 100 },
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

describe('signInSearchSchema', () => {
  it('accepts a bare visit with no redirect', () => {
    expect(signInSearchSchema.parse({})).toEqual({ redirect: undefined })
  })

  it('keeps the redirect as a raw string, deliberately unvalidated at this layer', () => {
    expect(signInSearchSchema.parse({ redirect: 'https://evil.test/steal' }))
      .toEqual({ redirect: 'https://evil.test/steal' })
  })

  it('rejects a non-string redirect', () => {
    expect(signInSearchSchema.safeParse({ redirect: 42 }).success).toBe(false)
  })
})

describe('signedInRedirectTarget', () => {
  it('renders the page for an anonymous visitor', () => {
    expect(signedInRedirectTarget(false, '/wallet', ORIGIN)).toBeNull()
  })

  it('sends a signed-in visitor to the requested page', () => {
    expect(signedInRedirectTarget(true, '/wallet?tab=history', ORIGIN)).toBe('/wallet?tab=history')
  })

  it('falls back to the dashboard when no redirect was requested', () => {
    expect(signedInRedirectTarget(true, undefined, ORIGIN)).toBe('/dashboard')
  })

  it('refuses to forward a signed-in visitor to another origin', () => {
    expect(signedInRedirectTarget(true, 'https://evil.test/steal', ORIGIN)).toBe('/dashboard')
    expect(signedInRedirectTarget(true, '//evil.test/steal', ORIGIN)).toBe('/dashboard')
  })
})

describe('skipSignInWhenAuthenticated', () => {
  beforeEach(() => {
    useAuthStore.getState().auth.reset()
  })

  it('lets an anonymous visitor see the form', () => {
    expect(() => skipSignInWhenAuthenticated({ redirect: '/wallet' })).not.toThrow()
  })

  it('skips the page for a visitor who already holds a session', () => {
    useAuthStore.getState().auth.setBundle(signedInBundle)

    expect(() => skipSignInWhenAuthenticated({ redirect: '/wallet' }))
      .toThrow(expect.objectContaining({
        options: { href: '/wallet', replace: true },
      }))
  })

  it('never forwards a signed-in visitor to another origin', () => {
    useAuthStore.getState().auth.setBundle(signedInBundle)

    expect(() => skipSignInWhenAuthenticated({ redirect: 'https://evil.test/steal' }))
      .toThrow(expect.objectContaining({
        options: { href: '/dashboard', replace: true },
      }))
  })
})
