import DOMPurify, { type Config } from 'dompurify'
import { Marked } from 'marked'

/**
 * Everything rendered by the content pages is operator-supplied HTML pulled from the
 * database, so it is hostile input as far as this console is concerned: a compromised or
 * careless administrator account must not be able to run script in the console's origin
 * (where the access token lives).
 *
 * The policy below is DOMPurify's `html` profile — which already drops every `on*` handler,
 * `javascript:`/`data:` URLs and unknown elements, and excludes SVG and MathML — narrowed
 * further:
 *
 *   FORBIDDEN elements   base, button, embed, form, iframe, input, link, meta, object,
 *                        script, select, style, textarea
 *                        (`style` is dropped because a document-supplied stylesheet is not
 *                        scoped and would repaint the surrounding console chrome; `iframe`
 *                        is dropped because only the top-level "the whole document IS a
 *                        URL" mode is allowed to frame anything, and that iframe is
 *                        sandboxed by `DocumentBody`)
 *   FORBIDDEN attributes formaction, ping, srcdoc
 *   EXTRA elements       audio, picture, source, track, video
 *   EXTRA attributes     allowfullscreen, controls, kind, label, loading, loop, muted,
 *                        playsinline, poster, preload, referrerpolicy, rel, srclang, target
 *
 * `hardenLinks` then forces `rel="noopener noreferrer"` on every anchor that opens a new
 * browsing context, so a linked page can never reach back through `window.opener`.
 */

const extraTags = ['audio', 'picture', 'source', 'track', 'video']

const extraAttributes = [
  'allowfullscreen',
  'controls',
  'kind',
  'label',
  'loading',
  'loop',
  'muted',
  'playsinline',
  'poster',
  'preload',
  'referrerpolicy',
  'rel',
  'srclang',
  'target',
]

const forbiddenTags = [
  'base',
  'button',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'meta',
  'object',
  'script',
  'select',
  'style',
  'textarea',
]

const forbiddenAttributes = ['formaction', 'ping', 'srcdoc']

const sanitizeConfig = {
  ADD_ATTR: extraAttributes,
  ADD_TAGS: extraTags,
  FORBID_ATTR: forbiddenAttributes,
  FORBID_TAGS: forbiddenTags,
  FORCE_BODY: true,
  USE_PROFILES: { html: true },
} satisfies Config

const markdown = new Marked({ async: false, breaks: false, gfm: true })

function hardenLinks(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html

  for (const link of template.content.querySelectorAll('a[target]')) {
    if (link.getAttribute('target') === '_self') continue
    const rel = new Set(link.getAttribute('rel')?.split(/\s+/).filter(Boolean) ?? [])
    rel.add('noopener')
    rel.add('noreferrer')
    link.setAttribute('rel', [...rel].join(' '))
  }

  return template.innerHTML
}

/**
 * The ONLY string this feature ever hands to `dangerouslySetInnerHTML`.
 * Returns an empty string when there is no DOM to sanitize against, so unsanitized markup
 * can never leak out through a non-browser render.
 */
export function sanitizeDocumentHtml(html: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return ''
  return hardenLinks(DOMPurify.sanitize(html, sanitizeConfig))
}

/** Renders GFM Markdown, then sanitizes it with exactly the same policy. */
export function markdownToSanitizedHtml(source: string): string {
  const rendered = markdown.parse(source)
  return sanitizeDocumentHtml(typeof rendered === 'string' ? rendered : '')
}
