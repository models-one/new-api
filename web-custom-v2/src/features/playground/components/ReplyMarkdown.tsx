import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { renderModelMarkdown, replyProseClasses } from '@/features/playground/markdown'
import { cn } from '@/lib/utils'

type ReplyMarkdownProps = {
  content: string
  className?: string
}

/**
 * Renders a model reply as sanitized Markdown.
 *
 * `renderModelMarkdown` is the only place this feature produces HTML, and its policy
 * blocks raw HTML, images and every embed. See `markdown.ts` for why the content
 * pages' looser policy is not reused here.
 *
 * Copy buttons are attached to code blocks after render rather than being part of the
 * markup, because the markup comes out of DOMPurify as a string and adding a button to
 * the allowlist would mean letting the model emit buttons of its own.
 */
export function ReplyMarkdown(props: ReplyMarkdownProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const html = useMemo(() => renderModelMarkdown(props.content), [props.content])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const cleanups: (() => void)[] = []

    for (const pre of container.querySelectorAll('pre')) {
      if (pre.querySelector('[data-copy-code]')) continue

      const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
      if (code.trim() === '') continue

      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.copyCode = 'true'
      button.textContent = t('Copy')
      button.setAttribute('aria-label', t('Copy code block'))
      button.title = t('Copy code block')
      button.className =
        'absolute right-2 top-2 rounded-[3px] border border-border bg-surface-high px-2 py-1 text-[11px] font-semibold text-muted transition-colors hover:text-foreground'

      const onClick = () => {
        void navigator.clipboard
          ?.writeText(code)
          .then(() => {
            button.textContent = t('Copied')
            setTimeout(() => {
              button.textContent = t('Copy')
            }, 1500)
          })
          .catch(() => {
            button.textContent = t('Copy failed')
          })
      }

      button.addEventListener('click', onClick)
      pre.classList.add('relative')
      pre.append(button)
      cleanups.push(() => {
        button.removeEventListener('click', onClick)
        button.remove()
      })
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [html, t])

  if (html === '') return null

  return (
    <div
      className={cn(replyProseClasses, 'min-w-0 break-words', props.className)}
      // Sanitized by `renderModelMarkdown`: no raw HTML, no images, no embeds,
      // anchors reduced to href and forced to rel="noopener noreferrer nofollow".
      dangerouslySetInnerHTML={{ __html: html }}
      ref={containerRef}
    />
  )
}
