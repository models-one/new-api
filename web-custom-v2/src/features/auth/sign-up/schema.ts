import { z } from 'zod'

import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  VERIFICATION_CODE_LENGTH,
} from '@/features/auth/sign-up/api'

/**
 * The registration form's validation.
 *
 * The e-mail address and its code are required ONLY when `/api/status` reports
 * `email_verification`. The legacy schema could not express that — it validated the
 * unconditional fields and then patched the conditional half with two ad-hoc toasts fired
 * from the submit handler, which meant the address and the code never got an inline error
 * and never got a `aria-invalid` state. Here the flag is an input to the schema, so both
 * fields are validated the same way as every other one.
 */

export type SignUpField = 'username' | 'password' | 'confirmPassword' | 'email' | 'verificationCode'

/**
 * Stable codes rather than sentences: the message a user reads is produced by `t()` at
 * render time, so the schema stays free of display strings and of a `t` dependency.
 */
export type SignUpIssue =
  | 'username-required'
  | 'username-too-long'
  | 'password-required'
  | 'password-too-short'
  | 'password-too-long'
  | 'confirm-password-required'
  | 'password-mismatch'
  | 'email-required'
  | 'email-invalid'
  | 'email-too-long'
  | 'verification-code-required'
  | 'verification-code-length'

export type SignUpValues = {
  username: string
  password: string
  confirmPassword: string
  email: string
  verificationCode: string
}

export type SignUpErrors = Partial<Record<SignUpField, SignUpIssue>>

export const EMPTY_SIGN_UP_VALUES: SignUpValues = {
  confirmPassword: '',
  email: '',
  password: '',
  username: '',
  verificationCode: '',
}

/**
 * Deliberately permissive: `common.Validate` on the server is the authority on what an
 * address is. This only catches the obvious typo before a round trip.
 */
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Shared by the schema and by the "send code" button, which has to judge the address on
 * its own — it fires before the rest of the form is filled in.
 */
export function validateEmailAddress(value: string): SignUpIssue | undefined {
  const email = value.trim()
  if (email === '') return 'email-required'
  if (!emailPattern.test(email)) return 'email-invalid'
  if (email.length > EMAIL_MAX_LENGTH) return 'email-too-long'
  return undefined
}

export type SignUpSchemaOptions = {
  /** `/api/status.email_verification`. Drives whether the e-mail half is required. */
  emailVerificationRequired: boolean
}

export function createSignUpSchema(options: SignUpSchemaOptions) {
  return z
    .object({
      username: z.string(),
      password: z.string(),
      confirmPassword: z.string(),
      email: z.string(),
      verificationCode: z.string(),
    })
    .superRefine((values, ctx) => {
      const addIssue = (path: SignUpField, message: SignUpIssue) => {
        ctx.addIssue({ code: 'custom', message, path: [path] })
      }

      const username = values.username.trim()
      if (username === '') addIssue('username', 'username-required')
      else if (username.length > USERNAME_MAX_LENGTH) addIssue('username', 'username-too-long')

      if (values.password === '') addIssue('password', 'password-required')
      else if (values.password.length < PASSWORD_MIN_LENGTH) addIssue('password', 'password-too-short')
      else if (values.password.length > PASSWORD_MAX_LENGTH) addIssue('password', 'password-too-long')

      if (values.confirmPassword === '') addIssue('confirmPassword', 'confirm-password-required')
      else if (values.confirmPassword !== values.password) {
        addIssue('confirmPassword', 'password-mismatch')
      }

      if (!options.emailVerificationRequired) return

      const emailIssue = validateEmailAddress(values.email)
      if (emailIssue !== undefined) addIssue('email', emailIssue)

      const code = values.verificationCode.trim()
      if (code === '') addIssue('verificationCode', 'verification-code-required')
      else if (code.length !== VERIFICATION_CODE_LENGTH) {
        addIssue('verificationCode', 'verification-code-length')
      }
    })
}

const signUpFields: readonly SignUpField[] = [
  'username',
  'password',
  'confirmPassword',
  'email',
  'verificationCode',
]

function isSignUpField(value: PropertyKey): value is SignUpField {
  return signUpFields.some((field) => field === value)
}

/** Runs the schema and returns the FIRST issue per field, keyed by field. Empty when valid. */
export function validateSignUpValues(
  values: SignUpValues,
  options: SignUpSchemaOptions,
): SignUpErrors {
  const result = createSignUpSchema(options).safeParse(values)
  if (result.success) return {}

  const errors: SignUpErrors = {}
  for (const issue of result.error.issues) {
    const [field] = issue.path
    if (field === undefined || !isSignUpField(field)) continue
    if (errors[field] === undefined) errors[field] = issue.message as SignUpIssue
  }
  return errors
}

/**
 * The request body for `POST /api/user/register`.
 *
 * `email` and `verification_code` are omitted entirely when verification is off: the
 * server ignores both in that case (`controller/user.go` only copies the address into the
 * new row while `EmailVerificationEnabled`), and not sending an address the backend will
 * throw away is strictly better than sending one.
 */
export function buildRegisterPayload(
  values: SignUpValues,
  options: SignUpSchemaOptions & { affiliateCode: string },
): {
  username: string
  password: string
  email?: string
  verification_code?: string
  aff_code?: string
} {
  const affiliateCode = options.affiliateCode.trim()

  return {
    aff_code: affiliateCode === '' ? undefined : affiliateCode,
    email: options.emailVerificationRequired ? values.email.trim() : undefined,
    password: values.password,
    username: values.username.trim(),
    verification_code: options.emailVerificationRequired
      ? values.verificationCode.trim()
      : undefined,
  }
}
