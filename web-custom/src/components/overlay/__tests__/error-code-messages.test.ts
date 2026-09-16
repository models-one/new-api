import { describe, expect, it } from 'vitest'

import '@/i18n/config'
import { toErrorMessage } from '@/components/overlay/toast'

/** An axios-shaped rejection carrying the console's `{ success, message, code }` envelope. */
function serverError(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  })
}

describe('server error codes become copy a reader can act on', () => {
  /**
   * `/api/user/login` refuses a session-cap breach with `code: 'AUTH_SESSION_LIMIT'` and
   * `message: 'Conflict'`. Rendering the message put the single word "Conflict" in the
   * sign-in form, which names nothing and offers no way forward.
   */
  it('prefers the code over an HTTP reason phrase', () => {
    const message = toErrorMessage(
      serverError(409, { success: false, message: 'Conflict', code: 'AUTH_SESSION_LIMIT' }),
    )

    expect(message).not.toBe('Conflict')
    expect(message).toMatch(/too many devices/i)
    expect(message).toMatch(/sign the others out|reset your password/i)
  })

  /** A server that explains itself is still trusted ahead of the generic status copy. */
  it('keeps a real envelope message when there is no known code', () => {
    const message = toErrorMessage(
      serverError(400, { success: false, message: 'That redemption code was already used.' }),
    )

    expect(message).toBe('That redemption code was already used.')
  })

  /** Nothing useful in the body: the status still has to say something human. */
  it('falls back to status copy rather than the axios sentence', () => {
    const message = toErrorMessage(serverError(429, ''))

    expect(message).not.toMatch(/status code/i)
    expect(message).toMatch(/too many attempts/i)
  })
})
