import { describe, expect, it } from 'vitest'

import { rejectionMessage } from '@/features/auth/sign-in/rejection-message'

/** Stands in for i18next: the key is the English source string. */
const t = (key: string) => key

describe('rejectionMessage', () => {
  it('replaces the bare HTTP status text a session-limit refusal arrives with', () => {
    // service/auth_session.go answers 409 with code AUTH_SESSION_LIMIT and leaves the
    // message as "Conflict", which tells the user nothing about what to do.
    expect(rejectionMessage('AUTH_SESSION_LIMIT', 'Conflict', t)).toBe(
      'You are signed in on too many devices. Sign out somewhere else, then try again.',
    )
  })

  it('explains a throttled sign-in rather than showing "Too Many Requests"', () => {
    expect(rejectionMessage('AUTH_SESSION_ISSUANCE_LIMIT', 'Too Many Requests', t)).toBe(
      'Too many sign-in attempts. Please wait a moment before trying again.',
    )
  })

  it('keeps the server message for an uncoded refusal, which is already meaningful', () => {
    expect(
      rejectionMessage('', 'Username or password is incorrect, or user has been banned', t),
    ).toBe('Username or password is incorrect, or user has been banned')
  })

  it('falls back to generic copy when the server sent neither a code nor a message', () => {
    expect(rejectionMessage('', '', t)).toBe('Sign-in failed. Please try again.')
  })

  it('keeps the server message for a code it does not recognise', () => {
    expect(rejectionMessage('SOME_FUTURE_CODE', 'Account is pending review', t)).toBe(
      'Account is pending review',
    )
  })
})
