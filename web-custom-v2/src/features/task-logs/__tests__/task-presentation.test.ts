import { describe, expect, it } from 'vitest'

import type { AsyncTask, DrawingTask } from '@/features/task-logs/api'
import {
  ASYNC_ACTION_LABELS,
  ASYNC_STATUS_LABELS,
  DRAWING_ACTION_LABELS,
  DRAWING_STATUS_LABELS,
  DRAWING_SUBMIT_CODE_LABELS,
  asyncHasDetail,
  asyncPlatformLabel,
  drawingHasDetail,
  drawingStatusTone,
  drawingSubmitCodeTone,
  drawingTimeToSeconds,
  isUnmappedNumericPlatform,
  parseProgressPercent,
  secondsToDrawingTime,
  taskDurationSeconds,
} from '@/features/task-logs/task-presentation'

function drawing(overrides: Partial<DrawingTask> = {}): DrawingTask {
  return {
    id: 900001,
    code: 1,
    user_id: 1,
    action: 'IMAGINE',
    mj_id: 'mjprobe001',
    prompt: '',
    prompt_en: '',
    description: '',
    state: '',
    submit_time: 1788040000000,
    start_time: 1788040001000,
    finish_time: 1788040030000,
    image_url: '',
    video_url: '',
    video_urls: '',
    status: 'SUCCESS',
    progress: '100%',
    fail_reason: '',
    channel_id: 7,
    quota: 4000,
    buttons: '[]',
    properties: '{}',
    ...overrides,
  }
}

function asyncTask(overrides: Partial<AsyncTask> = {}): AsyncTask {
  return {
    id: 900001,
    created_at: 1788040000,
    updated_at: 1788040030,
    task_id: 'taskprobe001',
    platform: 'suno',
    user_id: 1,
    group: '',
    channel_id: 0,
    quota: 12000,
    action: 'MUSIC',
    status: 'SUCCESS',
    fail_reason: '',
    submit_time: 1788040000,
    start_time: 1788040001,
    finish_time: 1788040030,
    progress: '100%',
    properties: null,
    ...overrides,
  }
}

describe('drawing timestamps are milliseconds', () => {
  it('converts the millisecond instants the mj tables store into seconds', () => {
    // relay/mjproxy_handler.go writes UnixNano()/Millisecond.
    expect(drawingTimeToSeconds(1788040000000)).toBe(1788040000)
  })

  it('keeps 0 as 0 so "never happened" stays distinguishable from the epoch', () => {
    expect(drawingTimeToSeconds(0)).toBe(0)
  })

  it('treats negative and non-finite values as absent rather than as instants', () => {
    expect(drawingTimeToSeconds(-5)).toBe(0)
    expect(drawingTimeToSeconds(Number.NaN)).toBe(0)
  })

  it('round-trips a filter bound back into milliseconds for the query string', () => {
    expect(secondsToDrawingTime(1788040000)).toBe(1788040000000)
    expect(drawingTimeToSeconds(secondsToDrawingTime(1788040000))).toBe(1788040000)
  })
})

describe('parseProgressPercent', () => {
  it('reads the percentage strings the backend actually stores', () => {
    expect(parseProgressPercent('0%')).toBe(0)
    expect(parseProgressPercent('100%')).toBe(100)
    expect(parseProgressPercent(' 42 % ')).toBe(42)
    expect(parseProgressPercent('12.5%')).toBe(12.5)
  })

  it('returns undefined for text that carries no percentage, rather than guessing 0', () => {
    expect(parseProgressPercent('')).toBeUndefined()
    expect(parseProgressPercent('pending')).toBeUndefined()
    expect(parseProgressPercent('100')).toBeUndefined()
  })

  it('clamps a nonsense percentage into the bar range', () => {
    expect(parseProgressPercent('420%')).toBe(100)
  })
})

describe('taskDurationSeconds', () => {
  it('derives finish minus submit', () => {
    expect(taskDurationSeconds(1788040000, 1788040030)).toBe(30)
  })

  it('is undefined while the task has not finished', () => {
    expect(taskDurationSeconds(1788040000, 0)).toBeUndefined()
  })

  it('is undefined when no submit instant was recorded', () => {
    expect(taskDurationSeconds(0, 1788040030)).toBeUndefined()
  })

  it('refuses a negative span instead of rendering a negative duration', () => {
    expect(taskDurationSeconds(1788040030, 1788040000)).toBeUndefined()
  })
})

describe('drawing label maps match constant/midjourney.go', () => {
  it('covers all eighteen MjAction constants', () => {
    const goActions = [
      'IMAGINE', 'DESCRIBE', 'BLEND', 'UPSCALE', 'VARIATION', 'REROLL',
      'INPAINT', 'MODAL', 'ZOOM', 'CUSTOM_ZOOM', 'SHORTEN', 'HIGH_VARIATION',
      'LOW_VARIATION', 'PAN', 'SWAP_FACE', 'UPLOAD', 'VIDEO', 'EDITS',
    ]
    expect(Object.keys(DRAWING_ACTION_LABELS).sort()).toEqual([...goActions].sort())
  })

  it('covers every status the mj poller writes', () => {
    expect(Object.keys(DRAWING_STATUS_LABELS).sort()).toEqual(
      ['NOT_START', 'SUBMITTED', 'IN_PROGRESS', 'SUCCESS', 'FAILURE', 'MODAL'].sort(),
    )
  })

  it('maps the four mj-proxy submit codes and leaves others unnamed', () => {
    expect(DRAWING_SUBMIT_CODE_LABELS[1]).toBe('Submitted')
    expect(DRAWING_SUBMIT_CODE_LABELS[21]).toBe('Waiting')
    expect(DRAWING_SUBMIT_CODE_LABELS[22]).toBe('Duplicate')
    expect(DRAWING_SUBMIT_CODE_LABELS[0]).toBe('Not submitted')
    expect(DRAWING_SUBMIT_CODE_LABELS[99]).toBeUndefined()
    expect(drawingSubmitCodeTone(99)).toBe('muted')
  })

  it('falls back to a muted tone for a status it has never seen', () => {
    expect(drawingStatusTone('FAILURE')).toBe('destructive')
    expect(drawingStatusTone('WAT')).toBe('muted')
  })
})

describe('async platform is a channel-type number, not a product name', () => {
  it('names the numeric channel types relay.GetTaskAdaptor dispatches on', () => {
    expect(asyncPlatformLabel('50')).toBe('Kling')
    expect(asyncPlatformLabel('55')).toBe('Sora')
    expect(asyncPlatformLabel('17')).toBe('Ali')
  })

  it('names the one literal platform middleware sets', () => {
    expect(asyncPlatformLabel('suno')).toBe('Suno')
  })

  it('leaves an unknown channel type unnamed so the raw value can be shown', () => {
    expect(asyncPlatformLabel('999')).toBeUndefined()
    expect(isUnmappedNumericPlatform('999')).toBe(true)
    expect(isUnmappedNumericPlatform('50')).toBe(false)
    expect(isUnmappedNumericPlatform('suno')).toBe(false)
  })
})

describe('async label maps match constant/task.go and model/task.go', () => {
  it('covers the seven task actions', () => {
    expect(Object.keys(ASYNC_ACTION_LABELS).sort()).toEqual(
      ['MUSIC', 'LYRICS', 'generate', 'textGenerate', 'firstTailGenerate',
        'referenceGenerate', 'remixGenerate'].sort(),
    )
  })

  it('covers the seven TaskStatus values', () => {
    expect(Object.keys(ASYNC_STATUS_LABELS).sort()).toEqual(
      ['NOT_START', 'SUBMITTED', 'QUEUED', 'IN_PROGRESS', 'SUCCESS', 'FAILURE', 'UNKNOWN'].sort(),
    )
  })
})

describe('row detail availability', () => {
  it('sees detail on a drawing row that carries a prompt or a failure', () => {
    expect(drawingHasDetail(drawing())).toBe(false)
    expect(drawingHasDetail(drawing({ prompt: 'a cat' }))).toBe(true)
    expect(drawingHasDetail(drawing({ fail_reason: 'upstream refused' }))).toBe(true)
    expect(drawingHasDetail(drawing({ image_url: 'https://example.com/a.png' }))).toBe(true)
  })

  it('ignores a description that is only whitespace', () => {
    expect(drawingHasDetail(drawing({ description: '   ' }))).toBe(false)
  })

  it('sees detail on an async row with a recorded input', () => {
    expect(asyncHasDetail(asyncTask())).toBe(false)
    expect(asyncHasDetail(asyncTask({ properties: { input: 'a song' } }))).toBe(true)
    expect(asyncHasDetail(asyncTask({ fail_reason: 'quota exceeded' }))).toBe(true)
  })

  it('survives properties being null, which the API does return', () => {
    expect(() => asyncHasDetail(asyncTask({ properties: null }))).not.toThrow()
  })
})
