import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'

import { shouldRetryRequest } from '@/lib/query-client'

function axiosError(status: number): AxiosError {
  return new AxiosError('request failed', undefined, undefined, undefined, {
    status,
    statusText: String(status),
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  })
}

describe('query retry policy', () => {
  it('does not retry authorization or validation failures', () => {
    expect(shouldRetryRequest(0, axiosError(401))).toBe(false)
    expect(shouldRetryRequest(0, axiosError(403))).toBe(false)
    expect(shouldRetryRequest(0, axiosError(422))).toBe(false)
  })

  it('retries transient failures at most twice', () => {
    expect(shouldRetryRequest(0, axiosError(503))).toBe(true)
    expect(shouldRetryRequest(1, axiosError(429))).toBe(true)
    expect(shouldRetryRequest(2, axiosError(503))).toBe(false)
  })
})
