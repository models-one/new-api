// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { renderModelMarkdown } from '@/features/playground/markdown'
import { parseThinkTags, splitReply } from '@/features/playground/think-tags'

/**
 * Model output is untrusted: it comes from a remote upstream and is influenceable by
 * anything the user pasted into the prompt. These assert the sanitizer's actual policy,
 * which is deliberately stricter than the content pages' operator-HTML policy.
 *
 * jsdom rather than happy-dom because DOMPurify needs a full DOM implementation.
 */

/** Parses sanitized output so assertions can inspect real nodes, not substrings. */
function parse(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}
describe('renderModelMarkdown', () => {
  it('renders ordinary markdown', () => {
    const html = renderModelMarkdown('# Title\n\nSome **bold** text.')

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('never produces an executable script element', () => {
    // The literal text may well survive — it is what the model wrote, and the user
    // should see it. What must not survive is a parsed <script> node.
    const parsed = parse(renderModelMarkdown('Hello <script>alert(document.cookie)</script>'))

    expect(parsed.querySelector('script')).toBeNull()
    expect(parsed.textContent).toContain('alert(document.cookie)')
  })

  it('escapes raw HTML so it is shown, not mounted', () => {
    const html = renderModelMarkdown('<div onclick="steal()">click</div>')
    const parsed = parse(html)

    // No element is created at all, so there is no handler to fire...
    expect(parsed.querySelector('div')).toBeNull()
    // ...and the source is visible as text, so a model explaining HTML still reads right.
    expect(html).toContain('&lt;div')
    expect(parsed.textContent).toBe('<div onclick="steal()">click</div>')
  })

  it('leaves no event-handler attribute anywhere in the output', () => {
    const parsed = parse(
      renderModelMarkdown('[x](https://example.com)\n\n<p onmouseover="steal()">hi</p>'),
    )

    for (const element of parsed.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.name.startsWith('on')).toBe(false)
      }
    }
  })

  it('drops an image, which would otherwise be a read receipt for the reply', () => {
    const html = renderModelMarkdown('![tracker](https://evil.example/pixel.png)')

    expect(html).not.toContain('<img')
    expect(html).not.toContain('evil.example')
  })

  it('removes a javascript: link target', () => {
    const html = renderModelMarkdown('[click me](javascript:alert(1))')

    expect(html).not.toContain('javascript:')
  })

  it('hardens every surviving link against window.opener', () => {
    const html = renderModelMarkdown('[docs](https://example.com)')

    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('target="_blank"')
  })

  it('keeps fenced code as a plain pre/code block', () => {
    const html = renderModelMarkdown('```js\nconst a = 1\n```')

    expect(html).toContain('<pre>')
    expect(html).toContain('const a = 1')
  })

  it('renders an empty string for empty input', () => {
    expect(renderModelMarkdown('')).toBe('')
  })

  it('drops an iframe embed', () => {
    const html = renderModelMarkdown('<iframe src="https://evil.example"></iframe>')

    expect(html).not.toContain('<iframe')
  })
})

describe('parseThinkTags', () => {
  it('leaves content without think tags untouched', () => {
    expect(parseThinkTags('just an answer')).toEqual({
      reasoning: '',
      streamingThink: false,
      visible: 'just an answer',
    })
  })

  it('splits a closed think block out of the visible answer', () => {
    const parsed = parseThinkTags('<think>weighing options</think>The answer is 4.')

    expect(parsed.visible).toBe('The answer is 4.')
    expect(parsed.reasoning).toBe('weighing options')
    expect(parsed.streamingThink).toBe(false)
  })

  it('treats an unclosed tag as reasoning still streaming', () => {
    const parsed = parseThinkTags('<think>still working on it')

    expect(parsed.reasoning).toBe('still working on it')
    expect(parsed.visible).toBe('')
    expect(parsed.streamingThink).toBe(true)
  })

  it('handles several think blocks and the prose between them', () => {
    const parsed = parseThinkTags('a<think>one</think>b<think>two</think>c')

    expect(parsed.visible).toBe('abc')
    expect(parsed.reasoning).toBe('one\n\ntwo')
  })
})

describe('splitReply', () => {
  it('merges the reasoning_content field with inline think tags', () => {
    const result = splitReply('<think>inline</think>answer', 'from the delta field')

    expect(result.reasoning).toBe('from the delta field\n\ninline')
    expect(result.visible).toBe('answer')
  })

  it('uses the delta field alone when there are no think tags', () => {
    expect(splitReply('answer', 'delta reasoning')).toEqual({
      reasoning: 'delta reasoning',
      streamingThink: false,
      visible: 'answer',
    })
  })
})
