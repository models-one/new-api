import { describe, expect, it } from 'vitest'

import { getSavedLanguage, resolveAuthRedirect, sanitizeAuthRedirect } from '@/features/auth/auth-redirect'

const origin = 'https://dashboard.example.com'

describe('sanitizeAuthRedirect', () => {
  it('preserves safe internal paths, search parameters and fragments', () => {
    expect(sanitizeAuthRedirect('/console?tab=usage#recent', origin)).toBe('/console?tab=usage#recent')
    expect(sanitizeAuthRedirect('https://dashboard.example.com/dashboard?tab=quota#daily', origin))
      .toBe('/dashboard?tab=quota#daily')
  })

  it('rejects external and ambiguously parsed redirect targets', () => {
    const unsafeTargets: unknown[] = [
      undefined,
      '',
      'dashboard',
      '//attacker.example/path',
      'https://attacker.example/path',
      'javascript:alert(1)',
      '/\\attacker.example/path',
      'https:\\attacker.example/path',
    ]

    for (const target of unsafeTargets) {
      expect(sanitizeAuthRedirect(target, origin)).toBeNull()
    }
  })

  it('rejects a target on another port or scheme of the same host', () => {
    expect(sanitizeAuthRedirect('https://dashboard.example.com:8443/dashboard', origin)).toBeNull()
    expect(sanitizeAuthRedirect('http://dashboard.example.com/dashboard', origin)).toBeNull()
  })

  it('rejects invalid or non-HTTP application origins', () => {
    expect(sanitizeAuthRedirect('/dashboard', 'not-an-origin')).toBeNull()
    expect(sanitizeAuthRedirect('/dashboard', 'file:///tmp/app')).toBeNull()
  })
})

describe('resolveAuthRedirect', () => {
  it('falls back when the requested target is unsafe', () => {
    expect(resolveAuthRedirect('https://attacker.example', origin)).toBe('/dashboard')
    expect(resolveAuthRedirect(null, origin, '/wallet')).toBe('/wallet')
  })

  it('returns the sanitized target when it is safe', () => {
    expect(resolveAuthRedirect('/logs?page=2', origin)).toBe('/logs?page=2')
  })
})

describe('getSavedLanguage', () => {
  it('prefers the explicit user language', () => {
    expect(getSavedLanguage({ language: 'ja', setting: { language: 'fr' } })).toBe('ja')
  })

  it('reads object and JSON string settings', () => {
    expect(getSavedLanguage({ setting: { language: 'fr' } })).toBe('fr')
    expect(getSavedLanguage({ setting: '{"language":"ru"}' })).toBe('ru')
  })

  it('ignores malformed and non-string setting languages', () => {
    expect(getSavedLanguage({ setting: '{' })).toBeUndefined()
    expect(getSavedLanguage({ setting: { language: 123 } })).toBeUndefined()
    expect(getSavedLanguage({})).toBeUndefined()
  })
})
