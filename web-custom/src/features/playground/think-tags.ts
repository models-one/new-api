/**
 * Splits `<think>...</think>` blocks out of a reply.
 *
 * Some upstreams stream chain-of-thought inline in `content` rather than in the separate
 * `delta.reasoning_content` field, so a reply can carry reasoning either way. Ported
 * from the legacy `message-reasoning-utils.ts`, including its handling of a tag that is
 * still open because the stream has not reached the closing tag yet.
 */

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

export type ParsedThinkTags = {
  /** What the user should read. */
  visible: string
  /** What belongs behind the reasoning disclosure. */
  reasoning: string
  /** True while a `<think>` block is still streaming and has no closing tag yet. */
  streamingThink: boolean
}

export function parseThinkTags(content: string): ParsedThinkTags {
  if (!content.includes(OPEN_TAG)) {
    return { reasoning: '', streamingThink: false, visible: content }
  }

  const visibleParts: string[] = []
  const reasoningParts: string[] = []
  let cursor = 0
  let streamingThink = false

  for (;;) {
    const open = content.indexOf(OPEN_TAG, cursor)

    if (open === -1) {
      if (cursor < content.length) visibleParts.push(content.slice(cursor))
      break
    }

    if (open > cursor) visibleParts.push(content.slice(cursor, open))

    const close = content.indexOf(CLOSE_TAG, open + OPEN_TAG.length)

    if (close === -1) {
      // Still streaming: everything after the open tag is reasoning so far.
      reasoningParts.push(content.slice(open + OPEN_TAG.length))
      streamingThink = true
      break
    }

    reasoningParts.push(content.slice(open + OPEN_TAG.length, close))
    cursor = close + CLOSE_TAG.length
  }

  return {
    reasoning: reasoningParts.join('\n\n').trim(),
    streamingThink,
    visible: visibleParts.join('').trim(),
  }
}

/**
 * Merges the two places reasoning can arrive from: the dedicated
 * `delta.reasoning_content` field and inline `<think>` tags in the content.
 */
export function splitReply(
  content: string,
  reasoningField: string,
): { visible: string; reasoning: string; streamingThink: boolean } {
  const parsed = parseThinkTags(content)
  const combined = [reasoningField, parsed.reasoning].filter((part) => part !== '').join('\n\n')

  return { reasoning: combined, streamingThink: parsed.streamingThink, visible: parsed.visible }
}
