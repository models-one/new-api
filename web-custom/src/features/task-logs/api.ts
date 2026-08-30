import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'
import type { PageInfo } from '@/lib/api/types'

/**
 * ============================================================================
 * Drawing (Midjourney) tasks — `GET /api/mj/self` and `GET /api/mj/`
 * ============================================================================
 *
 * `model.Midjourney` (model/midjourney.go) serialized whole. Verified against the
 * running dev server; the object below is a verbatim item from `GET /api/mj/self`
 * for a NON-ADMIN account (role 1):
 *
 *   { "id": 900003, "code": 1, "user_id": 12, "action": "BLEND",
 *     "mj_id": "mjprobe003", "prompt": "blend two images", "prompt_en": "",
 *     "description": " ", "state": "", "submit_time": 1788040200000,
 *     "start_time": 1788040201000, "finish_time": 1788040260000,
 *     "image_url": "http://localhost:3000/mj/image/mjprobe003",
 *     "video_url": "", "video_urls": "", "status": "SUCCESS", "progress": "100%",
 *     "fail_reason": "", "channel_id": 7, "quota": 3000,
 *     "buttons": "[]", "properties": "{}" }
 *
 * IMPORTANT — the two endpoints return the SAME FIELDS. `GetUserMidjourney` and
 * `GetAllMidjourney` (controller/midjourney.go) both call `pageInfo.SetItems(items)`
 * on a plain `[]*Midjourney`, and `model.GetAllUserTask` applies no `Omit`. A
 * non-admin therefore already receives `channel_id` and `quota`; admin adds only
 * SCOPE (every user's rows) and the `channel_id` query filter.
 *
 * There is NO username on this payload for anybody — `model.Midjourney` has no such
 * column — so an admin table can show `user_id` and nothing more.
 */
export type DrawingTask = {
  id: number
  /**
   * mj-proxy submit result code, NOT an HTTP status.
   * 1 submitted, 21 waiting, 22 duplicate, 0 not submitted.
   */
  code: number
  user_id: number
  /** One of the 18 `MjAction*` values in constant/midjourney.go. */
  action: string
  /** The upstream mj-proxy task id. Empty while a submit is still failing. */
  mj_id: string
  prompt: string
  prompt_en: string
  description: string
  state: string
  /**
   * MILLISECONDS since the epoch, not seconds — `relay/mjproxy_handler.go` stores
   * `time.Now().UnixNano() / int64(time.Millisecond)`. The same goes for
   * `start_time` and `finish_time`. Run them through `drawingTimeToSeconds`
   * before handing them to anything in `lib/format`.
   */
  submit_time: number
  start_time: number
  finish_time: number
  /**
   * When `MjForwardUrlEnabled` is on (the default) the server REWRITES this to
   * `<server_address>/mj/image/<mj_id>` before responding, so it is a gateway
   * URL rather than the upstream CDN one. Either way it is untrusted text: it is
   * displayed and copied, never rendered as markup.
   */
  image_url: string
  video_url: string
  video_urls: string
  /** NOT_START | SUBMITTED | IN_PROGRESS | SUCCESS | FAILURE | MODAL */
  status: string
  /** A human string such as "0%" or "100%", occasionally "". Never a number. */
  progress: string
  /** Free upstream text. May contain HTML; it is rendered as plain text. */
  fail_reason: string
  channel_id: number
  quota: number
  /** Raw JSON strings straight from the upstream task; unmodelled on purpose. */
  buttons: string
  properties: string
}

/**
 * Filters `GET /api/mj/*` reads (`model.TaskQueryParams`).
 *
 * `channel_id` is accepted ONLY by the admin endpoint: `GetUserMidjourney` never
 * copies it out of the query string, and a live probe confirmed
 * `/api/mj/self?channel_id=999` returns the caller's rows unfiltered.
 *
 * Both timestamps compare against `submit_time`, so they must be in MILLISECONDS.
 */
export type DrawingTaskFilters = {
  mj_id?: string
  channel_id?: string
  start_timestamp?: number
  end_timestamp?: number
}

export function drawingTasksQuery(
  filters: DrawingTaskFilters,
  page: number,
  pageSize: number,
  scope: TaskScope,
) {
  const url = scope === 'all' ? '/api/mj/' : '/api/mj/self'
  return queryOptions({
    queryKey: ['drawing-tasks', scope, filters, page, pageSize],
    queryFn: () =>
      getJson<PageInfo<DrawingTask>>(url, {
        params: { ...filters, p: page, page_size: pageSize },
      }),
    staleTime: 5 * 1000,
  })
}

/**
 * ============================================================================
 * Async tasks — `GET /api/task/self` and `GET /api/task/`
 * ============================================================================
 *
 * `dto.TaskDto` (dto/task.go), built by `relay.TaskModel2Dto`. Verified against the
 * running dev server. NON-ADMIN item from `GET /api/task/self` (role 1):
 *
 *   { "id": 900003, "created_at": 1788040200, "updated_at": 1788040260,
 *     "task_id": "taskprobe003", "platform": "suno", "user_id": 12,
 *     "group": "default", "channel_id": 0, "quota": 5000, "action": "LYRICS",
 *     "status": "SUCCESS", "fail_reason": "", "submit_time": 1788040200,
 *     "start_time": 1788040201, "finish_time": 1788040260, "progress": "100%",
 *     "properties": { "input": "lyrics" }, "data": {} }
 *
 * The SAME row through the admin `GET /api/task/` gains exactly two things:
 *   `username`   — `tasksToDto(items, fillUser=true)` fills it only for admins,
 *                  and `json:"username,omitempty"` means the KEY IS ABSENT for a
 *                  non-admin rather than empty.
 *   `channel_id` — `model.TaskGetAllUserTask` runs `.Omit("channel_id")`, so a
 *                  non-admin always reads 0. The dev server's SQL log confirms
 *                  the column is missing from the `/self` SELECT list. 0 is
 *                  therefore "withheld", not "channel zero".
 *
 * Unlike the drawing payload, these timestamps ARE unix seconds
 * (`model.InitTask` stores `time.Now().Unix()`).
 */
export type AsyncTask = {
  id: number
  created_at: number
  updated_at: number
  /** The gateway-facing id, `task_<32 chars>` for locally generated tasks. */
  task_id: string
  /**
   * NOT a friendly product name. `relay.GetTaskPlatform` returns
   * `strconv.Itoa(channel_type)` whenever a channel is attached, so real values
   * are `"suno"` or a numeric channel-type string such as `"50"` (Kling).
   * `asyncPlatformLabel` turns that back into a name.
   */
  platform: string
  user_id: number
  group: string
  /** Always 0 for a non-admin caller — the column is omitted from their SELECT. */
  channel_id: number
  quota: number
  /** MUSIC | LYRICS | generate | textGenerate | firstTailGenerate | referenceGenerate | remixGenerate */
  action: string
  /** NOT_START | SUBMITTED | QUEUED | IN_PROGRESS | SUCCESS | FAILURE | UNKNOWN */
  status: string
  fail_reason: string
  submit_time: number
  start_time: number
  finish_time: number
  progress: string
  /** `model.Properties`; `input` is the originating prompt. */
  properties?: { input?: string; upstream_model_name?: string; origin_model_name?: string } | null
  /** Present only on the admin endpoint. */
  username?: string
  /** Upstream result blob, shape varies per platform. Not modelled. */
  data?: unknown
  /**
   * DELIBERATELY UNUSED. `Task.GetResultURL()` falls back to `FailReason` when no
   * result URL was stored, so a failed task reports
   * `"result_url": "quota exceeded"` — the fail reason, not a URL. Confirmed live.
   * Presenting it as a link would be presenting an error string as a link.
   */
  result_url?: string
}

/**
 * Filters `GET /api/task/*` reads (`model.SyncTaskQueryParams`).
 *
 * As with drawing, `channel_id` is admin-only — `GetUserTask` never copies it, and
 * `/api/task/self?channel_id=9` was confirmed to ignore it. Every other filter
 * works on both endpoints. Timestamps are unix SECONDS here.
 */
export type AsyncTaskFilters = {
  task_id?: string
  platform?: string
  status?: string
  action?: string
  channel_id?: string
  start_timestamp?: number
  end_timestamp?: number
}

export function asyncTasksQuery(
  filters: AsyncTaskFilters,
  page: number,
  pageSize: number,
  scope: TaskScope,
) {
  const url = scope === 'all' ? '/api/task/' : '/api/task/self'
  return queryOptions({
    queryKey: ['async-tasks', scope, filters, page, pageSize],
    queryFn: () =>
      getJson<PageInfo<AsyncTask>>(url, {
        params: { ...filters, p: page, page_size: pageSize },
      }),
    staleTime: 5 * 1000,
  })
}

/**
 * Which endpoint a page reads. `mine` is `/self` and works for every signed-in
 * account; `all` is the admin listing behind `middleware.AdminAuth()`, which
 * answers 403 `AUTH_INSUFFICIENT_PRIVILEGE` to anyone under role 10.
 */
export type TaskScope = 'mine' | 'all'
