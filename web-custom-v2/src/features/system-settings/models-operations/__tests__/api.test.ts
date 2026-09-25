import { describe, expect, it } from 'vitest'

import {
  SYSTEM_TASK_TYPE_LOG_CLEANUP,
  SYSTEM_TASK_TYPE_PRICE_SYNC,
  findLatestTask,
  isConflictError,
  isTaskActive,
  readDeletedCount,
  readLogCleanupState,
  readPriceSyncSummary,
  type SystemTask,
} from '@/features/system-settings/models-operations/api'

function task(overrides: Partial<SystemTask>): SystemTask {
  return {
    created_at: 0,
    error: '',
    id: 1,
    locked_by: '',
    payload: null,
    result: null,
    state: null,
    status: 'succeeded',
    task_id: 'systask_x',
    type: SYSTEM_TASK_TYPE_LOG_CLEANUP,
    updated_at: 0,
    ...overrides,
  }
}

/**
 * `GET /api/system-task/list` accepts ONLY `limit` — `controller.ListSystemTasks` reads no
 * `type` parameter, and passing one is silently ignored (verified live). Filtering happens
 * here, so a wrong filter would show a log purge where a price sync belongs.
 */
describe('findLatestTask', () => {
  it('picks the newest task OF THAT TYPE, not the newest task', () => {
    const tasks = [
      task({ created_at: 300, id: 3, type: SYSTEM_TASK_TYPE_LOG_CLEANUP }),
      task({ created_at: 200, id: 2, type: SYSTEM_TASK_TYPE_PRICE_SYNC }),
      task({ created_at: 100, id: 1, type: SYSTEM_TASK_TYPE_PRICE_SYNC }),
    ]

    expect(findLatestTask(tasks, SYSTEM_TASK_TYPE_PRICE_SYNC)?.id).toBe(2)
    expect(findLatestTask(tasks, SYSTEM_TASK_TYPE_LOG_CLEANUP)?.id).toBe(3)
  })

  it('does not rely on the server returning the list in any particular order', () => {
    const tasks = [
      task({ created_at: 100, id: 1, type: SYSTEM_TASK_TYPE_PRICE_SYNC }),
      task({ created_at: 900, id: 9, type: SYSTEM_TASK_TYPE_PRICE_SYNC }),
    ]
    expect(findLatestTask(tasks, SYSTEM_TASK_TYPE_PRICE_SYNC)?.id).toBe(9)
  })

  it('returns undefined for an empty, absent or null list rather than throwing', () => {
    expect(findLatestTask([], SYSTEM_TASK_TYPE_PRICE_SYNC)).toBeUndefined()
    expect(findLatestTask(undefined, SYSTEM_TASK_TYPE_PRICE_SYNC)).toBeUndefined()
    expect(findLatestTask(null, SYSTEM_TASK_TYPE_PRICE_SYNC)).toBeUndefined()
  })
})

describe('isTaskActive', () => {
  it('counts pending and running as active and nothing else', () => {
    expect(isTaskActive(task({ status: 'pending' }))).toBe(true)
    expect(isTaskActive(task({ status: 'running' }))).toBe(true)
    expect(isTaskActive(task({ status: 'succeeded' }))).toBe(false)
    expect(isTaskActive(task({ status: 'failed' }))).toBe(false)
    // `/api/system-task/current` answers `data: null` when nothing is running.
    expect(isTaskActive(null)).toBe(false)
    expect(isTaskActive(undefined)).toBe(false)
  })
})

/**
 * `state`, `result` and `payload` are `any` on the wire. A missing or misshapen field must
 * degrade to a stated default, never crash the panel that reports a running purge.
 */
describe('readLogCleanupState', () => {
  it('reads the live shape a running purge reports', () => {
    expect(
      readLogCleanupState({ processed: 40, progress: 55, remaining: 60, total: 100 }),
    ).toEqual({ processed: 40, progress: 55, remaining: 60, total: 100 })
  })

  it('falls back to zeroes for null, a non-object, or partial fields', () => {
    const empty = { processed: 0, progress: 0, remaining: 0, total: 0 }
    expect(readLogCleanupState(null)).toEqual(empty)
    expect(readLogCleanupState('running')).toEqual(empty)
    expect(readLogCleanupState([])).toEqual(empty)
    expect(readLogCleanupState({ progress: 'nearly' })).toEqual(empty)
    expect(readLogCleanupState({ progress: 12 })).toEqual({ ...empty, progress: 12 })
  })
})

describe('readDeletedCount', () => {
  it('reads the count a finished purge reports', () => {
    expect(readDeletedCount({ deleted_count: 0 })).toBe(0)
    expect(readDeletedCount({ deleted_count: 4210 })).toBe(4210)
  })

  it('distinguishes "not reported" from zero, which are different facts', () => {
    expect(readDeletedCount(null)).toBeUndefined()
    expect(readDeletedCount({})).toBeUndefined()
    expect(readDeletedCount({ deleted_count: 'lots' })).toBeUndefined()
  })
})

describe('readPriceSyncSummary', () => {
  it('passes a summary object through and refuses anything that is not one', () => {
    expect(readPriceSyncSummary({ applied: 3, apply_mode: 'decrease_only' })).toEqual({
      applied: 3,
      apply_mode: 'decrease_only',
    })
    expect(readPriceSyncSummary(null)).toBeUndefined()
    expect(readPriceSyncSummary([])).toBeUndefined()
    expect(readPriceSyncSummary('done')).toBeUndefined()
  })
})

/**
 * A second price sync answers HTTP 409, not a 200 envelope, so it never reaches the
 * envelope check and must be recognised from the axios error.
 */
describe('isConflictError', () => {
  it('recognises the 409 a queued sync produces', () => {
    expect(isConflictError({ response: { status: 409 } })).toBe(true)
  })

  it('does not mistake any other failure for a conflict', () => {
    expect(isConflictError({ response: { status: 500 } })).toBe(false)
    expect(isConflictError(new Error('network down'))).toBe(false)
    expect(isConflictError(null)).toBe(false)
    expect(isConflictError(undefined)).toBe(false)
  })
})
