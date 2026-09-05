import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'
import type { LogFilters, LogStat, UserLog } from '@/lib/api/logs'
import type { PageInfo } from '@/lib/api/types'

/**
 * Which of the two log listings the page reads.
 *
 *   mine      GET /api/log/self       + GET /api/log/self/stat   (middleware.UserAuth)
 *   everyone  GET /api/log/           + GET /api/log/stat        (middleware.AdminAuth)
 *
 * `AdminAuth` gates on `common.RoleAdminUser` = 10 (router/api-router.go lines
 * 275-276); a role-1 account gets HTTP 403 `AUTH_INSUFFICIENT_PRIVILEGE` from both
 * admin routes, verified against the dev server. The scope switch is therefore only
 * rendered for role >= 10 — the client gate spares a non-admin two failed requests,
 * the server is the actual boundary.
 */
export type LogScope = 'mine' | 'everyone'

/**
 * The two query parameters only `GetAllLogs` / `GetLogsStat` read
 * (controller/log.go). `GET /api/log/self` parses neither: sending
 * `username=nobody` to it still returned every row of the caller's own log,
 * verified live, so these are never attached in the `mine` scope.
 */
export type AdminLogFilters = LogFilters & {
  /**
   * Matched by `applyExplicitLogTextFilter` on `logs.username` — the SAME rule as
   * `model_name`: `=` exact, switching to `LIKE` only when the value contains a
   * literal `%`. `username=root` and `username=ro%` both returned the 14 root rows
   * live; `username=nobody` returned 0.
   */
  username?: string
  /**
   * `logs.channel_id`. `controller.GetAllLogs` runs the raw query through
   * `strconv.Atoi` and `model.GetAllLogs` skips the clause when the result is 0, so
   * 0 is the "no filter" sentinel and rows with no channel cannot be selected for.
   */
  channel?: number
}

const LOG_LIST_PATHS: Readonly<Record<LogScope, string>> = {
  mine: '/api/log/self',
  everyone: '/api/log/',
}

const LOG_STAT_PATHS: Readonly<Record<LogScope, string>> = {
  mine: '/api/log/self/stat',
  everyone: '/api/log/stat',
}

/**
 * Both listings answer the identical `PageInfo<Log>` shape — the difference is in
 * three fields, confirmed by diffing the same row across both endpoints on the dev
 * server:
 *
 *   channel_name  populated from the channels table by `GetAllLogs`; blanked
 *                 unconditionally by `model.formatUserLogs` for `/self`.
 *   id            the real primary key on `/api/log/`; rewritten to the row's
 *                 display index (1, 2, 3 …) by `assignDisplayLogIds` on `/self`.
 *   other         keeps `admin_info`, `audit_info` and `stream_status`; `/self`
 *                 deletes all three.
 *
 * `channel` (the id) and `username` are NOT stripped for a non-admin — a `/self`
 * row carries the real channel id and the caller's own username.
 */
export function scopedLogsQuery(
  filters: AdminLogFilters,
  page: number,
  pageSize: number,
  scope: LogScope,
) {
  return queryOptions({
    queryKey: ['logs', scope, filters, page, pageSize],
    queryFn: () =>
      getJson<PageInfo<UserLog>>(LOG_LIST_PATHS[scope], {
        params: { ...filters, p: page, page_size: pageSize },
      }),
    staleTime: 5 * 1000,
  })
}

/**
 * `GET /api/log/stat` and `GET /api/log/self/stat` both call `model.SumUsedQuota`,
 * so they share every quirk: `rpm`/`tpm` are pinned to `created_at >= now-60s` and
 * the summed `quota` is hard-filtered to `type = LogTypeConsume`, whatever `type`
 * the caller sent. The admin variant additionally honours `username` and `channel`.
 */
export function scopedLogStatQuery(filters: AdminLogFilters, scope: LogScope) {
  return queryOptions({
    queryKey: ['logs', scope, 'stat', filters],
    queryFn: () => getJson<LogStat>(LOG_STAT_PATHS[scope], { params: filters }),
    staleTime: 30 * 1000,
  })
}
