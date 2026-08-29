type Translate = (key: string) => string

/**
 * Turns a rejected sign-in into copy the user can act on.
 *
 * The auth-session endpoints answer with a machine code and leave `message` as the bare
 * HTTP status text — a session-limit refusal arrives as the single word "Conflict", which
 * tells nobody what to do. Codes come from `service/auth_session.go#authSessionErrorCode`.
 * Anything uncoded keeps the server's own message, which for a bad password is already
 * the right thing to show.
 */
export function rejectionMessage(code: string, message: string, t: Translate): string {
  switch (code) {
    case 'AUTH_SESSION_LIMIT':
      return t('You are signed in on too many devices. Sign out somewhere else, then try again.')
    case 'AUTH_SESSION_ISSUANCE_LIMIT':
      return t('Too many sign-in attempts. Please wait a moment before trying again.')
    case 'AUTH_SESSION_REVOKED':
      return t('This session was signed out. Please sign in again.')
    case 'AUTH_INTERNAL_ERROR':
      return t('The sign-in service had a problem. Please try again.')
    default:
      return message === '' ? t('Sign-in failed. Please try again.') : message
  }
}
