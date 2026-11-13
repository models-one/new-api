import { describe, expect, it } from 'vitest'

import {
  OAUTH_BIND_CALLBACK_MESSAGE,
  OAUTH_BIND_RESULT_MESSAGE,
  buildBindCallbackMessage,
  isOAuthBindResult,
} from '@/features/auth/callback/bind-window'

describe('isOAuthBindResult', () => {
  const result = {
    type: OAUTH_BIND_RESULT_MESSAGE,
    provider: 'github',
    state: 'flow-token',
    success: true,
  }

  it('accepts the opener answering this exact handshake', () => {
    expect(isOAuthBindResult(result, 'github', 'flow-token')).toBe(true)
  })

  it('rejects a verdict meant for another provider or another attempt', () => {
    expect(isOAuthBindResult(result, 'discord', 'flow-token')).toBe(false)
    expect(isOAuthBindResult(result, 'github', 'other-flow')).toBe(false)
  })

  it('rejects anything that is not a bind result at all', () => {
    expect(isOAuthBindResult({ type: 'something-else' }, 'github', 'flow-token')).toBe(false)
    expect(isOAuthBindResult(null, 'github', 'flow-token')).toBe(false)
    expect(isOAuthBindResult('oauth:binding:result', 'github', 'flow-token')).toBe(false)
    expect(
      isOAuthBindResult({ ...result, success: 'yes' }, 'github', 'flow-token'),
    ).toBe(false)
  })
})

describe('buildBindCallbackMessage', () => {
  it('drops empty provider errors rather than posting blank fields', () => {
    expect(
      buildBindCallbackMessage({
        provider: 'github',
        code: 'the-code',
        state: 'flow-token',
        error: '',
        errorDescription: '',
      }),
    ).toEqual({
      type: OAUTH_BIND_CALLBACK_MESSAGE,
      provider: 'github',
      code: 'the-code',
      state: 'flow-token',
      error: undefined,
      errorDescription: undefined,
    })
  })

  it('forwards a provider error so the opener can explain the refusal', () => {
    expect(
      buildBindCallbackMessage({
        provider: 'github',
        code: '',
        state: 'flow-token',
        error: 'access_denied',
        errorDescription: 'The user denied the request',
      }),
    ).toMatchObject({ error: 'access_denied', errorDescription: 'The user denied the request' })
  })
})
