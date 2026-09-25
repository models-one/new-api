import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'

import {
  describeDevice,
  describeLoginMethod,
  orderSessions,
} from '@/features/profile/security/session-display'
import { requiredMethodFor } from '@/features/profile/security/step-up'

/** The identity translator: these helpers are tested on their branching, not their copy. */
const t = ((key: string) => key) as unknown as TFunction

describe('describeDevice', () => {
  it('resolves Edge before Chrome, because an Edge user-agent contains "Chrome/"', () => {
    const edge = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
    expect(describeDevice(edge, 'unknown', 'browser')).toBe('Edge · Windows')
  })

  it('resolves Chrome before Safari, because a Chrome user-agent contains "Safari/"', () => {
    const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36'
    expect(describeDevice(chrome, 'unknown', 'browser')).toBe('Chrome · macOS')
  })

  it('recognises real Safari', () => {
    const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1'
    expect(describeDevice(safari, 'unknown', 'browser')).toBe('Safari · iOS')
  })

  it('falls back to the generic browser label for a client it cannot place', () => {
    expect(describeDevice('curl/8.7.1', 'unknown', 'Other browser')).toBe('Other browser')
  })

  it('uses the unknown label only for an empty user-agent', () => {
    expect(describeDevice('', 'Unknown device', 'browser')).toBe('Unknown device')
    expect(describeDevice('   ', 'Unknown device', 'browser')).toBe('Unknown device')
  })
})

describe('describeLoginMethod', () => {
  it('names the credentials the server writes', () => {
    expect(describeLoginMethod('password', t)).toBe('Password')
    expect(describeLoginMethod('2fa', t)).toBe('Two-factor authentication')
    expect(describeLoginMethod('passkey', t)).toBe('Passkey')
  })

  it('expands the oauth:<provider> form', () => {
    expect(describeLoginMethod('oauth:github', t)).toBe('OAuth · GitHub')
    expect(describeLoginMethod('oauth:linuxdo', t)).toBe('OAuth · LinuxDO')
  })

  it('keeps an unknown provider verbatim rather than dropping it', () => {
    expect(describeLoginMethod('oauth:acme-sso', t)).toBe('OAuth · acme-sso')
  })

  it('returns an unrecognised method verbatim rather than mislabelling it', () => {
    expect(describeLoginMethod('smartcard', t)).toBe('smartcard')
  })

  it('treats empty and "unknown" alike', () => {
    expect(describeLoginMethod('', t)).toBe('Unknown')
    expect(describeLoginMethod('unknown', t)).toBe('Unknown')
  })
})

describe('orderSessions', () => {
  it('puts the current session first and the rest newest-active first', () => {
    const ordered = orderSessions([
      { sid: 'a', current: false, last_active_at: 100 },
      { sid: 'b', current: false, last_active_at: 300 },
      { sid: 'c', current: true, last_active_at: 50 },
    ])
    expect(ordered.map((session) => session.sid)).toEqual(['c', 'b', 'a'])
  })

  it('does not mutate its input', () => {
    const input = [
      { sid: 'a', current: false, last_active_at: 1 },
      { sid: 'b', current: true, last_active_at: 2 },
    ]
    orderSessions(input)
    expect(input.map((session) => session.sid)).toEqual(['a', 'b'])
  })
})

/**
 * These four rows are the contract in `controller/passkey.go`. Getting one wrong
 * means either an unnecessary prompt or a request that dies on a 403.
 */
describe('requiredMethodFor', () => {
  it('asks for nothing to register while two-factor is off', () => {
    expect(requiredMethodFor('passkey.register', { twoFactorEnabled: false, passkeyEnabled: false }))
      .toEqual({ kind: 'none' })
  })

  it('asks for two-factor to register while two-factor is on', () => {
    expect(requiredMethodFor('passkey.register', { twoFactorEnabled: true, passkeyEnabled: true }))
      .toEqual({ kind: 'method', method: '2fa' })
  })

  it('asks for two-factor to remove while two-factor is on, even though a passkey exists', () => {
    expect(requiredMethodFor('passkey.delete', { twoFactorEnabled: true, passkeyEnabled: true }))
      .toEqual({ kind: 'method', method: '2fa' })
  })

  it('asks for the passkey itself to remove it while two-factor is off', () => {
    expect(requiredMethodFor('passkey.delete', { twoFactorEnabled: false, passkeyEnabled: true }))
      .toEqual({ kind: 'method', method: 'passkey' })
  })

  it('asks for nothing when there is no passkey to remove and no factor to prove it with', () => {
    expect(requiredMethodFor('passkey.delete', { twoFactorEnabled: false, passkeyEnabled: false }))
      .toEqual({ kind: 'none' })
  })
})
