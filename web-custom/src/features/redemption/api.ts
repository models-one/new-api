import { queryOptions } from '@tanstack/react-query'

import { ApiError, deleteJson, getJson, putJson } from '@/lib/api/client'
import type { ApiEnvelope, PageInfo } from '@/lib/api/types'
import { api } from '@/lib/http-client'

/**
 * `GET /api/redemption/` (controller/redemption.go, model/redemption.go).
 *
 * Verified field-by-field against the running dev server; the row below is a
 * verbatim item from `GET /api/redemption/?p=1&page_size=2`:
 *
 *   { "id": 4, "user_id": 1, "key": "aaaa…0004", "status": 1,
 *     "name": "probe-expired", "quota": 125000, "created_time": 1788016601,
 *     "redeemed_time": 0, "count": 0, "used_user_id": 0,
 *     "DeletedAt": null, "expired_time": 1788013001 }
 *
 * Two fields on that payload are deliberately NOT modelled:
 *   `count`     — request-only (`gorm:"-:all"`), always 0 on a read.
 *   `DeletedAt` — soft-delete bookkeeping, always null for a row the API returns.
 *
 * There is no username for the redeemer: `used_user_id` is the only identity the
 * server records, so the table shows the id and nothing more.
 */
export type RedemptionCode = {
  id: number
  /** The admin who created the batch. */
  user_id: number
  /** The FULL 32-character code. The list endpoint does not mask it — the console does. */
  key: string
  /** 1 unused, 2 disabled, 3 used. "Expired" is not a stored status. */
  status: number
  name: string
  /** Integer quota units; divide by `quota_per_unit` for currency. */
  quota: number
  created_time: number
  /** 0 until the code is redeemed. */
  redeemed_time: number
  /** 0 means the code never expires. */
  expired_time: number
  /** 0 until the code is redeemed; the API exposes no name for this user. */
  used_user_id: number
}

/** Mirrors `common.RedemptionCodeStatus*` in common/constants.go. */
export const REDEMPTION_STATUS = {
  unused: 1,
  disabled: 2,
  used: 3,
} as const

/**
 * `status=expired` is a filter the SERVER understands (`model.SearchRedemptions`)
 * even though no row ever stores it: it selects `status = 1 AND expired_time != 0
 * AND expired_time < now`.
 */
export const REDEMPTION_EXPIRED_FILTER = 'expired'

export type RedemptionStatusFilter =
  | ''
  | `${typeof REDEMPTION_STATUS.unused}`
  | `${typeof REDEMPTION_STATUS.disabled}`
  | `${typeof REDEMPTION_STATUS.used}`
  | typeof REDEMPTION_EXPIRED_FILTER

/** The body `POST /api/redemption/` and `PUT /api/redemption/` bind (model.Redemption). */
export type RedemptionDraft = {
  name: string
  /** Integer quota units, already multiplied by `quota_per_unit`. */
  quota: number
  /** Unix SECONDS; 0 means never. The server rejects a past, non-zero value. */
  expired_time: number
  /** Create only. The server requires 1..100. */
  count?: number
}

export type CreateRedemptionResult = {
  /** The generated codes, in creation order. Returned exactly once. */
  keys: string[]
  /**
   * Set when the server aborted part-way through a batch: `AddRedemption` answers
   * `success: false` but still returns the codes it had already inserted, and those
   * rows exist. Dropping them would strand real, unreadable codes in the database.
   */
  partialError?: string
}

/**
 * One factory for both list endpoints. `/api/redemption/search` and
 * `/api/redemption/` return the identical `PageInfo` envelope, and search with an
 * empty keyword and empty status is equivalent to the plain list — but the plain
 * list skips the `LIKE` machinery, so the unfiltered view uses it.
 */
export function redemptionsQuery(
  filters: { keyword: string; status: RedemptionStatusFilter },
  page: number,
  pageSize: number,
) {
  const keyword = filters.keyword.trim()
  const isSearch = keyword !== '' || filters.status !== ''

  return queryOptions({
    queryKey: ['redemptions', keyword, filters.status, page, pageSize] as const,
    queryFn: () =>
      getJson<PageInfo<RedemptionCode>>(isSearch ? '/api/redemption/search' : '/api/redemption/', {
        params: isSearch
          ? { keyword, status: filters.status, p: page, page_size: pageSize }
          : { p: page, page_size: pageSize },
        // The page renders its own error panel; the global interceptor must not
        // also fire a toast for the same failure.
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    staleTime: 10 * 1000,
  })
}

/** `GET /api/redemption/:id` — read-back before editing, so the form never shows a stale row. */
export function fetchRedemption(id: number): Promise<RedemptionCode> {
  return getJson<RedemptionCode>(`/api/redemption/${id}`, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/**
 * `POST /api/redemption/` answers `{ success, message, data: string[] }`.
 * Read through the raw envelope rather than `postJson` so a partial batch keeps
 * its codes instead of being thrown away with the error.
 */
export async function createRedemptionCodes(draft: RedemptionDraft): Promise<CreateRedemptionResult> {
  const response = await api.post<ApiEnvelope<string[] | null>>('/api/redemption/', draft, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  const envelope = response.data
  const keys = Array.isArray(envelope.data) ? envelope.data : []

  if (!envelope.success) {
    if (keys.length === 0) throw new ApiError(envelope.message || 'Request failed')
    return { keys, partialError: envelope.message ?? '' }
  }

  return { keys }
}

/** `PUT /api/redemption/` rewrites name, quota and expiry. Status is untouched on this path. */
export function updateRedemption(payload: RedemptionDraft & { id: number }): Promise<RedemptionCode> {
  return putJson<RedemptionCode>('/api/redemption/', payload, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/** `PUT /api/redemption/?status_only=true` skips the expiry validation and writes only `status`. */
export function updateRedemptionStatus(id: number, status: number): Promise<RedemptionCode> {
  return putJson<RedemptionCode>('/api/redemption/?status_only=true', { id, status }, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

export function deleteRedemption(id: number): Promise<unknown> {
  return deleteJson(`/api/redemption/${id}`, { skipBusinessError: true, skipErrorHandler: true })
}

/**
 * `DELETE /api/redemption/invalid` → `data` is the number of rows removed.
 *
 * "Invalid" is `model.DeleteInvalidRedemptions`, verbatim:
 *   status IN (used, disabled) OR (status = unused AND expired_time != 0 AND expired_time < now)
 * It is unscoped — the current search, status filter and page are all ignored.
 */
export function deleteInvalidRedemptions(): Promise<number> {
  return deleteJson<number>('/api/redemption/invalid', {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}
