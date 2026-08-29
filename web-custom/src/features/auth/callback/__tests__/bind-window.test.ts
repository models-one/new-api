import { describe, expect, it, vi } from 'vitest'

import {
  OAUTH_BIND_CALLBACK_MESSAGE,
  OAUTH_BIND_RESULT_MESSAGE,
  TELEGRAM_BIND_RESULT_MESSAGE,
  buildBindCallbackMessage,
  isOAuthBindResult,
  parseTelegramBindCallback,
  postTelegramBindResult,
} from '@/features/auth/callback/bind-window'

describe('parseTelegramBindCallback', () => {
  it('ignores a callback that is not a Telegram bind result', () => {
    expect(parseTelegramBindCallback({})).toBeNull()
    expect(parseTelegramBindCallback({ telegram_bind: 'maybe', flow_token: 'f' })).toBeNull()
  })

  it('reads a success', () => {
    expect(parseTelegramBindCallback({ telegram_bind: 'success', flow_token: 'flow' })).toEqual({
      kind: 'result',
      flowToken: 'flow',
      success: true,
    })
  })

  it('carries the backend error code through on a failure', () => {
    expect(
      parseTelegramBindCallback({
        telegram_bind: 'error',
        flow_token: 'flow',
        error_code: 'already_bound',
      }),
    ).toEqual({ kind: 'result', flowToken: 'flow', success: false, code: 'already_bound' })
  })

  it('refuses a result with no flow token, which the opener could not match', () => {
    expect(parseTelegramBindCallback({ telegram_bind: 'success' })).toEqual({ kind: 'invalid' })
    expect(parseTelegramBindCallback({ telegram_bind: 'error', flow_token: '' }))
      .toEqual({ kind: 'invalid' })
  })
})

describe('postTelegramBindResult', () => {
  it('hands the verdict to the opener at this origin', () => {
    const postMessage = vi.fn()
    const sent = postTelegramBindResult(
      { kind: 'result', flowToken: 'flow', success: true },
      { closed: false, postMessage },
      'https://console.test',
    )

    expect(sent).toBe(true)
    expect(postMessage).toHaveBeenCalledWith(
      { type: TELEGRAM_BIND_RESULT_MESSAGE, flow_token: 'flow', success: true, code: undefined },
      'https://console.test',
    )
  })

  it('reports failure when there is nobody left to tell', () => {
    const postMessage = vi.fn()

    expect(
      postTelegramBindResult({ kind: 'result', flowToken: 'f', success: true }, null, 'https://c.test'),
    ).toBe(false)
    expect(
      postTelegramBindResult(
        { kind: 'result', flowToken: 'f', success: true },
        { closed: true, postMessage },
        'https://c.test',
      ),
    ).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('reports failure for an incomplete callback', () => {
    const postMessage = vi.fn()

    expect(postTelegramBindResult({ kind: 'invalid' }, { closed: false, postMessage }, 'https://c.test'))
      .toBe(false)
    expect(postTelegramBindResult(null, { closed: false, postMessage }, 'https://c.test')).toBe(false)
  })
})

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
