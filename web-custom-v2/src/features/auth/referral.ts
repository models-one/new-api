/**
 * Referral ("affiliate") code capture.
 *
 * A referral link lands on any public page as `?aff=CODE`. The code has to
 * survive the walk to the sign-up form — and the round trip through an OAuth
 * provider — so it is persisted as soon as it is seen and read back when the
 * registration or OAuth-state call is made.
 */

export const REFERRAL_STORAGE_KEY = 'aff'

/** The query parameter a referral link carries. */
export const REFERRAL_QUERY_PARAM = 'aff'

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    // Storage access throws in private modes and when site data is blocked.
    return null
  }
}

export function readReferralCode(): string {
  try {
    return storage()?.getItem(REFERRAL_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveReferralCode(code: string): void {
  const value = code.trim()
  if (value === '') return
  try {
    storage()?.setItem(REFERRAL_STORAGE_KEY, value)
  } catch {
    // A referral code that cannot be stored is not worth failing a page render over.
  }
}

export function clearReferralCode(): void {
  try {
    storage()?.removeItem(REFERRAL_STORAGE_KEY)
  } catch {
    // Ignored for the same reason as saveReferralCode.
  }
}

/**
 * Reads `?aff=` from a query string, persists it when present, and returns the
 * code that is now stored. Call it as early as possible on any entry point a
 * referral link can hit; an absent parameter leaves an earlier code intact.
 *
 * @param search Query string to read. Defaults to the current location's.
 */
export function captureReferralCode(search?: string): string {
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search)
  const code = new URLSearchParams(query).get(REFERRAL_QUERY_PARAM)?.trim()
  if (code) saveReferralCode(code)
  return readReferralCode()
}
