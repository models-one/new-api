export { SignUpPage } from '@/features/auth/sign-up/SignUpPage'
export { SignUpForm } from '@/features/auth/sign-up/components/SignUpForm'

export {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESEND_COUNTDOWN_SECONDS,
  USERNAME_MAX_LENGTH,
  VERIFICATION_CODE_LENGTH,
  registerAccount,
  sendEmailVerificationCode,
  type RegisterPayload,
} from '@/features/auth/sign-up/api'

export {
  EMPTY_SIGN_UP_VALUES,
  buildRegisterPayload,
  createSignUpSchema,
  validateEmailAddress,
  validateSignUpValues,
  type SignUpErrors,
  type SignUpField,
  type SignUpIssue,
  type SignUpSchemaOptions,
  type SignUpValues,
} from '@/features/auth/sign-up/schema'

export { useResendCountdown, type ResendCountdown } from '@/features/auth/sign-up/use-resend-countdown'

export {
  passThroughSearch,
  skipSignUpWhenAuthenticated,
} from '@/features/auth/sign-up/route-guard'
