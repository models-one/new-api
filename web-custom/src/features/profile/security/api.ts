import { queryOptions } from '@tanstack/react-query'
import axios from 'axios'

import type { LoginSession } from '@/features/auth/types'
import { deleteJson, getJson, postJson } from '@/lib/api/client'
import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * The security half of the account centre.
 *
 * Every shape below was read off the live dev server or off the controller that
 * produces it (`controller/twofa.go`, `controller/passkey.go`,
 * `controller/auth_session.go`, `controller/secure_verification.go`).
 *
 * Two cross-cutting behaviours the callers depend on:
 *
 * 1. ROTATION. Enabling or disabling 2FA, regenerating backup codes, and
 *    registering or removing a passkey all bump the user's auth version. The
 *    server answers with a fresh access token for THIS session and — inside
 *    `service.advanceCurrentSessionToVersion` — revokes every OTHER session. The
 *    requests therefore set `acceptAuthRotation`, which makes the shared response
 *    interceptor swap the token in the auth store; without it the very next
 *    request would 401. The other-sessions side effect is surfaced in the UI.
 *
 * 2. SECURITY PROOF. `middleware.RequireSecurityProof` answers HTTP 403 with a
 *    `code` when a step-up is needed. `securityProofFailure` below turns that
 *    into a typed value so the caller can start the right verification flow
 *    rather than showing a generic failure.
 */

/** Do not let the shared interceptor toast; these surfaces render errors inline. */
const inlineErrors: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

const rotating: ApiRequestConfig = { ...inlineErrors, acceptAuthRotation: true }

// ---------------------------------------------------------------------------
// Two-factor authentication
// ---------------------------------------------------------------------------

/**
 * `GET /api/user/2fa/status`.
 *
 * `backup_codes_remaining` is only present while 2FA is enabled — the controller
 * adds the key inside `if twoFA.IsEnabled`, so it is genuinely optional.
 */
export type TwoFactorStatus = {
  enabled: boolean
  locked: boolean
  backup_codes_remaining?: number
}

/** `POST /api/user/2fa/setup` (`controller.Setup2FAResponse`). */
export type TwoFactorSetup = {
  secret: string
  /** The `otpauth://totp/...` URI, ready to be turned into a QR code. */
  qr_code_data: string
  backup_codes: string[]
}

export function twoFactorStatusQuery() {
  return queryOptions({
    queryKey: ['profile', 'security', '2fa'],
    queryFn: () => getJson<TwoFactorStatus>('/api/user/2fa/status'),
  })
}

/**
 * Starts a setup. Destructive on the server: an existing DISABLED record and its
 * pending backup codes are deleted and replaced, so only call it when the user
 * has actually asked to enable 2FA.
 */
export function startTwoFactorSetup() {
  return postJson<TwoFactorSetup>('/api/user/2fa/setup', undefined, inlineErrors)
}

export function enableTwoFactor(code: string) {
  return postJson<unknown>('/api/user/2fa/enable', { code }, rotating)
}

/** The server accepts either a TOTP code or an unused backup code here. */
export function disableTwoFactor(code: string) {
  return postJson<unknown>('/api/user/2fa/disable', { code }, rotating)
}

/** Unlike disable, this one accepts a TOTP code only — never a backup code. */
export function regenerateBackupCodes(code: string) {
  return postJson<{ backup_codes: string[] }>('/api/user/2fa/backup_codes', { code }, rotating)
}

// ---------------------------------------------------------------------------
// Passkey
// ---------------------------------------------------------------------------

/**
 * `GET /api/user/passkey`. `last_used_at` appears only when a credential exists;
 * it is an RFC 3339 string from the Go model, not a unix timestamp.
 */
export type PasskeyStatus = {
  enabled: boolean
  last_used_at?: string | null
}

/** `{ options, flow_token, expires_at }`; `options` is Go's `protocol.CredentialCreation`. */
export type PasskeyChallenge = {
  options?: unknown
  flow_token?: string
  expires_at?: number
}

export function passkeyStatusQuery() {
  return queryOptions({
    queryKey: ['profile', 'security', 'passkey'],
    queryFn: () => getJson<PasskeyStatus>('/api/user/passkey'),
  })
}

function proofHeader(proofToken?: string) {
  return proofToken ? { headers: { 'X-Security-Proof': proofToken } } : {}
}

export function beginPasskeyRegistration(proofToken?: string) {
  return postJson<PasskeyChallenge>('/api/user/passkey/register/begin', undefined, {
    ...inlineErrors,
    ...proofHeader(proofToken),
  })
}

export function finishPasskeyRegistration(
  flowToken: string,
  credential: Record<string, unknown>,
  proofToken?: string,
) {
  return postJson<unknown>(
    '/api/user/passkey/register/finish',
    { flow_token: flowToken, credential },
    { ...rotating, ...proofHeader(proofToken) },
  )
}

export function removePasskey(proofToken?: string) {
  return deleteJson<unknown>('/api/user/passkey', { ...rotating, ...proofHeader(proofToken) })
}

// ---------------------------------------------------------------------------
// Step-up verification (`X-Security-Proof`)
// ---------------------------------------------------------------------------

/** The only scopes `controller.isAllowedSecurityProofScope` accepts for this surface. */
export type SecurityProofScope = 'passkey.register' | 'passkey.delete'

export type VerificationMethod = '2fa' | 'passkey'

export type SecurityProof = {
  proof_token: string
  expires_at: number
  method: VerificationMethod
  scope: string
}

/** `POST /api/verify` — the 2FA half of the step-up. Passkey has its own pair. */
export function verifyWithTotp(scope: SecurityProofScope, code: string) {
  return postJson<SecurityProof>('/api/verify', { method: '2fa', code, scope }, inlineErrors)
}

export function beginPasskeyVerification(scope: SecurityProofScope) {
  return postJson<PasskeyChallenge>('/api/user/passkey/verify/begin', { scope }, inlineErrors)
}

export function finishPasskeyVerification(flowToken: string, credential: Record<string, unknown>) {
  return postJson<SecurityProof>(
    '/api/user/passkey/verify/finish',
    { flow_token: flowToken, credential },
    inlineErrors,
  )
}

/** The five `code` values `middleware.securityProofError` can emit. */
const SECURITY_PROOF_CODES = new Set([
  'SECURITY_PROOF_REQUIRED',
  'SECURITY_PROOF_INVALID',
  'SECURITY_PROOF_EXPIRED',
  'SECURITY_PROOF_SCOPE_MISMATCH',
  'SECURITY_PROOF_METHOD_MISMATCH',
])

/**
 * Recognises the 403 the proof middleware writes, so a caller can escalate to a
 * verification dialog instead of reporting a dead end. Returns the server's
 * `code`, or null when the failure is something else entirely.
 */
export function securityProofFailure(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null
  if (error.response?.status !== 403) return null
  const body = error.response.data as { code?: unknown } | undefined
  const code = typeof body?.code === 'string' ? body.code : null
  return code !== null && SECURITY_PROOF_CODES.has(code) ? code : null
}

// ---------------------------------------------------------------------------
// Login sessions
// ---------------------------------------------------------------------------

export type { LoginSession }

export function loginSessionsQuery() {
  return queryOptions({
    queryKey: ['profile', 'security', 'sessions'],
    queryFn: () => getJson<LoginSession[]>('/api/user/sessions'),
  })
}

/** Answers `{ revoked_sid, current }`; `current` true means we just signed ourselves out. */
export function revokeLoginSession(sid: string) {
  return deleteJson<{ revoked_sid: string; current: boolean }>(
    `/api/user/sessions/${encodeURIComponent(sid)}`,
    inlineErrors,
  )
}

export function revokeOtherLoginSessions() {
  return postJson<{ revoked_count: number }>(
    '/api/user/sessions/revoke-others',
    undefined,
    inlineErrors,
  )
}
