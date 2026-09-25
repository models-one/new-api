import { create } from 'zustand'

/**
 * The hand-off between the password form and `/otp`.
 *
 * `POST /api/user/login` answers `{ require_2fa: true, flow_token, expires_at }`
 * instead of an auth bundle when the account has 2FA on, and that flow token is
 * the only thing `POST /api/user/login/2fa` accepts.
 *
 * It is mirrored into `sessionStorage` so a reload of `/otp` — or reaching it as
 * a fresh document load — does not throw away a challenge the server would still
 * honour. `sessionStorage` is per tab and dies with it, and the copy is dropped
 * the moment the server's own TTL passes, so the token never outlives the
 * sign-in attempt that earned it.
 *
 * PUBLIC CONTRACT — the sign-in page calls `setPending2FAChallenge` with the
 * payload of that response and navigates to `/otp`. `/otp` and the sign-in
 * completion hook clear it. Nothing else writes it.
 */

export const PENDING_2FA_STORAGE_KEY = 'pending-2fa'

export type Pending2FAChallenge = {
  /** `data.flow_token` from the login response. */
  flowToken: string
  /** `data.expires_at`, unix SECONDS. Null when the server omitted it. */
  expiresAt: number | null
  /**
   * Where to land once the second factor clears. The raw, untrusted value —
   * every reader puts it through `sanitizeAuthRedirect` first.
   */
  redirectTo: string | null
}

export type Pending2FAInput = {
  flowToken: string
  expiresAt?: number | null
  redirectTo?: string | null
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function isLive(challenge: Pending2FAChallenge, now: number): boolean {
  return challenge.expiresAt === null || challenge.expiresAt > now
}

/** `sessionStorage` throws outright in some privacy modes, so every touch is guarded. */
function storage(): Storage | null {
  try {
    return typeof globalThis.sessionStorage === 'undefined' ? null : globalThis.sessionStorage
  } catch {
    return null
  }
}

function normalize(value: Pending2FAInput): Pending2FAChallenge | null {
  const flowToken = value.flowToken.trim()
  if (flowToken === '') return null

  return {
    flowToken,
    expiresAt:
      typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)
        ? value.expiresAt
        : null,
    redirectTo:
      typeof value.redirectTo === 'string' && value.redirectTo !== '' ? value.redirectTo : null,
  }
}

function readStoredChallenge(): Pending2FAChallenge | null {
  const store = storage()
  if (store === null) return null

  try {
    const raw = store.getItem(PENDING_2FA_STORAGE_KEY)
    if (raw === null) return null

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const record = parsed as Record<string, unknown>
    if (typeof record.flowToken !== 'string') return null

    const challenge = normalize({
      flowToken: record.flowToken,
      expiresAt: typeof record.expiresAt === 'number' ? record.expiresAt : null,
      redirectTo: typeof record.redirectTo === 'string' ? record.redirectTo : null,
    })
    if (challenge === null || !isLive(challenge, nowInSeconds())) return null
    return challenge
  } catch {
    return null
  }
}

function writeStoredChallenge(challenge: Pending2FAChallenge | null): void {
  const store = storage()
  if (store === null) return

  try {
    if (challenge === null) {
      store.removeItem(PENDING_2FA_STORAGE_KEY)
      return
    }
    store.setItem(PENDING_2FA_STORAGE_KEY, JSON.stringify(challenge))
  } catch {
    // A full or blocked store is not a reason to fail the sign-in: the in-memory
    // copy still carries the challenge for as long as this document lives.
  }
}

type Pending2FAState = {
  challenge: Pending2FAChallenge | null
  setChallenge: (challenge: Pending2FAChallenge | null) => void
}

/**
 * Hydrated at module load rather than on first render, so a page that reads the
 * challenge during its first paint sees the stored one instead of briefly
 * deciding there is no challenge at all.
 */
export const usePending2FAStore = create<Pending2FAState>()((set) => ({
  challenge: readStoredChallenge(),
  setChallenge: (challenge) => set({ challenge }),
}))

/** Stashes the challenge from a login that answered `require_2fa`. */
export function setPending2FAChallenge(input: Pending2FAInput): void {
  const challenge = normalize(input)
  writeStoredChallenge(challenge)
  usePending2FAStore.getState().setChallenge(challenge)
}

/**
 * The live challenge, or null when there is none left to use.
 *
 * An expired token is treated as absent and dropped on read, so the route guard
 * and the form always agree instead of the form posting a token the server is
 * guaranteed to reject.
 */
export function readPending2FAChallenge(now = nowInSeconds()): Pending2FAChallenge | null {
  const challenge = usePending2FAStore.getState().challenge
  if (challenge === null) return null

  if (!isLive(challenge, now)) {
    clearPending2FAChallenge()
    return null
  }
  return challenge
}

export function clearPending2FAChallenge(): void {
  writeStoredChallenge(null)
  usePending2FAStore.getState().setChallenge(null)
}
