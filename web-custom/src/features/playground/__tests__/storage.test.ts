// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_CONFIG,
  DEFAULT_PARAMETER_ENABLED,
  STORAGE_KEYS,
} from '@/features/playground/constants'
import {
  loadConfig,
  loadMessages,
  loadParameterEnabled,
  saveConfig,
  saveMessages,
} from '@/features/playground/storage'
import { normalizeParameterValue } from '@/features/playground/parameters'

beforeEach(() => {
  localStorage.clear()
})

/**
 * Stored state is user-editable and may be written by an older build, so every read has
 * to survive garbage rather than throwing during the initial render.
 */
describe('loadConfig', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('returns defaults for a corrupt entry', () => {
    localStorage.setItem(STORAGE_KEYS.config, 'not json {{{')

    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('replaces individual fields of the wrong type with their default', () => {
    localStorage.setItem(
      STORAGE_KEYS.config,
      JSON.stringify({ model: 'gpt-4o-mini', stream: 'yes', temperature: 'hot' }),
    )
    const config = loadConfig()

    expect(config.model).toBe('gpt-4o-mini')
    expect(config.stream).toBe(DEFAULT_CONFIG.stream)
    expect(config.temperature).toBe(DEFAULT_CONFIG.temperature)
  })

  it('never restores an empty group, which would disable the model query forever', () => {
    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify({ group: '' }))

    expect(loadConfig().group).toBe(DEFAULT_CONFIG.group)
  })

  it('round-trips a saved config', () => {
    const config = { ...DEFAULT_CONFIG, model: 'gpt-4o-mini', seed: 7, temperature: 0.2 }
    saveConfig(config)

    expect(loadConfig()).toEqual(config)
  })

  it('does not throw when storage refuses to write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => saveConfig(DEFAULT_CONFIG)).not.toThrow()
    setItem.mockRestore()
  })
})

describe('loadParameterEnabled', () => {
  it('falls back to defaults for a non-object entry', () => {
    localStorage.setItem(STORAGE_KEYS.parameters, '"nope"')

    expect(loadParameterEnabled()).toEqual(DEFAULT_PARAMETER_ENABLED)
  })
})

describe('loadMessages', () => {
  it('returns an empty transcript when nothing is stored', () => {
    expect(loadMessages()).toEqual([])
  })

  it('drops entries that are not recognisable messages', () => {
    localStorage.setItem(
      STORAGE_KEYS.messages,
      JSON.stringify([
        { content: 'kept', id: 'a', role: 'user', status: 'complete' },
        { id: 'b', role: 'user' },
        { content: 'bad role', id: 'c', role: 'robot', status: 'complete' },
        null,
      ]),
    )

    expect(loadMessages().map((entry) => entry.id)).toEqual(['a'])
  })

  it('restores a message that was mid-flight as aborted, never as loading', () => {
    // Nothing is going to arrive for it, so a spinner that never resolves would lie.
    localStorage.setItem(
      STORAGE_KEYS.messages,
      JSON.stringify([
        { content: 'half', id: 'a', role: 'assistant', status: 'streaming' },
        { content: '', id: 'b', role: 'assistant', status: 'loading' },
      ]),
    )
    const messages = loadMessages()

    expect(messages.map((entry) => entry.status)).toEqual(['aborted', 'aborted'])
  })

  it('preserves a stored error so the failure survives a reload', () => {
    localStorage.setItem(
      STORAGE_KEYS.messages,
      JSON.stringify([
        {
          content: '',
          error: { code: 'model_not_found', message: 'No available channel', type: 'new_api_error' },
          id: 'a',
          role: 'assistant',
          status: 'error',
        },
      ]),
    )

    expect(loadMessages()[0].error?.code).toBe('model_not_found')
  })

  it('round-trips usage figures', () => {
    saveMessages([
      {
        content: 'hi',
        createdAt: 1_788_049_000_000,
        id: 'a',
        reasoning: '',
        role: 'assistant',
        status: 'complete',
        usage: { completion_tokens: 7, prompt_tokens: 9, total_tokens: 16 },
      },
    ])

    expect(loadMessages()[0].usage).toEqual({
      completion_tokens: 7,
      prompt_tokens: 9,
      total_tokens: 16,
    })
  })
})

describe('normalizeParameterValue', () => {
  it('clamps above the maximum', () => {
    expect(normalizeParameterValue('temperature', 99)).toBe(2)
  })

  it('clamps below the minimum', () => {
    expect(normalizeParameterValue('frequency_penalty', -50)).toBe(-2)
  })

  it('truncates integer-stepped parameters', () => {
    expect(normalizeParameterValue('max_tokens', '512.9')).toBe(512)
  })

  it('rounds float steps to the step precision', () => {
    expect(normalizeParameterValue('temperature', 0.30000000000000004)).toBe(0.3)
  })

  it('treats a cleared seed as unset, not as zero', () => {
    expect(normalizeParameterValue('seed', '')).toBeNull()
  })

  it('falls back to the minimum when a non-seed field is cleared', () => {
    expect(normalizeParameterValue('top_p', '')).toBe(0)
  })

  it('rejects unparseable text', () => {
    expect(normalizeParameterValue('temperature', 'abc')).toBe(0)
  })
})
