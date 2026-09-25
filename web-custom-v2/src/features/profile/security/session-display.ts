import type { TFunction } from 'i18next'

/**
 * Turning a raw session row into something a person can recognise.
 *
 * `GET /api/user/sessions` returns only `login_method`, `ip` and `user_agent`;
 * the server does no device detection at all. Everything below is therefore
 * DERIVED IN THE BROWSER from the user-agent string, and the panel says so.
 */

/** The four families a user-agent can be attributed to, in match order. */
const BROWSER_MARKERS: readonly (readonly [string, string])[] = [
  // Edge must be tested before Chrome, and Chrome before Safari: Edge's UA
  // contains "Chrome/", and Chrome's contains "Safari/".
  ['Edg/', 'Edge'],
  ['Chrome/', 'Chrome'],
  ['Firefox/', 'Firefox'],
  ['Safari/', 'Safari'],
]

const PLATFORM_MARKERS: readonly (readonly [string, string])[] = [
  ['iPhone', 'iOS'],
  ['iPad', 'iOS'],
  ['Android', 'Android'],
  ['Windows', 'Windows'],
  ['Mac OS', 'macOS'],
  ['Linux', 'Linux'],
]

/**
 * A short "Chrome · macOS" style label.
 *
 * @param unknownLabel - Shown when the user-agent is empty (a token-authenticated
 *   session, or one created before the column existed).
 * @param genericBrowserLabel - Shown when no marker matches, e.g. a CLI's UA.
 */
export function describeDevice(
  userAgent: string,
  unknownLabel: string,
  genericBrowserLabel: string,
): string {
  const agent = userAgent.trim()
  if (agent === '') return unknownLabel

  const browser = BROWSER_MARKERS.find(([marker]) => agent.includes(marker))?.[1]
    ?? genericBrowserLabel
  const platform = PLATFORM_MARKERS.find(([marker]) => agent.includes(marker))?.[1]

  return platform ? `${browser} · ${platform}` : browser
}

const OAUTH_PROVIDER_NAMES: Record<string, string> = {
  discord: 'Discord',
  github: 'GitHub',
  linuxdo: 'LinuxDO',
  oidc: 'OIDC',
}

/**
 * Names the credential the session was opened with.
 *
 * `login_method` is written by `setupLogin`; the known values are `password`,
 * `2fa`, `passkey`, `wechat`, `telegram`, and `oauth:<provider>`. An unknown
 * value is returned verbatim rather than mislabelled.
 */
export function describeLoginMethod(method: string, t: TFunction): string {
  const normalized = method.trim().toLowerCase()

  switch (normalized) {
    case '':
    case 'unknown': return t('Unknown')
    case 'password': return t('Password')
    case '2fa': return t('Two-factor authentication')
    case 'passkey': return t('Passkey')
    case 'wechat': return t('WeChat')
    case 'telegram': return t('Telegram')
    case 'oauth': return t('OAuth')
    default: break
  }

  if (!normalized.startsWith('oauth:')) return method
  const provider = normalized.slice('oauth:'.length)
  return `${t('OAuth')} · ${OAUTH_PROVIDER_NAMES[provider] ?? provider}`
}

/**
 * Sorts the current session first, then the rest by most recently active.
 *
 * The server returns them newest-created first, which buries the session the
 * user is reading the page in.
 */
export function orderSessions<T extends { current: boolean; last_active_at: number }>(
  sessions: readonly T[],
): T[] {
  return [...sessions].sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1
    return right.last_active_at - left.last_active_at
  })
}
