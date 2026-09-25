import { describe, expect, it } from 'vitest'

import {
  detectDocumentMode,
  isHttpUrl,
  isLikelyHtml,
  isLikelyMarkdown,
} from '@/features/content/content-format'

describe('isHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isHttpUrl('http://example.com')).toBe(true)
    expect(isHttpUrl('https://example.com/legal/terms?v=2')).toBe(true)
  })

  it('rejects other schemes so nothing but a web page can reach the iframe', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isHttpUrl('ftp://example.com/terms.txt')).toBe(false)
    expect(isHttpUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects a document that merely starts with a link', () => {
    // The URL parser strips newlines, so without the whitespace guard this whole
    // document would parse as one valid URL and be framed instead of rendered.
    expect(isHttpUrl('https://example.com/\n\nOur terms are as follows.')).toBe(false)
    expect(isHttpUrl('https://example.com terms')).toBe(false)
  })
})

describe('isLikelyHtml', () => {
  it('recognises full documents and fragments', () => {
    expect(isLikelyHtml('<!doctype html><html><body>hi</body></html>')).toBe(true)
    expect(isLikelyHtml('<div><p>Terms</p></div>')).toBe(true)
  })

  it('does not fire on prose', () => {
    expect(isLikelyHtml('We do not sell your data. 5 < 6 and 7 > 6.')).toBe(false)
  })
})

describe('isLikelyMarkdown', () => {
  it.each([
    ['# Heading', 'ATX heading'],
    ['- one\n- two', 'bullet list'],
    ['1. one\n2. two', 'ordered list'],
    ['> quoted', 'block quote'],
    ['```\ncode\n```', 'fenced code'],
    ['See [our policy](https://example.com).', 'link'],
    ['This is **important**.', 'strong emphasis'],
    ['Run `npm install` first.', 'inline code'],
    ['| a | b |\n| - | - |', 'table'],
    ['Title\n=====', 'setext heading'],
  ])('detects %s (%s)', (source) => {
    expect(isLikelyMarkdown(source)).toBe(true)
  })

  it('leaves an unformatted notice as plain text', () => {
    expect(isLikelyMarkdown('We are performing maintenance tonight.\nService resumes at 02:00.')).toBe(
      false,
    )
  })
})

describe('detectDocumentMode', () => {
  it('follows the legacy precedence: url, then html, then markdown, then text', () => {
    expect(detectDocumentMode('https://example.com/terms')).toBe('url')
    expect(detectDocumentMode('<section><h1># not a heading</h1></section>')).toBe('html')
    expect(detectDocumentMode('# Terms\n\nBe nice.')).toBe('markdown')
    expect(detectDocumentMode('Terms: be nice.')).toBe('text')
  })
})
