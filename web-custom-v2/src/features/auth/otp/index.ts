/**
 * The second-factor challenge at `/otp`.
 *
 * The sign-in page owns the hand-off: after `POST /api/user/login` answers
 * `require_2fa`, call `setPending2FAChallenge` with `data.flow_token`,
 * `data.expires_at` and the redirect the user was heading for, then navigate to
 * `/otp`. The route guard in `src/routes.tsx` sends anyone without a live
 * challenge back to sign-in.
 */

export { OtpPage } from '@/features/auth/otp/OtpPage'
export { OtpCodeInput } from '@/features/auth/otp/OtpCodeInput'
export { verifyTwoFactorLogin, type TwoFactorLoginPayload } from '@/features/auth/otp/api'
export {
  PENDING_2FA_STORAGE_KEY,
  clearPending2FAChallenge,
  readPending2FAChallenge,
  setPending2FAChallenge,
  usePending2FAStore,
  type Pending2FAChallenge,
  type Pending2FAInput,
} from '@/features/auth/otp/pending-2fa'
export {
  BACKUP_CODE_LENGTH,
  FORMATTED_BACKUP_CODE_LENGTH,
  TOTP_CODE_LENGTH,
  cleanBackupCode,
  formatBackupCode,
  isValidBackupCode,
  isValidTotpCode,
  sanitizeTotpCode,
} from '@/features/auth/otp/validation'
