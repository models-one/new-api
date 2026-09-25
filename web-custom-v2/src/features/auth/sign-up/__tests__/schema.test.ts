import { describe, expect, it } from 'vitest'

import {
  EMPTY_SIGN_UP_VALUES,
  buildRegisterPayload,
  validateEmailAddress,
  validateSignUpValues,
  type SignUpValues,
} from '@/features/auth/sign-up/schema'

function values(overrides: Partial<SignUpValues> = {}): SignUpValues {
  return {
    ...EMPTY_SIGN_UP_VALUES,
    confirmPassword: 'correct-horse',
    password: 'correct-horse',
    username: 'ada',
    ...overrides,
  }
}

const withVerification = { emailVerificationRequired: true }
const withoutVerification = { emailVerificationRequired: false }

describe('validateSignUpValues', () => {
  it('accepts an empty address and code while email verification is off', () => {
    expect(validateSignUpValues(values(), withoutVerification)).toEqual({})
  })

  it('requires the address and the code once email verification is on', () => {
    expect(validateSignUpValues(values(), withVerification)).toEqual({
      email: 'email-required',
      verificationCode: 'verification-code-required',
    })
  })

  it('ignores a malformed address entirely while verification is off', () => {
    // The server drops the field in that mode, so refusing to submit over it would block
    // a registration the backend would have accepted.
    expect(validateSignUpValues(values({ email: 'not-an-address' }), withoutVerification)).toEqual({})
  })

  it('rejects a malformed address once verification is on', () => {
    const errors = validateSignUpValues(
      values({ email: 'not-an-address', verificationCode: 'a1b2c3' }),
      withVerification,
    )
    expect(errors).toEqual({ email: 'email-invalid' })
  })

  it('rejects an address longer than the column allows', () => {
    const email = `${'a'.repeat(45)}@example.com`
    const errors = validateSignUpValues(
      values({ email, verificationCode: 'a1b2c3' }),
      withVerification,
    )
    expect(errors).toEqual({ email: 'email-too-long' })
  })

  it('rejects a code that is not exactly six characters', () => {
    const errors = validateSignUpValues(
      values({ email: 'ada@example.com', verificationCode: 'a1b2' }),
      withVerification,
    )
    expect(errors).toEqual({ verificationCode: 'verification-code-length' })
  })

  it('accepts a complete verified registration', () => {
    const errors = validateSignUpValues(
      values({ email: ' ada@example.com ', verificationCode: ' a1b2c3 ' }),
      withVerification,
    )
    expect(errors).toEqual({})
  })

  it('reports a mismatch on the confirmation field', () => {
    const errors = validateSignUpValues(
      values({ confirmPassword: 'something-else' }),
      withoutVerification,
    )
    expect(errors).toEqual({ confirmPassword: 'password-mismatch' })
  })

  it('mirrors the password bounds the server enforces', () => {
    expect(validateSignUpValues(
      values({ confirmPassword: 'short', password: 'short' }),
      withoutVerification,
    )).toEqual({ password: 'password-too-short' })

    const long = 'p'.repeat(21)
    expect(validateSignUpValues(
      values({ confirmPassword: long, password: long }),
      withoutVerification,
    )).toEqual({ password: 'password-too-long' })
  })

  it('mirrors the username bounds the server enforces', () => {
    expect(validateSignUpValues(values({ username: '  ' }), withoutVerification)).toEqual({
      username: 'username-required',
    })
    expect(validateSignUpValues(values({ username: 'a'.repeat(21) }), withoutVerification)).toEqual({
      username: 'username-too-long',
    })
  })

  it('reports every failing field at once', () => {
    const errors = validateSignUpValues(
      { confirmPassword: '', email: '', password: '', username: '', verificationCode: '' },
      withVerification,
    )
    expect(errors).toEqual({
      confirmPassword: 'confirm-password-required',
      email: 'email-required',
      password: 'password-required',
      username: 'username-required',
      verificationCode: 'verification-code-required',
    })
  })
})

describe('validateEmailAddress', () => {
  it('accepts a plausible address', () => {
    expect(validateEmailAddress(' ada@example.com ')).toBeUndefined()
  })

  it('reports the same codes the schema uses', () => {
    expect(validateEmailAddress('')).toBe('email-required')
    expect(validateEmailAddress('ada@example')).toBe('email-invalid')
  })
})

describe('buildRegisterPayload', () => {
  it('omits the email fields entirely while verification is off', () => {
    const payload = buildRegisterPayload(
      values({ email: 'ada@example.com', verificationCode: 'a1b2c3' }),
      { affiliateCode: '', emailVerificationRequired: false },
    )
    expect(payload).toEqual({
      aff_code: undefined,
      email: undefined,
      password: 'correct-horse',
      username: 'ada',
      verification_code: undefined,
    })
  })

  it('sends the trimmed address, code and referral while verification is on', () => {
    const payload = buildRegisterPayload(
      values({ email: ' ada@example.com ', username: ' ada ', verificationCode: ' a1b2c3 ' }),
      { affiliateCode: ' invite-42 ', emailVerificationRequired: true },
    )
    expect(payload).toEqual({
      aff_code: 'invite-42',
      email: 'ada@example.com',
      password: 'correct-horse',
      username: 'ada',
      verification_code: 'a1b2c3',
    })
  })
})
