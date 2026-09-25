import { describe, expect, it } from 'vitest'

import { OAUTH_BIND_CALLBACK_MESSAGE } from '@/features/auth/callback/bind-window'
import { readBindCallback, readBindOutcome } from '@/features/profile/use-oauth-bind'

const message = (overrides: Record<string, unknown> = {}) => ({
  code: 'auth-code',
  provider: 'github',
  state: 'flow-1',
  type: OAUTH_BIND_CALLBACK_MESSAGE,
  ...overrides,
})

describe('readBindCallback', () => {
  it('accepts the popup message for the attempt in flight', () => {
    expect(readBindCallback(message(), 'github', 'flow-1')).toEqual({
      code: 'auth-code',
      error: '',
      errorDescription: '',
      provider: 'github',
      state: 'flow-1',
    })
  })

  it('rejects a stale state, which would otherwise spend a burnt authorization code', () => {
    expect(readBindCallback(message({ state: 'flow-0' }), 'github', 'flow-1')).toBeNull()
  })

  it('rejects a message naming a different provider', () => {
    expect(readBindCallback(message({ provider: 'discord' }), 'github', 'flow-1')).toBeNull()
  })

  it('rejects anything that is not the bind callback message', () => {
    expect(readBindCallback({ ...message(), type: 'something-else' }, 'github', 'flow-1')).toBeNull()
    expect(readBindCallback('github', 'github', 'flow-1')).toBeNull()
    expect(readBindCallback(null, 'github', 'flow-1')).toBeNull()
  })

  it('keeps a provider-reported error even when no code came back', () => {
    const callback = readBindCallback(
      message({ code: undefined, error: 'access_denied', errorDescription: 'User cancelled' }),
      'github',
      'flow-1',
    )
    expect(callback).toEqual({
      code: '',
      error: 'access_denied',
      errorDescription: 'User cancelled',
      provider: 'github',
      state: 'flow-1',
    })
  })
})

describe('readBindOutcome', () => {
  it('reads the success envelope', () => {
    expect(readBindOutcome({ message: '', success: true })).toEqual({ message: '', success: true })
  })

  it('keeps the server explanation from a refusal, whichever status carried it', () => {
    expect(readBindOutcome({ message: 'State parameter is empty or mismatched', success: false }))
      .toEqual({ message: 'State parameter is empty or mismatched', success: false })
  })

  it('never reports success for a body it could not read', () => {
    expect(readBindOutcome(undefined)).toEqual({ message: '', success: false })
    expect(readBindOutcome('gateway timeout')).toEqual({ message: '', success: false })
    expect(readBindOutcome({ success: 'true' })).toEqual({ message: '', success: false })
  })
})
