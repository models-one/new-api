import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'
import type { PageInfo } from '@/lib/api/types'

/** `model.Log` as serialized for a non-admin caller (admin_info is stripped server-side). */
export type UserLog = {
  id: number
  user_id: number
  created_at: number
  /** 1=topup 2=consume 3=manage 4=system 5=error 7=login */
  type: number
  content: string
  username: string
  token_name: string
  model_name: string
  quota: number
  prompt_tokens: number
  completion_tokens: number
  /** Whole SECONDS, not milliseconds — the backend stores `now - start` in seconds. */
  use_time: number
  is_stream: boolean
  channel: number
  channel_name: string
  token_id: number
  group: string
  ip: string
  request_id: string
  other: string
}

export const LOG_TYPE = {
  all: 0,
  topup: 1,
  consume: 2,
  manage: 3,
  system: 4,
  error: 5,
  login: 7,
} as const

export type LogFilters = {
  type?: number
  token_name?: string
  model_name?: string
  group?: string
  request_id?: string
  start_timestamp?: number
  end_timestamp?: number
}

export function userLogsQuery(filters: LogFilters, page: number, pageSize: number) {
  return queryOptions({
    queryKey: ['logs', 'self', filters, page, pageSize],
    queryFn: () =>
      getJson<PageInfo<UserLog>>('/api/log/self', {
        params: { ...filters, p: page, page_size: pageSize },
      }),
    staleTime: 5 * 1000,
  })
}

/** `GET /api/log/self/stat`. Note: rpm and tpm are a live 60-second snapshot, NOT range totals. */
export type LogStat = {
  quota: number
  rpm: number
  tpm: number
}

export function logStatQuery(filters: LogFilters) {
  return queryOptions({
    queryKey: ['logs', 'self', 'stat', filters],
    queryFn: () => getJson<LogStat>('/api/log/self/stat', { params: filters }),
    staleTime: 30 * 1000,
  })
}

/** `other` is a JSON blob whose contents vary by log type; parse defensively. */
export function parseLogOther(log: Pick<UserLog, 'other'>): Record<string, unknown> {
  if (!log.other) return {}
  try {
    const parsed: unknown = JSON.parse(log.other)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
