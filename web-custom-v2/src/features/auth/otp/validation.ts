/**
 * Second-factor input rules, mirrored from the backend so a code the server can
 * only reject never leaves the browser.
 *
 * `common/totp.go` is the authority: a TOTP is six digits (`ValidateNumericCode`),
 * a backup code is eight characters from `A-Z0-9` printed as `XXXX-XXXX`
 * (`generateRandomBackupCode`), and the server normalizes separators and case
 * itself (`ValidateBackupCode`).
 */

export const TOTP_CODE_LENGTH = 6
/** Characters in a backup code, hyphen excluded. `common.BackupCodeLength`. */
export const BACKUP_CODE_LENGTH = 8
/** Characters once the printed hyphen is included: `XXXX-XXXX`. */
export const FORMATTED_BACKUP_CODE_LENGTH = 9

const TOTP_PATTERN = /^\d{6}$/
const BACKUP_CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/

/** Keeps digits only and never grows past the field, so a paste cannot overflow it. */
export function sanitizeTotpCode(value: string, length = TOTP_CODE_LENGTH): string {
  return value.replace(/\D/g, '').slice(0, length)
}

export function isValidTotpCode(value: string): boolean {
  return TOTP_PATTERN.test(value)
}

/**
 * Reshapes anything the user types or pastes into `XXXX-XXXX`.
 *
 * Separators and lowercase are dropped rather than rejected: a backup code is
 * usually pasted out of a password manager, where it may carry its own spacing.
 */
export function formatBackupCode(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, BACKUP_CODE_LENGTH)
  if (cleaned.length <= 4) return cleaned
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`
}

/** The wire form. The server normalizes too, but sending the printed hyphen is noise. */
export function cleanBackupCode(value: string): string {
  return value.replace(/-/g, '')
}

export function isValidBackupCode(value: string): boolean {
  return BACKUP_CODE_PATTERN.test(value.toUpperCase())
}
