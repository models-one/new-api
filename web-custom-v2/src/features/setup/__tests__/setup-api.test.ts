import { describe, expect, it } from 'vitest'

import {
  buildSetupPayload,
  usernameByteLength,
  validateSetupCredentials,
} from '@/features/setup/api'

const valid = { confirmPassword: 'hunter2hunter2', password: 'hunter2hunter2', username: 'root' }

describe('validateSetupCredentials', () => {
  it('accepts credentials the server would accept', () => {
    expect(validateSetupCredentials(valid)).toEqual({})
  })

  it('requires a username', () => {
    expect(validateSetupCredentials({ ...valid, username: '   ' })).toEqual({
      username: 'username-required',
    })
  })

  it('enforces the server 12-byte username cap', () => {
    expect(validateSetupCredentials({ ...valid, username: 'a'.repeat(12) })).toEqual({})
    expect(validateSetupCredentials({ ...valid, username: 'a'.repeat(13) })).toEqual({
      username: 'username-too-long',
    })
  })

  it('counts bytes, not characters, the way PostSetup does', () => {
    // Four CJK characters are 12 UTF-8 bytes; five are 15 and the server would reject them.
    expect(usernameByteLength('管理员账')).toBe(12)
    expect(validateSetupCredentials({ ...valid, username: '管理员账' })).toEqual({})
    expect(validateSetupCredentials({ ...valid, username: '管理员账号' })).toEqual({
      username: 'username-too-long',
    })
  })

  it('enforces the 8 character password minimum', () => {
    expect(
      validateSetupCredentials({ confirmPassword: 'short12', password: 'short12', username: 'root' }),
    ).toEqual({ password: 'password-too-short' })
  })

  it('requires both passwords to match', () => {
    expect(validateSetupCredentials({ ...valid, confirmPassword: 'different1' })).toEqual({
      confirmPassword: 'password-mismatch',
    })
  })
})

describe('buildSetupPayload', () => {
  it('sends both mode flags false for external operation', () => {
    expect(buildSetupPayload({ ...valid, usageMode: 'external' }, false)).toEqual({
      DemoSiteEnabled: false,
      SelfUseModeEnabled: false,
      confirmPassword: 'hunter2hunter2',
      password: 'hunter2hunter2',
      username: 'root',
    })
  })

  it('maps personal use and demo site onto the two server flags', () => {
    expect(buildSetupPayload({ ...valid, usageMode: 'self' }, false)).toMatchObject({
      DemoSiteEnabled: false,
      SelfUseModeEnabled: true,
    })
    expect(buildSetupPayload({ ...valid, usageMode: 'demo' }, false)).toMatchObject({
      DemoSiteEnabled: true,
      SelfUseModeEnabled: false,
    })
  })

  it('omits the credentials the server ignores once a root user exists', () => {
    expect(buildSetupPayload({ ...valid, usageMode: 'external' }, true)).toEqual({
      DemoSiteEnabled: false,
      SelfUseModeEnabled: false,
    })
  })

  it('trims the username it sends', () => {
    expect(buildSetupPayload({ ...valid, usageMode: 'external', username: '  root ' }, false)).toMatchObject(
      { username: 'root' },
    )
  })
})
