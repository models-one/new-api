import { describe, expect, it } from 'vitest'

import { SseFrameParser, isDoneFrame } from '@/features/playground/sse'

/**
 * Frames copied verbatim from `POST /pg/chat/completions` on the dev server, with a
 * mock upstream behind a temporary channel. The relay passes upstream chunks through
 * unchanged and appends `usage` to the final one.
 */
const REAL_STREAM = [
  'data: {"id": "chatcmpl-mock", "object": "chat.completion.chunk", "model": "gpt-4o-mini", "choices": [{"index": 0, "delta": {"reasoning_content": "thinking..."}, "finish_reason": null}]}\n\n',
  'data: {"id": "chatcmpl-mock", "object": "chat.completion.chunk", "model": "gpt-4o-mini", "choices": [{"index": 0, "delta": {"content": "# Hi\\n\\n"}, "finish_reason": null}]}\n\n',
  'data: {"id": "chatcmpl-mock", "object": "chat.completion.chunk", "model": "gpt-4o-mini", "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 9, "completion_tokens": 7, "total_tokens": 16}}\n\n',
  'data: [DONE]\n\n',
].join('')

describe('SseFrameParser', () => {
  it('splits the real relay stream into one frame per chunk', () => {
    const frames = new SseFrameParser().push(REAL_STREAM)

    expect(frames).toHaveLength(4)
    expect(isDoneFrame(frames[3])).toBe(true)
    expect(JSON.parse(frames[0].data).choices[0].delta.reasoning_content).toBe('thinking...')
  })

  it('holds a partial frame until the rest of it arrives', () => {
    const parser = new SseFrameParser()

    // A network chunk can end anywhere, including mid-JSON.
    expect(parser.push('data: {"choices":[{"delta":{"con')).toEqual([])
    expect(parser.push('tent":"hello"}}]}')).toEqual([])

    const frames = parser.push('\n\n')
    expect(frames).toHaveLength(1)
    expect(JSON.parse(frames[0].data).choices[0].delta.content).toBe('hello')
  })

  it('does not emit a frame when only half the blank-line terminator has arrived', () => {
    const parser = new SseFrameParser()

    expect(parser.push('data: {"a":1}\n')).toEqual([])
    expect(parser.push('\ndata: {"a":2}\n\n')).toHaveLength(2)
  })

  it('joins multi-line data fields with a newline, per the SSE spec', () => {
    const frames = new SseFrameParser().push('data: line one\ndata: line two\n\n')

    expect(frames).toEqual([{ data: 'line one\nline two' }])
  })

  it('skips comment and heartbeat lines without emitting a frame', () => {
    const parser = new SseFrameParser()

    expect(parser.push(': keep-alive\n\n')).toEqual([])
    expect(parser.push('data: {"a":1}\n\n')).toHaveLength(1)
  })

  it('normalises CRLF terminators', () => {
    const frames = new SseFrameParser().push('data: {"a":1}\r\n\r\n')

    expect(frames).toEqual([{ data: '{"a":1}' }])
  })

  it('strips exactly one leading space after the colon', () => {
    const frames = new SseFrameParser().push('data:  two spaces\n\n')

    expect(frames[0].data).toBe(' two spaces')
  })

  it('captures a named event when the server sends one', () => {
    const frames = new SseFrameParser().push('event: ping\ndata: {"a":1}\n\n')

    expect(frames[0].event).toBe('ping')
  })

  it('flushes a trailing frame the server left unterminated', () => {
    const parser = new SseFrameParser()

    expect(parser.push('data: {"a":1}')).toEqual([])
    expect(parser.flush()).toEqual([{ data: '{"a":1}' }])
    // Flushing twice must not replay the frame.
    expect(parser.flush()).toEqual([])
  })
})
