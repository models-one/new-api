import type { Tone } from '@/components/ui/tone'

import type { AsyncTask, DrawingTask } from '@/features/task-logs/api'

/**
 * `common.RoleAdminUser` in common/constants.go — the floor `middleware.AdminAuth()`
 * enforces on `GET /api/mj/` and `GET /api/task/`. Root is 100, but 10 is the gate.
 */
export const ADMIN_ROLE = 10

/**
 * Drawing timestamps arrive in MILLISECONDS (`relay/mjproxy_handler.go` writes
 * `UnixNano() / int64(time.Millisecond)`) while every helper in `lib/format`
 * expects unix SECONDS. This is the single conversion point.
 *
 * 0 means "never happened" — an unstarted or unfinished task — and stays 0 so
 * callers can tell it apart from a real instant.
 */
export const DRAWING_TIME_DIVISOR = 1000

export function drawingTimeToSeconds(milliseconds: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 0
  return Math.floor(milliseconds / DRAWING_TIME_DIVISOR)
}

/** The inverse, for the `start_timestamp` / `end_timestamp` filters on `/api/mj/*`. */
export function secondsToDrawingTime(seconds: number): number {
  return seconds * DRAWING_TIME_DIVISOR
}

/**
 * The 18 `MjAction*` constants in constant/midjourney.go, each with the label the
 * console shows. Read out of the Go source rather than the legacy JS map, which
 * was missing MODAL entirely.
 */
export const DRAWING_ACTION_LABELS: Readonly<Record<string, string>> = {
  IMAGINE: 'Imagine',
  DESCRIBE: 'Describe',
  BLEND: 'Blend',
  UPSCALE: 'Upscale',
  VARIATION: 'Vary',
  REROLL: 'Reroll',
  INPAINT: 'Inpaint',
  MODAL: 'Modal',
  ZOOM: 'Zoom',
  CUSTOM_ZOOM: 'Custom zoom',
  SHORTEN: 'Shorten',
  HIGH_VARIATION: 'Vary (strong)',
  LOW_VARIATION: 'Vary (subtle)',
  PAN: 'Pan',
  SWAP_FACE: 'Swap face',
  UPLOAD: 'Upload',
  VIDEO: 'Video',
  EDITS: 'Edit',
}

const DRAWING_ACTION_TONES: Readonly<Record<string, Tone>> = {
  IMAGINE: 'primary',
  DESCRIBE: 'warning',
  BLEND: 'success',
  UPSCALE: 'info',
  VARIATION: 'secondary',
  REROLL: 'secondary',
  INPAINT: 'secondary',
  MODAL: 'muted',
  ZOOM: 'info',
  CUSTOM_ZOOM: 'info',
  SHORTEN: 'warning',
  HIGH_VARIATION: 'secondary',
  LOW_VARIATION: 'secondary',
  PAN: 'info',
  SWAP_FACE: 'secondary',
  UPLOAD: 'muted',
  VIDEO: 'primary',
  EDITS: 'warning',
}

/** Every action the backend can store, in the order constant/midjourney.go lists them. */
export const DRAWING_ACTION_VALUES = Object.keys(DRAWING_ACTION_LABELS)

export function drawingActionTone(action: string): Tone {
  return DRAWING_ACTION_TONES[action] ?? 'muted'
}

/** `model.Midjourney.Status`, written by the mj-proxy poller. */
export const DRAWING_STATUS_LABELS: Readonly<Record<string, string>> = {
  NOT_START: 'Not started',
  SUBMITTED: 'Queued',
  IN_PROGRESS: 'In progress',
  SUCCESS: 'Succeeded',
  FAILURE: 'Failed',
  MODAL: 'Awaiting input',
}

const DRAWING_STATUS_TONES: Readonly<Record<string, Tone>> = {
  NOT_START: 'muted',
  SUBMITTED: 'warning',
  IN_PROGRESS: 'info',
  SUCCESS: 'success',
  FAILURE: 'destructive',
  MODAL: 'warning',
}

export function drawingStatusTone(status: string): Tone {
  return DRAWING_STATUS_TONES[status] ?? 'muted'
}

/**
 * `code` is the mj-proxy SUBMIT result, not an HTTP status: 1 accepted, 21 queued
 * upstream, 22 deduplicated onto an existing task, 0 never submitted. Anything
 * else is surfaced as the raw number instead of being guessed at.
 */
export const DRAWING_SUBMIT_CODE_LABELS: Readonly<Record<number, string>> = {
  0: 'Not submitted',
  1: 'Submitted',
  21: 'Waiting',
  22: 'Duplicate',
}

const DRAWING_SUBMIT_CODE_TONES: Readonly<Record<number, Tone>> = {
  0: 'warning',
  1: 'success',
  21: 'info',
  22: 'secondary',
}

export function drawingSubmitCodeTone(code: number): Tone {
  return DRAWING_SUBMIT_CODE_TONES[code] ?? 'muted'
}

/**
 * `dto.TaskDto.Action` — the 7 constants in constant/task.go. The uppercase pair is
 * Suno's; the camelCase ones belong to the video adaptors.
 */
export const ASYNC_ACTION_LABELS: Readonly<Record<string, string>> = {
  MUSIC: 'Generate music',
  LYRICS: 'Generate lyrics',
  generate: 'Image to video',
  textGenerate: 'Text to video',
  firstTailGenerate: 'First and last frame to video',
  referenceGenerate: 'Reference to video',
  remixGenerate: 'Video remix',
}

export const ASYNC_ACTION_VALUES = Object.keys(ASYNC_ACTION_LABELS)

const ASYNC_ACTION_TONES: Readonly<Record<string, Tone>> = {
  MUSIC: 'primary',
  LYRICS: 'secondary',
  generate: 'info',
  textGenerate: 'info',
  firstTailGenerate: 'info',
  referenceGenerate: 'info',
  remixGenerate: 'info',
}

export function asyncActionTone(action: string): Tone {
  return ASYNC_ACTION_TONES[action] ?? 'muted'
}

/** `model.TaskStatus` in model/task.go. QUEUED is stored alongside SUBMITTED. */
export const ASYNC_STATUS_LABELS: Readonly<Record<string, string>> = {
  NOT_START: 'Not started',
  SUBMITTED: 'Submitted',
  QUEUED: 'Queued',
  IN_PROGRESS: 'In progress',
  SUCCESS: 'Succeeded',
  FAILURE: 'Failed',
  UNKNOWN: 'Unknown',
}

export const ASYNC_STATUS_VALUES = Object.keys(ASYNC_STATUS_LABELS)

const ASYNC_STATUS_TONES: Readonly<Record<string, Tone>> = {
  NOT_START: 'muted',
  SUBMITTED: 'warning',
  QUEUED: 'warning',
  IN_PROGRESS: 'info',
  SUCCESS: 'success',
  FAILURE: 'destructive',
  UNKNOWN: 'muted',
}

export function asyncStatusTone(status: string): Tone {
  return ASYNC_STATUS_TONES[status] ?? 'muted'
}

/**
 * `platform` is whatever `relay.GetTaskPlatform` produced: the literal `"suno"`
 * (set by middleware/distributor.go) or, for every channel-backed task,
 * `strconv.Itoa(channel_type)`. These are the numeric types `relay.GetTaskAdaptor`
 * actually dispatches on, named from `constant.ChannelTypeNames`.
 *
 * `"mj"` is `constant.TaskPlatformMidjourney`; Midjourney rows live in their own
 * table and their own page, but the constant exists so the value is mapped rather
 * than left looking like a stray string.
 */
export const ASYNC_PLATFORM_LABELS: Readonly<Record<string, string>> = {
  suno: 'Suno',
  mj: 'Midjourney',
  '1': 'OpenAI',
  '17': 'Ali',
  '24': 'Gemini',
  '35': 'MiniMax',
  '41': 'VertexAI',
  '45': 'VolcEngine',
  '50': 'Kling',
  '51': 'Jimeng',
  '52': 'Vidu',
  '54': 'DoubaoVideo',
  '55': 'Sora',
}

export const ASYNC_PLATFORM_VALUES = Object.keys(ASYNC_PLATFORM_LABELS)

const ASYNC_PLATFORM_TONES: Readonly<Record<string, Tone>> = {
  suno: 'success',
  mj: 'primary',
  '1': 'muted',
  '17': 'warning',
  '24': 'info',
  '35': 'secondary',
  '41': 'info',
  '45': 'warning',
  '50': 'primary',
  '51': 'secondary',
  '52': 'info',
  '54': 'warning',
  '55': 'primary',
}

export function asyncPlatformTone(platform: string): Tone {
  return ASYNC_PLATFORM_TONES[platform] ?? 'muted'
}

/**
 * A platform this console has no name for is shown verbatim rather than as
 * "Unknown", because the raw value is the only thing that identifies the channel
 * type an operator would need to look up.
 */
export function asyncPlatformLabel(platform: string): string | undefined {
  return ASYNC_PLATFORM_LABELS[platform]
}

/** True when `platform` is a bare channel-type number we have no name for. */
export function isUnmappedNumericPlatform(platform: string): boolean {
  return ASYNC_PLATFORM_LABELS[platform] === undefined && /^\d+$/.test(platform)
}

/**
 * `progress` is upstream free text, normally "0%".."100%" but occasionally empty
 * or something else entirely. Returns a 0..100 number, or undefined when the
 * string carries no percentage — in which case the UI shows the raw text instead
 * of inventing a bar position.
 */
export function parseProgressPercent(progress: string): number | undefined {
  if (typeof progress !== 'string') return undefined
  const match = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(progress)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  return Math.min(Math.max(value, 0), 100)
}

/**
 * Elapsed seconds between two unix-SECOND instants, or undefined when either end
 * is missing. Callers convert drawing milliseconds first.
 *
 * Derived client-side: FINISH - SUBMIT. The UI labels it as such.
 */
export function taskDurationSeconds(
  submitSeconds: number,
  finishSeconds: number,
): number | undefined {
  if (submitSeconds <= 0 || finishSeconds <= 0) return undefined
  const elapsed = finishSeconds - submitSeconds
  return elapsed < 0 ? undefined : elapsed
}

export function drawingRowId(task: DrawingTask): string {
  return String(task.id)
}

export function asyncRowId(task: AsyncTask): string {
  return String(task.id)
}

/**
 * Whether this row carries anything the expanded detail panel would show that the
 * columns do not. Used to keep the expander out of the tab order on bare rows.
 */
export function drawingHasDetail(task: DrawingTask): boolean {
  return (
    task.prompt !== '' ||
    task.prompt_en !== '' ||
    task.description.trim() !== '' ||
    task.fail_reason !== '' ||
    task.image_url !== '' ||
    task.video_url !== ''
  )
}

export function asyncHasDetail(task: AsyncTask): boolean {
  const input = task.properties?.input ?? ''
  return input !== '' || task.fail_reason !== '' || task.group !== ''
}
