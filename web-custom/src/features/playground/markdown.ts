import DOMPurify, { type Config } from 'dompurify'
import { Marked } from 'marked'

/**
 * Markdown rendering for model output.
 *
 * Model output is the most hostile input this console handles: its text comes from a
 * remote upstream, it is attacker-influenceable through the user's own prompt (a page
 * the model was asked to summarise can carry an injection), and it lands in the origin
 * that holds the console access token.
 *
 * `features/content/sanitize.ts` exists and uses the same two libraries, but its policy
 * is tuned for operator-authored HTML: it permits `audio`/`video`/`source`/`track`,
 * `target`, `referrerpolicy` and remote `img`. That is right for a page an admin wrote
 * and wrong for text a model emitted, so this module keeps a deliberately narrower
 * policy of its own rather than widening a shared one.
 *
 * Narrower on three axes:
 *   - NO raw HTML survives at all. `marked` is configured to escape it, so the model can
 *     only produce elements through Markdown syntax. Anything HTML-shaped renders as
 *     visible text, which is what a user reading model output actually wants.
 *   - NO embedded media or images. A remote `img` in a reply is a tracking pixel that
 *     reports back when the user reads the answer, so `img`, `video`, `audio`, `iframe`
 *     and friends are all dropped.
 *   - Links keep only `href`, and every one is forced to `rel="noopener noreferrer
 *     nofollow"` with `target="_blank"`, so a link the model invented cannot reach back
 *     through `window.opener` or navigate the console out from under the user.
 *
 * DOMPurify's `html` profile already strips `on*` handlers, `javascript:` and `data:`
 * URLs, unknown elements, SVG and MathML; the allowlist below narrows it further.
 */

const allowedTags = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
]

/**
 * A strict allowlist, and deliberately NO `USE_PROFILES`.
 *
 * DOMPurify UNIONS `USE_PROFILES` with `ALLOWED_TAGS` rather than intersecting them, so
 * naming the `html` profile here would silently add every tag in it — `img` included —
 * straight back to the list. `ALLOWED_TAGS` alone is the only way to get a real
 * allowlist. (Caught by `markdown.test.ts`, which asserts a tracking pixel is dropped.)
 */
const sanitizeConfig = {
  ALLOWED_ATTR: ['href'],
  ALLOWED_TAGS: allowedTags,
  FORCE_BODY: true,
} satisfies Config

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * `async: false` keeps `parse` synchronous so it can be called during render.
 * `breaks: true` matches chat convention, where a single newline is a line break.
 * `gfm: true` gives fenced code, tables and strikethrough.
 *
 * The `html` renderer override escapes raw HTML instead of emitting it. `marked` passes
 * HTML through untouched by default, and while DOMPurify would then strip a disallowed
 * tag, it strips the TAG and keeps the inner text — so a model explaining `<div>` would
 * have its example silently eaten. Escaping shows what the model actually wrote.
 */
const markdown = new Marked({
  async: false,
  breaks: true,
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
  },
})

function hardenLinks(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html

  for (const link of template.content.querySelectorAll('a')) {
    link.setAttribute('rel', 'noopener noreferrer nofollow')
    link.setAttribute('target', '_blank')
  }

  return template.innerHTML
}

/**
 * The ONLY string this feature hands to `dangerouslySetInnerHTML`.
 *
 * Returns '' when there is no DOM to sanitize against, so unsanitized markup can never
 * escape through a non-browser render path.
 */
export function renderModelMarkdown(source: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return ''
  if (source === '') return ''

  const rendered = markdown.parse(source)
  if (typeof rendered !== 'string') return ''

  return hardenLinks(DOMPurify.sanitize(rendered, sanitizeConfig))
}

/**
 * Typography for the sanitized reply, as descendant variants scoped to the one element
 * holding injected HTML. `src/styles/index.css` is shared and this console has no
 * typography plugin, so the element styling lives here.
 *
 * Code blocks are a plain `.mono` surface: no syntax highlighter is loaded (see the
 * report's kitGaps). `CodeBlockActions` adds per-block copy buttons at runtime.
 */
export const replyProseClasses = [
  'text-sm leading-6 text-foreground',
  '[&_p]:my-3 first:[&_p]:mt-0 last:[&_p]:mb-0',
  '[&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-bold first:[&_h1]:mt-0',
  '[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-bold first:[&_h2]:mt-0',
  '[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-bold first:[&_h3]:mt-0',
  '[&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:text-sm [&_h4]:font-bold',
  '[&_h5]:mt-3 [&_h5]:text-sm [&_h5]:font-bold',
  '[&_h6]:eyebrow [&_h6]:mt-3',
  '[&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary-strong',
  '[&_strong]:font-bold',
  '[&_em]:italic',
  '[&_del]:line-through [&_del]:text-muted',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6',
  '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_li]:my-1 [&_li]:pl-1',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-4 [&_blockquote]:text-muted',
  '[&_code]:mono [&_code]:rounded-[3px] [&_code]:bg-surface-high [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-[4px] [&_pre]:border [&_pre]:border-border [&_pre]:bg-canvas [&_pre]:p-4',
  '[&_pre_code]:mono [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs [&_pre_code]:leading-6',
  '[&_hr]:my-5 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border',
  '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-xs',
  '[&_th]:border [&_th]:border-border [&_th]:bg-surface-high [&_th]:px-3 [&_th]:py-2 [&_th]:font-bold',
  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top',
].join(' ')
