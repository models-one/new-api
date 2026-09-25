export { ForgotPasswordPage } from '@/features/auth/password-reset/ForgotPasswordPage'
export {
  ResetPasswordPage,
  type ResetPasswordSearch,
} from '@/features/auth/password-reset/ResetPasswordPage'
export {
  ResetPasswordRoute,
  readResetPasswordSearch,
} from '@/features/auth/password-reset/ResetPasswordRoute'

export { validateResetSearch } from '@/features/auth/password-reset/route-guard'

export {
  RESET_COUNTDOWN_SECONDS,
  confirmPasswordReset,
  requestPasswordResetEmail,
} from '@/features/auth/password-reset/api'
