import { queryOptions } from '@tanstack/react-query'

import { getJson, postJson } from '@/lib/api/client'

/**
 * First-run installation.
 *
 * Verified against the running backend (controller/setup.go):
 *
 *   GET /api/setup
 *     -> {"success":true,"data":{"status":true,"root_init":false,"database_type":""}}
 *     `status` is `constant.Setup`. When it is TRUE the handler returns early, so
 *     `root_init` and `database_type` are their zero values and mean nothing — only read
 *     them while `status` is false.
 *
 *   POST /api/setup
 *     body  {username, password, confirmPassword, SelfUseModeEnabled, DemoSiteEnabled}
 *     -> {"success":true,"message":"..."} with NO `data`
 *     Server-side rules, from `PostSetup`:
 *       - refuses outright once `constant.Setup` is true
 *       - when a root user already exists (`root_init`) the credential fields are ignored
 *         entirely and only the two mode flags are applied
 *       - otherwise: `len(username) > 12` bytes is rejected, `password != confirmPassword`
 *         is rejected, and `len(password) < 8` is rejected
 *     Note the exact JSON casing: the mode flags are PascalCase, `confirmPassword` is not.
 */

export type SetupUsageMode = 'external' | 'self' | 'demo'

export type SetupStatus = {
  status: boolean
  root_init: boolean
  database_type: string
}

export type SetupCredentials = {
  username: string
  password: string
  confirmPassword: string
}

export type SetupFormValues = SetupCredentials & {
  usageMode: SetupUsageMode
}

export type SetupPayload = {
  SelfUseModeEnabled: boolean
  DemoSiteEnabled: boolean
  username?: string
  password?: string
  confirmPassword?: string
}

/** `PostSetup` compares BYTE length, so a multi-byte username hits the cap sooner. */
export const MAX_USERNAME_BYTES = 12
export const MIN_PASSWORD_LENGTH = 8

export type SetupValidationIssue =
  | 'username-required'
  | 'username-too-long'
  | 'password-too-short'
  | 'password-mismatch'

export type SetupCredentialErrors = Partial<
  Record<'username' | 'password' | 'confirmPassword', SetupValidationIssue>
>

export function usernameByteLength(username: string): number {
  return new TextEncoder().encode(username).length
}

/**
 * Mirrors the checks in `PostSetup` so the wizard never sends a request the server will
 * refuse. Returns an empty object when the credentials are acceptable.
 */
export function validateSetupCredentials(values: SetupCredentials): SetupCredentialErrors {
  const errors: SetupCredentialErrors = {}
  const username = values.username.trim()

  if (username === '') errors.username = 'username-required'
  else if (usernameByteLength(username) > MAX_USERNAME_BYTES) errors.username = 'username-too-long'

  if (values.password.length < MIN_PASSWORD_LENGTH) errors.password = 'password-too-short'
  else if (values.password !== values.confirmPassword) errors.confirmPassword = 'password-mismatch'

  return errors
}

/**
 * `rootInitialized` drops the credential fields, matching the legacy wizard: the server
 * ignores them in that case, and not sending a password it will never read is strictly
 * better than sending one.
 */
export function buildSetupPayload(
  values: SetupFormValues,
  rootInitialized: boolean,
): SetupPayload {
  const modes: SetupPayload = {
    DemoSiteEnabled: values.usageMode === 'demo',
    SelfUseModeEnabled: values.usageMode === 'self',
  }

  if (rootInitialized) return modes

  return {
    ...modes,
    confirmPassword: values.confirmPassword,
    password: values.password,
    username: values.username.trim(),
  }
}

export function setupStatusQuery() {
  return queryOptions({
    queryKey: ['setup-status'],
    queryFn: () =>
      getJson<SetupStatus>('/api/setup', {
        // The wizard must never act on a cached answer: whether the instance is already
        // initialised decides whether this page may be shown at all.
        disableDuplicate: true,
        params: { t: Date.now() },
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    gcTime: 0,
    retry: false,
    staleTime: 0,
  })
}

export function submitSetup(payload: SetupPayload): Promise<null> {
  return postJson<null>('/api/setup', payload, { skipBusinessError: true })
}
