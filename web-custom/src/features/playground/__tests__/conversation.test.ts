import { describe, expect, it } from 'vitest'

import {
  applyEdit,
  buildPayload,
  capMessages,
  isSendableMessage,
  resolveGroup,
  resolveModel,
  truncateForRetry,
} from '@/features/playground/conversation'
import { MAX_STORED_MESSAGES } from '@/features/playground/constants'
import type {
  ParameterEnabled,
  PlaygroundConfig,
  PlaygroundMessage,
} from '@/features/playground/types'

function message(overrides: Partial<PlaygroundMessage> & { id: string }): PlaygroundMessage {
  return {
    content: 'text',
    createdAt: 1_788_049_000_000,
    reasoning: '',
    role: 'user',
    status: 'complete',
    ...overrides,
  }
}

const transcript: PlaygroundMessage[] = [
  message({ content: 'first question', id: 'u1' }),
  message({ content: 'first answer', id: 'a1', role: 'assistant' }),
  message({ content: 'second question', id: 'u2' }),
  message({ content: 'second answer', id: 'a2', role: 'assistant' }),
]

const config: PlaygroundConfig = {
  frequency_penalty: 0.3,
  group: 'vip',
  max_tokens: 512,
  model: 'gpt-4o-mini',
  presence_penalty: 0.4,
  seed: 42,
  stream: true,
  temperature: 0.5,
  top_p: 0.9,
}

const allOn: ParameterEnabled = {
  frequency_penalty: true,
  max_tokens: true,
  presence_penalty: true,
  seed: true,
  temperature: true,
  top_p: true,
}

const allOff: ParameterEnabled = {
  frequency_penalty: false,
  max_tokens: false,
  presence_penalty: false,
  seed: false,
  temperature: false,
  top_p: false,
}

describe('truncateForRetry', () => {
  it('drops an assistant turn and everything after it, keeping the prompting question', () => {
    expect(truncateForRetry(transcript, 'a1')?.map((entry) => entry.id)).toEqual(['u1'])
  })

  it('keeps a user turn and drops what followed it', () => {
    expect(truncateForRetry(transcript, 'u2')?.map((entry) => entry.id)).toEqual([
      'u1',
      'a1',
      'u2',
    ])
  })

  it('returns null for an id that is no longer in the transcript', () => {
    expect(truncateForRetry(transcript, 'gone')).toBeNull()
  })
})

describe('applyEdit', () => {
  it('edits in place without resending', () => {
    const result = applyEdit(transcript, 'u1', 'edited', false)

    expect(result?.shouldSend).toBe(false)
    expect(result?.messages).toHaveLength(4)
    expect(result?.messages[0].content).toBe('edited')
  })

  it('truncates after an edited user turn when resending', () => {
    const result = applyEdit(transcript, 'u1', 'edited', true)

    expect(result?.shouldSend).toBe(true)
    expect(result?.messages.map((entry) => entry.id)).toEqual(['u1'])
    expect(result?.messages[0].content).toBe('edited')
  })

  it('never resends from an assistant turn, even when asked to', () => {
    const result = applyEdit(transcript, 'a1', 'edited', true)

    expect(result?.shouldSend).toBe(false)
    expect(result?.messages).toHaveLength(4)
  })

  it('returns null for an unknown id', () => {
    expect(applyEdit(transcript, 'gone', 'x', false)).toBeNull()
  })
})

describe('isSendableMessage', () => {
  it('drops the empty assistant placeholder that is on screen mid-request', () => {
    expect(
      isSendableMessage(message({ content: '', id: 'p', role: 'assistant', status: 'loading' })),
    ).toBe(false)
  })

  it('drops a failed turn so an error is never replayed to the model as an answer', () => {
    expect(
      isSendableMessage(
        message({ content: 'No available channel', id: 'e', role: 'assistant', status: 'error' }),
      ),
    ).toBe(false)
  })

  it('keeps a partial reply the user stopped', () => {
    expect(
      isSendableMessage(
        message({ content: 'half an answer', id: 's', role: 'assistant', status: 'aborted' }),
      ),
    ).toBe(true)
  })

  it('drops a whitespace-only turn', () => {
    expect(isSendableMessage(message({ content: '   ', id: 'w' }))).toBe(false)
  })
})

describe('buildPayload', () => {
  it('prepends a system turn when a system prompt is set', () => {
    const payload = buildPayload(transcript, '  be terse  ', config, allOff)

    expect(payload.messages[0]).toEqual({ content: 'be terse', role: 'system' })
    expect(payload.messages).toHaveLength(5)
  })

  it('sends no system turn when the prompt is blank', () => {
    const payload = buildPayload(transcript, '   ', config, allOff)

    expect(payload.messages.every((entry) => entry.role !== 'system')).toBe(true)
  })

  it('omits every parameter whose switch is off', () => {
    const payload = buildPayload(transcript, '', config, allOff)

    expect(payload).toEqual({
      group: 'vip',
      messages: expect.any(Array),
      model: 'gpt-4o-mini',
      stream: true,
    })
  })

  it('includes every parameter whose switch is on', () => {
    const payload = buildPayload(transcript, '', config, allOn)

    expect(payload).toMatchObject({
      frequency_penalty: 0.3,
      max_tokens: 512,
      presence_penalty: 0.4,
      seed: 42,
      temperature: 0.5,
      top_p: 0.9,
    })
  })

  it('omits seed when it is enabled but unset', () => {
    const payload = buildPayload(transcript, '', { ...config, seed: null }, allOn)

    expect('seed' in payload).toBe(false)
  })

  it('sends an explicit zero rather than dropping it', () => {
    // 0 is a meaningful temperature; `omitempty`-style dropping would change behaviour.
    const payload = buildPayload(transcript, '', { ...config, temperature: 0 }, allOn)

    expect(payload.temperature).toBe(0)
  })

  it('excludes unsendable turns from the history it sends', () => {
    const withFailure = [
      ...transcript,
      message({ content: 'boom', id: 'e', role: 'assistant', status: 'error' }),
      message({ content: '', id: 'p', role: 'assistant', status: 'loading' }),
    ]

    expect(buildPayload(withFailure, '', config, allOff).messages).toHaveLength(4)
  })
})

describe('capMessages', () => {
  it('keeps the most recent turns when the transcript outgrows the cap', () => {
    const many = Array.from({ length: MAX_STORED_MESSAGES + 10 }, (_unused, index) =>
      message({ content: `m${index}`, id: `m${index}` }),
    )
    const capped = capMessages(many)

    expect(capped).toHaveLength(MAX_STORED_MESSAGES)
    expect(capped.at(-1)?.id).toBe(`m${MAX_STORED_MESSAGES + 9}`)
  })
})

describe('resolveModel / resolveGroup', () => {
  it('leaves a still-valid choice alone', () => {
    expect(resolveModel(['a', 'b'], 'b')).toBeNull()
    expect(resolveGroup(['default', 'vip'], 'vip')).toBeNull()
  })

  it('falls back to the first model when the stored one is gone', () => {
    expect(resolveModel(['a', 'b'], 'removed')).toBe('a')
  })

  it('prefers the default group over an arbitrary first entry', () => {
    expect(resolveGroup(['zeta', 'default'], 'removed')).toBe('default')
  })

  it('has nothing to fall back to when the list is empty', () => {
    expect(resolveModel([], 'x')).toBeNull()
    expect(resolveGroup([], 'x')).toBeNull()
  })
})
