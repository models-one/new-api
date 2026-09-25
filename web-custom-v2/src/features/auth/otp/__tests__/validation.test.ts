import { describe, expect, it } from 'vitest'

import {
  cleanBackupCode,
  formatBackupCode,
  isValidBackupCode,
  isValidTotpCode,
  sanitizeTotpCode,
} from '@/features/auth/otp/validation'

describe('sanitizeTotpCode', () => {
  it('keeps digits only', () => {
    expect(sanitizeTotpCode('1a2b3c')).toBe('123')
  })

  it('survives a code pasted with spacing, which is how authenticator apps show it', () => {
    expect(sanitizeTotpCode('123 456')).toBe('123456')
  })

  it('never grows past the field, so a long paste cannot overflow it', () => {
    expect(sanitizeTotpCode('1234567890')).toBe('123456')
  })

  it('yields an empty string when nothing numeric was entered', () => {
    expect(sanitizeTotpCode('abc-def')).toBe('')
  })
})

describe('isValidTotpCode', () => {
  it('accepts exactly six digits', () => {
    expect(isValidTotpCode('012345')).toBe(true)
  })

  it('rejects a short code', () => {
    expect(isValidTotpCode('12345')).toBe(false)
  })

  it('rejects letters, which the server also refuses', () => {
    expect(isValidTotpCode('12345a')).toBe(false)
  })
})

describe('formatBackupCode', () => {
  it('upper-cases and inserts the printed hyphen', () => {
    expect(formatBackupCode('cawdoqdv')).toBe('CAWD-OQDV')
  })

  it('leaves the first group alone until there is a second one', () => {
    expect(formatBackupCode('cawd')).toBe('CAWD')
  })

  it('re-formats a code pasted with its own separators or spacing', () => {
    expect(formatBackupCode('cawd oqdv')).toBe('CAWD-OQDV')
    expect(formatBackupCode('CAWD-OQDV')).toBe('CAWD-OQDV')
  })

  it('stops at the eight characters the server generates', () => {
    expect(formatBackupCode('CAWDOQDVEXTRA')).toBe('CAWD-OQDV')
  })
})

describe('backup code round trip', () => {
  it('strips the hyphen for the wire', () => {
    expect(cleanBackupCode('CAWD-OQDV')).toBe('CAWDOQDV')
  })

  it('accepts the formatted shape in either case', () => {
    expect(isValidBackupCode('CAWD-OQDV')).toBe(true)
    expect(isValidBackupCode('cawd-oqdv')).toBe(true)
  })

  it('rejects an unformatted or partial code', () => {
    expect(isValidBackupCode('CAWDOQDV')).toBe(false)
    expect(isValidBackupCode('CAWD-OQD')).toBe(false)
  })
})
