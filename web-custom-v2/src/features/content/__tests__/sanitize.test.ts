// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { markdownToSanitizedHtml, sanitizeDocumentHtml } from '@/features/content/sanitize'

describe('sanitizeDocumentHtml', () => {
  it('keeps the formatting an operator would actually write', () => {
    const html = sanitizeDocumentHtml(
      '<h2>Terms</h2><p>Read the <a href="https://example.com/x">policy</a>.</p><ul><li>One</li></ul>',
    )

    expect(html).toContain('<h2>Terms</h2>')
    expect(html).toContain('href="https://example.com/x"')
    expect(html).toContain('<li>One</li>')
  })

  it('removes script elements and their content', () => {
    const html = sanitizeDocumentHtml('<p>ok</p><script>fetch("/api/user/self")</script>')

    expect(html).toContain('<p>ok</p>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('fetch(')
  })

  it('removes inline event handlers', () => {
    const html = sanitizeDocumentHtml('<img src="x" onerror="alert(1)"><p onclick="alert(2)">hi</p>')

    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('alert(')
  })

  it('removes javascript: urls', () => {
    const html = sanitizeDocumentHtml('<a href="javascript:alert(1)">click</a>')

    expect(html).not.toContain('javascript:')
  })

  it('drops the elements that could escape the document surface', () => {
    const html = sanitizeDocumentHtml(
      '<style>body{display:none}</style><iframe src="https://evil.example"></iframe>'
        + '<form action="/api/user/self"><input name="a"></form><object data="x"></object>'
        + '<base href="https://evil.example/"><link rel="stylesheet" href="x.css">',
    )

    for (const tag of ['<style', '<iframe', '<form', '<input', '<object', '<base', '<link']) {
      expect(html).not.toContain(tag)
    }
  })

  it('forces rel="noopener noreferrer" on links that open a new context', () => {
    const html = sanitizeDocumentHtml('<a href="https://example.com" target="_blank">out</a>')

    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('leaves same-tab links alone', () => {
    const html = sanitizeDocumentHtml('<a href="https://example.com" target="_self">in</a>')

    expect(html).not.toContain('noopener')
  })

  it('neutralises the blob the local server actually serves at /api/about', () => {
    // Copied verbatim from `curl http://127.0.0.1:3000/api/about` on the seeded instance.
    // It is one string carrying three separate attacks, so it is pinned as a whole.
    const html = sanitizeDocumentHtml(
      '<div><h1>About Acme AI</h1><p>Operated by the platform team.</p>'
        + '<p><a href="https://example.com" target="_blank">Docs</a></p>'
        + '<script>window.__PWNED = true</script>'
        + '<img src=x onerror="window.__PWNED2=true">'
        + '<style>body{background:red}</style></div>',
    )

    expect(html).toContain('<h1>About Acme AI</h1>')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('__PWNED')
    expect(html).not.toContain('onerror')
    // A document stylesheet is unscoped and would repaint the console chrome around it.
    expect(html).not.toContain('<style')
    expect(html).not.toContain('background:red')
  })
})

describe('markdownToSanitizedHtml', () => {
  it('renders GitHub-flavoured markdown', () => {
    const html = markdownToSanitizedHtml('# Title\n\n- one\n- two\n\n[link](https://example.com)')

    expect(html).toContain('<h1')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('href="https://example.com"')
  })

  it('sanitizes raw HTML embedded in markdown', () => {
    const html = markdownToSanitizedHtml('Hello\n\n<script>alert(1)</script>\n\n<b>bold</b>')

    expect(html).not.toContain('<script')
    expect(html).toContain('<b>bold</b>')
  })
})
