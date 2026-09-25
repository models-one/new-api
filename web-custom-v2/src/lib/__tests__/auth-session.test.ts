import { afterEach, describe, expect, it } from 'vitest'

import type { AuthBundle } from '@/features/auth/types'
import {
  bootstrapAuthentication,
  createRefreshRunner,
  isAuthBundle,
  type AuthRefreshRuntime,
} from '@/lib/auth-session'
import { useAuthStore } from '@/stores/auth-store'

const bundle: AuthBundle = {
  access_token: 'access-token',
  token_type: 'Bearer',
  access_expires_at: Math.floor(Date.now() / 1000) + 600,
  user: { id: 42, username: 'test-user', role: 1 },
  session: {
    sid: 'session-a',
    current: true,
    login_method: 'password',
    ip: '127.0.0.1',
    user_agent: 'test',
    created_at: 100,
    last_active_at: 100,
    expires_at: 1_900_000_000,
  },
}

afterEach(() => useAuthStore.getState().auth.reset('idle'))

describe('authentication session coordination', () => {
  it('reuses a valid in-memory bundle without another refresh request', async () => {
    useAuthStore.getState().auth.setBundle(bundle)

    await expect(bootstrapAuthentication()).resolves.toEqual({ kind: 'authenticated', bundle })
  })

  it('retries a session mismatch without the stale session id', async () => {
    let expectedSid: string | undefined = bundle.session.sid
    const requestedSids: Array<string | undefined> = []
    const accepted: AuthBundle[] = []
    const runtime: AuthRefreshRuntime = {
      request: async (sid) => {
        requestedSids.push(sid)
        if (requestedSids.length === 1) {
          return { status: 409, data: { code: 'AUTH_SESSION_MISMATCH' } }
        }
        return { status: 200, data: { success: true, data: bundle } }
      },
      getExpectedSid: () => expectedSid,
      acceptBundle: (nextBundle) => accepted.push(nextBundle),
      clear: (_synchronizeTabs, state) => {
        if (state === 'idle') expectedSid = undefined
      },
      markTransient: () => undefined,
      wait: async () => undefined,
    }

    await expect(createRefreshRunner(runtime)()).resolves.toEqual({ kind: 'authenticated', bundle })
    expect(requestedSids).toEqual([bundle.session.sid, undefined])
    expect(accepted).toEqual([bundle])
  })

  it('keeps temporary refresh failures retryable without clearing the session', async () => {
    let clearCount = 0
    let transientCount = 0
    const runtime: AuthRefreshRuntime = {
      request: async () => ({ status: 503, error: new Error('unavailable') }),
      getExpectedSid: () => bundle.session.sid,
      acceptBundle: () => undefined,
      clear: () => { clearCount += 1 },
      markTransient: () => { transientCount += 1 },
      wait: async () => undefined,
    }

    const outcome = await createRefreshRunner(runtime)()

    expect(outcome.kind).toBe('transient_error')
    expect(clearCount).toBe(0)
    expect(transientCount).toBe(1)
  })

  it('rejects malformed authentication bundles', () => {
    expect(isAuthBundle(bundle)).toBe(true)
    expect(isAuthBundle({ ...bundle, session: { sid: '' } })).toBe(false)
  })
})
