import { queryOptions } from '@tanstack/react-query'

import { deleteJson, getJson, postJson, putJson } from '@/lib/api/client'
import type { PageInfo } from '@/lib/api/types'

/**
 * `GET /api/token/` (controller/token.go). `key` arrives MASKED as
 * `abcd**********wxyz` with no `sk-` prefix; the console prepends `sk-` itself.
 */
export type ApiToken = {
  id: number
  user_id: number
  key: string
  /** 1=enabled 2=disabled 3=expired 4=exhausted */
  status: number
  name: string
  created_time: number
  accessed_time: number
  /** -1 means never expires. */
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string | null
  used_quota: number
  group: string
  /** Comma-separated group names; only meaningful when `group` is 'auto'. */
  auto_groups: string
  cross_group_retry: boolean
}

export const TOKEN_STATUS = {
  enabled: 1,
  disabled: 2,
  expired: 3,
  exhausted: 4,
} as const

export type TokenDraft = {
  name: string
  remain_quota: number
  expired_time: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string
  group: string
  auto_groups: string
  cross_group_retry: boolean
}

export function tokenListQuery(page: number, pageSize: number) {
  return queryOptions({
    queryKey: ['tokens', page, pageSize],
    queryFn: () => getJson<PageInfo<ApiToken>>('/api/token/', { params: { p: page, page_size: pageSize } }),
    staleTime: 10 * 1000,
  })
}

export function tokenSearchQuery(keyword: string, page: number, pageSize: number) {
  return queryOptions({
    queryKey: ['tokens', 'search', keyword, page, pageSize],
    queryFn: () =>
      getJson<PageInfo<ApiToken>>('/api/token/search', {
        params: { keyword, p: page, page_size: pageSize },
      }),
    // The server does an exact match unless the caller supplies a wildcard.
    enabled: keyword.length > 0,
    staleTime: 10 * 1000,
  })
}

/** Reveals one full key. The list endpoint only ever returns a masked value. */
export function revealTokenKey(id: number): Promise<string> {
  return postJson<{ key: string }>(`/api/token/${id}/key`).then((data) => data.key)
}

/** Reveals up to 100 keys in a single round trip, keyed by token id. */
export function revealTokenKeys(ids: number[]): Promise<Record<number, string>> {
  return postJson<{ keys: Record<number, string> }>('/api/token/batch/keys', { ids }).then((data) => data.keys)
}

export function createToken(draft: TokenDraft): Promise<unknown> {
  return postJson('/api/token/', draft)
}

export function updateToken(token: Partial<ApiToken> & { id: number }): Promise<unknown> {
  return putJson('/api/token/', token)
}

/** Flips only the status field; the server skips all other validation for this path. */
export function updateTokenStatus(id: number, status: number): Promise<unknown> {
  return putJson('/api/token/?status_only=true', { id, status })
}

export function deleteToken(id: number): Promise<unknown> {
  return deleteJson(`/api/token/${id}`)
}

export function deleteTokens(ids: number[]): Promise<unknown> {
  return postJson('/api/token/batch', { ids })
}

/** Splits the stored comma-separated `auto_groups` column into a list. */
export function parseAutoGroups(token: Pick<ApiToken, 'auto_groups'>): string[] {
  return token.auto_groups
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean)
}
