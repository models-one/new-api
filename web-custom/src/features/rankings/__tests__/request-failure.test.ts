import { AxiosError, type AxiosResponse } from 'axios'
import { describe, expect, it } from 'vitest'

import { rankingsFailureKind } from '@/features/rankings/request-failure'

function axiosError(status?: number): AxiosError {
  if (status === undefined) return new AxiosError('Network Error')
  const response = {
    config: { headers: {} },
    data: { success: false, message: 'nope' },
    headers: {},
    status,
    statusText: '',
  } as unknown as AxiosResponse
  return new AxiosError('nope', undefined, undefined, undefined, response)
}

describe('rankingsFailureKind', () => {
  it('reads the two refusals HeaderNavModuleAuth can produce', () => {
    // 403 comes from the module gate itself, before any auth runs.
    expect(rankingsFailureKind(axiosError(403))).toBe('disabled')
    // 401 comes from UserAuth(), which the gate delegates to when requireAuth is set.
    expect(rankingsFailureKind(axiosError(401))).toBe('sign-in-required')
  })

  it('does not dress a server or transport failure up as a permission problem', () => {
    expect(rankingsFailureKind(axiosError(500))).toBe('other')
    expect(rankingsFailureKind(axiosError(429))).toBe('other')
    // A request that never got a response has no status to read.
    expect(rankingsFailureKind(axiosError(undefined))).toBe('other')
  })

  it('treats anything that is not an axios rejection as an ordinary failure', () => {
    // `getJson` throws a plain ApiError for a 200 carrying `success: false`.
    expect(rankingsFailureKind(new Error('Request failed'))).toBe('other')
    expect(rankingsFailureKind('boom')).toBe('other')
    expect(rankingsFailureKind(undefined)).toBe('other')
    expect(rankingsFailureKind({ response: { status: 401 } })).toBe('other')
  })
})
