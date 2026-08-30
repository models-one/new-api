/**
 * Incremental Server-Sent Events parsing for the relay stream.
 *
 * The legacy console used the `sse.js` package. This does not, for one reason that
 * matters: `sse.js` wraps XMLHttpRequest and exposes no way to abort the underlying
 * request, so its "stop" only stopped painting while the upstream kept generating (and
 * kept billing). `fetch` + `AbortController` really cancels the socket.
 *
 * Frames verified against `POST /pg/chat/completions` on the dev server:
 *
 *   data: {"id":"...","choices":[{"index":0,"delta":{"reasoning_content":"..."}}]}
 *   data: {"id":"...","choices":[{"index":0,"delta":{"content":"# Hi\n\n"}}]}
 *   data: {"id":"...","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{...}}
 *   data: [DONE]
 *
 * The relay adds `stream_options.include_usage` on the way upstream, so the final
 * chunk carries `usage` even though the client never asks for it.
 */

export const STREAM_DONE = '[DONE]'

export type SseFrame = {
  /** Joined `data:` lines. Multiple data lines in one frame are newline-joined per spec. */
  data: string
  /** The `event:` name when present. The relay does not send one, but comments are skipped. */
  event?: string
}

/**
 * Splits a byte stream into SSE frames across chunk boundaries.
 *
 * A frame ends at a blank line. Because a network chunk can split anywhere — including
 * mid-frame, mid-line or mid-UTF-8-sequence — the tail is buffered until it completes.
 * Decoding is the caller's job (use a streaming TextDecoder).
 */
export class SseFrameParser {
  private buffer = ''

  /** Feeds decoded text and returns whatever complete frames it now holds. */
  push(text: string): SseFrame[] {
    // Normalise CRLF and lone CR so the blank-line split below is the only rule needed.
    this.buffer += text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    const frames: SseFrame[] = []
    let boundary = this.buffer.indexOf('\n\n')

    while (boundary !== -1) {
      const raw = this.buffer.slice(0, boundary)
      this.buffer = this.buffer.slice(boundary + 2)
      const frame = parseFrame(raw)
      if (frame) frames.push(frame)
      boundary = this.buffer.indexOf('\n\n')
    }

    return frames
  }

  /** Flushes a trailing frame that the server left without a final blank line. */
  flush(): SseFrame[] {
    const raw = this.buffer
    this.buffer = ''
    const frame = parseFrame(raw)
    return frame ? [frame] : []
  }
}

function parseFrame(raw: string): SseFrame | null {
  const dataLines: string[] = []
  let event: string | undefined

  for (const line of raw.split('\n')) {
    // A leading colon marks a comment/heartbeat; blank lines inside a frame are noise.
    if (line === '' || line.startsWith(':')) continue

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    // Exactly one optional leading space after the colon is stripped, per the SSE spec.
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'data') dataLines.push(value)
    else if (field === 'event') event = value
  }

  if (dataLines.length === 0) return null
  return event === undefined ? { data: dataLines.join('\n') } : { data: dataLines.join('\n'), event }
}

export function isDoneFrame(frame: SseFrame): boolean {
  return frame.data.trim() === STREAM_DONE
}
