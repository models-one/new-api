/**
 * Detection for the operator-supplied blobs behind `/api/about`, `/api/privacy-policy`,
 * `/api/user-agreement` and `/api/home_page_content`.
 *
 * All four endpoints return one opaque string (controller/misc.go reads it straight out of
 * `common.OptionMap` / the `legal` setting), so the console has to work out how to render it.
 * The order below is the legacy one (`web/src/features/legal/legal-document.tsx` plus
 * `web/src/lib/content-format.ts`): URL first, then HTML, then Markdown, then plain text.
 */

export type DocumentMode = 'url' | 'html' | 'markdown' | 'text'

/**
 * Legacy `isHttpUrl`, with one deliberate hardening: the value must also contain no
 * whitespace. The WHATWG URL parser strips tabs and newlines before parsing, so a Markdown
 * document whose first line happens to be a bare link (`https://example.com/\nsome text`)
 * parses as a valid URL and would otherwise be handed to an iframe instead of rendered.
 */
export function isHttpUrl(value: string): boolean {
  if (value === '' || /\s/.test(value)) return false

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Ported verbatim from the legacy `isLikelyHtml`. */
export function isLikelyHtml(value: string): boolean {
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<style[\s>]|<script[\s>]|<\/?[a-z][\s\S]*>/i.test(
    value,
  )
}

const markdownSignals = [
  /^\s{0,3}#{1,6}\s/m, // ATX heading
  /^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s+\S/m, // bullet or ordered list
  /^\s{0,3}>\s?\S/m, // block quote
  /^\s{0,3}(?:```|~~~)/m, // fenced code block
  /^\s{0,3}(?:\*\s*){3,}$|^\s{0,3}(?:-\s*){3,}$|^\s{0,3}(?:_\s*){3,}$/m, // thematic break
  /^\s{0,3}\|.*\|\s*$/m, // table row
  /^[^\n]+\n\s{0,3}(?:=+|-+)\s*$/m, // setext heading
  /!?\[[^\]\n]*\]\([^)\s]+\)/, // link or image
  /(\*\*|__)(?!\s)[\s\S]+?\1/, // strong emphasis
  /`[^`\n]+`/, // inline code
]

/**
 * Distinguishes Markdown from a plain-text notice. Plain text is rendered escaped and
 * verbatim, so guessing wrong in that direction only costs formatting, never safety.
 */
export function isLikelyMarkdown(value: string): boolean {
  return markdownSignals.some((pattern) => pattern.test(value))
}

/** `content` must already be trimmed and non-empty. */
export function detectDocumentMode(content: string): DocumentMode {
  if (isHttpUrl(content)) return 'url'
  if (isLikelyHtml(content)) return 'html'
  if (isLikelyMarkdown(content)) return 'markdown'
  return 'text'
}
