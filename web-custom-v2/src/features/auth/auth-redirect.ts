/**
 * Open-redirect guard for post-authentication navigation.
 *
 * This is a security control, ported without loosening it: a permissive version
 * turns the sign-in page into a redirector for any site that can put a `redirect`
 * parameter in front of a user. Only same-origin http(s) targets survive, and the
 * return value is always a path — never an absolute URL.
 */

const allowedRedirectProtocols = new Set(['http:', 'https:'])

export function sanitizeAuthRedirect(value: unknown, origin: string): string | null {
  if (typeof value !== 'string') return null

  const target = value.trim()
  if (!target || target.includes('\\') || target.startsWith('//')) return null

  let trustedOrigin: URL
  try {
    trustedOrigin = new URL(origin)
  } catch {
    return null
  }
  if (!allowedRedirectProtocols.has(trustedOrigin.protocol)) return null

  let redirectURL: URL
  try {
    redirectURL = target.startsWith('/') ? new URL(target, trustedOrigin.origin) : new URL(target)
  } catch {
    return null
  }

  if (
    !allowedRedirectProtocols.has(redirectURL.protocol)
    || redirectURL.origin !== trustedOrigin.origin
  ) {
    return null
  }

  return `${redirectURL.pathname}${redirectURL.search}${redirectURL.hash}`
}

/**
 * Resolves where to send a user after signing in: the sanitized `redirect`
 * parameter when it is safe, otherwise the fallback.
 */
export function resolveAuthRedirect(
  requested: unknown,
  origin: string,
  fallback = '/dashboard',
): string {
  return sanitizeAuthRedirect(requested, origin) ?? fallback
}

/** Anything that may carry a saved interface language. `AuthUser` satisfies this. */
type LanguageCarrier = {
  language?: unknown
  setting?: unknown
}

/**
 * The interface language stored on the signed-in user. `setting` arrives either
 * as an object or as a JSON string depending on how the account was written.
 */
export function getSavedLanguage(user: LanguageCarrier): string | undefined {
  if (typeof user.language === 'string') return user.language

  if (user.setting && typeof user.setting === 'object') {
    const setting = user.setting as { language?: unknown }
    return typeof setting.language === 'string' ? setting.language : undefined
  }

  if (typeof user.setting !== 'string') return undefined

  try {
    const setting = JSON.parse(user.setting) as { language?: unknown }
    return typeof setting.language === 'string' ? setting.language : undefined
  } catch {
    return undefined
  }
}
