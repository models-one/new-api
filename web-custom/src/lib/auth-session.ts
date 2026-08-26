import type { QueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { authBundleSchema, authRotationSchema, type AuthBundle } from '@/features/auth/types'
import { publishAuthSessionEvent } from '@/lib/auth-session-sync'
import { useAuthStore, type AuthBootstrapState } from '@/stores/auth-store'

export type RefreshOutcome =
  | { kind: 'authenticated'; bundle: AuthBundle }
  | { kind: 'anonymous' }
  | { kind: 'transient_error'; error: unknown }
  | { kind: 'out_of_sync'; code?: string }

export type AuthRefreshHTTPResponse = {
  status: number
  data?: unknown
  error?: unknown
}

export type AuthRefreshRuntime = {
  request: (expectedSid?: string) => Promise<AuthRefreshHTTPResponse>
  getExpectedSid: () => string | undefined
  acceptBundle: (bundle: AuthBundle) => void
  clear: (synchronizeTabs: boolean, bootstrapState?: AuthBootstrapState) => void
  markTransient: () => void
  wait: (delay: number) => Promise<void>
  isCurrent?: () => boolean
}

const authClient = axios.create({
  baseURL: import.meta.env.PUBLIC_API_BASE_URL ?? '',
  withCredentials: true,
  headers: { 'Cache-Control': 'no-store' },
})

const refreshRaceDelays = [80, 200, 500] as const
let refreshPromise: Promise<RefreshOutcome> | null = null
let authEpoch = 0

export class AuthenticationUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Authentication service is temporarily unavailable.', { cause })
    this.name = 'AuthenticationUnavailableError'
  }
}

export function isAuthBundle(value: unknown): value is AuthBundle {
  return authBundleSchema.safeParse(value).success
}

export function applyAuthBundle(bundle: AuthBundle, synchronizeTabs = true): void {
  const previousSid = useAuthStore.getState().auth.session?.sid
  authEpoch += 1
  useAuthStore.getState().auth.setBundle(bundle)
  if (synchronizeTabs && previousSid !== bundle.session.sid) {
    publishAuthSessionEvent('authenticated', bundle.session.sid)
  }
}

export function applyAuthRotation(value: unknown): void {
  const parsed = authRotationSchema.safeParse(value)
  if (!parsed.success) throw new Error('Invalid authentication rotation response')

  const auth = useAuthStore.getState().auth
  if (!auth.user || !auth.session) throw new Error('Authentication rotation has no active session')
  if (parsed.data.session.sid !== auth.session.sid) throw new Error('Authentication rotation session mismatch')

  applyAuthBundle({ ...parsed.data, user: auth.user }, false)
}

export function clearAuthentication(
  synchronizeTabs = true,
  bootstrapState: AuthBootstrapState = 'complete',
): void {
  const sid = useAuthStore.getState().auth.session?.sid
  authEpoch += 1
  useAuthStore.getState().auth.reset(bootstrapState)
  if (synchronizeTabs && sid) publishAuthSessionEvent('signed_out', sid)
}

export function clearAuthenticatedClientState(queryClient: QueryClient, synchronizeTabs = true): void {
  queryClient.clear()
  clearAuthentication(synchronizeTabs)
}

export function createRefreshRunner(runtime: AuthRefreshRuntime): () => Promise<RefreshOutcome> {
  const superseded = (): RefreshOutcome => ({
    kind: 'transient_error',
    error: new Error('Authentication refresh was superseded'),
  })

  const run = async (raceAttempt: number, allowMismatchRetry: boolean): Promise<RefreshOutcome> => {
    if (runtime.isCurrent && !runtime.isCurrent()) return superseded()

    const response = await runtime.request(runtime.getExpectedSid())
    if (runtime.isCurrent && !runtime.isCurrent()) return superseded()

    const responseData = response.data && typeof response.data === 'object'
      ? response.data as Record<string, unknown>
      : undefined
    const code = typeof responseData?.code === 'string' ? responseData.code : undefined
    const parsedBundle = authBundleSchema.safeParse(responseData?.data)
    if (responseData?.success === true && parsedBundle.success) {
      runtime.acceptBundle(parsedBundle.data)
      return { kind: 'authenticated', bundle: parsedBundle.data }
    }

    if (response.status === 409 && code === 'AUTH_REFRESH_RACE') {
      const delay = refreshRaceDelays[raceAttempt]
      if (delay !== undefined) {
        await runtime.wait(delay)
        return run(raceAttempt + 1, allowMismatchRetry)
      }
      runtime.clear(false)
      return { kind: 'out_of_sync', code }
    }

    if (response.status === 409 && code === 'AUTH_SESSION_MISMATCH') {
      if (allowMismatchRetry) {
        runtime.clear(false, 'idle')
        return run(0, false)
      }
      runtime.clear(false)
      return { kind: 'out_of_sync', code }
    }

    if (response.status === 401) {
      runtime.clear(true)
      return { kind: 'anonymous' }
    }

    if (!response.status || response.status >= 500 || response.status === 429) {
      runtime.markTransient()
      return { kind: 'transient_error', error: response.error ?? response.data }
    }

    runtime.clear(false)
    return { kind: 'out_of_sync', code: code ?? 'AUTH_INVALID_REFRESH_RESPONSE' }
  }

  return () => run(0, true)
}

async function requestRefresh(expectedSid?: string): Promise<AuthRefreshHTTPResponse> {
  try {
    const response = await authClient.post('/api/user/auth/refresh', undefined, {
      headers: expectedSid ? { 'X-Auth-Session': expectedSid } : undefined,
    })
    return { status: response.status, data: response.data }
  } catch (error: unknown) {
    if (!axios.isAxiosError(error)) return { status: 0, error }
    return {
      status: error.response?.status ?? 0,
      data: error.response?.data,
      error,
    }
  }
}

function runRefresh(refreshEpoch: number): Promise<RefreshOutcome> {
  return createRefreshRunner({
    request: requestRefresh,
    getExpectedSid: () => useAuthStore.getState().auth.session?.sid,
    acceptBundle: (bundle) => applyAuthBundle(bundle, false),
    clear: (synchronizeTabs, bootstrapState) => {
      if (!synchronizeTabs && bootstrapState === 'idle') {
        useAuthStore.getState().auth.reset('idle')
        return
      }
      clearAuthentication(synchronizeTabs, bootstrapState)
    },
    markTransient: () => useAuthStore.getState().auth.setBootstrapState('idle'),
    wait: (delay) => new Promise((resolve) => globalThis.setTimeout(resolve, delay)),
    isCurrent: () => authEpoch === refreshEpoch,
  })()
}

async function performRefreshWithBrowserLock(refreshEpoch: number): Promise<RefreshOutcome> {
  try {
    if (typeof navigator === 'undefined' || !navigator.locks) return runRefresh(refreshEpoch)
    return navigator.locks.request(
      'new-api:web-custom-auth-refresh',
      { mode: 'exclusive' },
      () => runRefresh(refreshEpoch),
    )
  } catch (error: unknown) {
    useAuthStore.getState().auth.setBootstrapState('idle')
    return { kind: 'transient_error', error }
  }
}

export function refreshAuthentication(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    const refreshEpoch = authEpoch
    refreshPromise = performRefreshWithBrowserLock(refreshEpoch).finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function bootstrapAuthentication(): Promise<RefreshOutcome> {
  const auth = useAuthStore.getState().auth
  if (
    auth.user
    && auth.accessToken
    && auth.accessExpiresAt
    && auth.session
    && auth.accessExpiresAt > Math.floor(Date.now() / 1000)
  ) {
    auth.setBootstrapState('complete')
    return {
      kind: 'authenticated',
      bundle: {
        access_token: auth.accessToken,
        token_type: 'Bearer',
        access_expires_at: auth.accessExpiresAt,
        user: auth.user,
        session: auth.session,
      },
    }
  }

  const hasStaleSession = Boolean(auth.user && auth.session)
  if (auth.bootstrapState === 'complete' && !hasStaleSession) return { kind: 'anonymous' }

  auth.setBootstrapState('checking')
  return refreshAuthentication()
}
