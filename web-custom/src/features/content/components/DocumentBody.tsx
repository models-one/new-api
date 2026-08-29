import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link'
import { useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { documentProseClasses } from '@/features/content/components/prose'
import { detectDocumentMode, type DocumentMode } from '@/features/content/content-format'
import { markdownToSanitizedHtml, sanitizeDocumentHtml } from '@/features/content/sanitize'
import { cn } from '@/lib/utils'

type DocumentBodyProps = {
  /** Trimmed, non-empty document blob straight from the backend. */
  content: string
  /** Used as the iframe's accessible name in URL mode. */
  title: string
  className?: string
  /** Fills the viewport instead of sitting in a page column (custom home page). */
  fullBleed?: boolean
  /**
   * Only the custom HOME page sets this, matching the legacy dashboard. An operator who
   * replaces the home page with a whole framed site needs its `target="_top"` menu links to
   * work, which the default sandbox blocks. The token permits user-activated top-level
   * navigation ONLY; it grants no same-origin access. The legal and about documents do not
   * get it — a terms page has no business navigating the console away.
   */
  allowTopNavigation?: boolean
}

/** Base sandbox for every framed document: no `allow-same-origin`, so the frame stays opaque. */
const documentSandbox = 'allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'

/**
 * Renders one operator-supplied document in whichever of the four modes it turns out to be.
 * Nothing reaches the DOM as markup except through `sanitizeDocumentHtml`.
 */
export function DocumentBody(props: DocumentBodyProps) {
  const { i18n, t } = useTranslation()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const mode: DocumentMode = useMemo(() => detectDocumentMode(props.content), [props.content])

  /**
   * The legacy home page hands the framed document the active language so an
   * operator-supplied site can follow the console's locale. `'*'` is unavoidable — the frame
   * is cross-origin and its origin is whatever the operator configured — so nothing but the
   * language tag is ever sent.
   */
  const announceLanguage = useCallback(() => {
    try {
      frameRef.current?.contentWindow?.postMessage({ lang: i18n.language }, '*')
    } catch {
      // A frame mid-navigation can reject the call; the next load fires this again.
    }
  }, [i18n.language])

  const html = useMemo(() => {
    if (mode === 'html') return sanitizeDocumentHtml(props.content)
    if (mode === 'markdown') return markdownToSanitizedHtml(props.content)
    return ''
  }, [mode, props.content])

  if (mode === 'url') {
    return (
      <div className={cn('flex flex-col gap-3', props.className)}>
        {/*
          The document IS a link, so it is framed rather than fetched: the console must not
          proxy or inline a third-party page. `sandbox` without `allow-same-origin` puts the
          frame in an opaque origin, so it cannot touch this document, its storage or the
          access token; `referrerpolicy` keeps the console URL out of the target's logs.
        */}
        <iframe
          className={cn(
            'w-full border border-border bg-background',
            props.fullBleed
              ? 'h-[calc(100vh-4rem)] border-0'
              : 'h-[70vh] min-h-[420px] rounded-[var(--radius-panel)]',
          )}
          loading="lazy"
          onLoad={announceLanguage}
          ref={frameRef}
          referrerPolicy="no-referrer"
          sandbox={
            props.allowTopNavigation
              ? `${documentSandbox} allow-top-navigation-by-user-activation`
              : documentSandbox
          }
          src={props.content}
          title={props.title}
        />
        {props.fullBleed ? null : (
          <p className="text-xs leading-5 text-muted">
            {t('This document is hosted externally.')}{' '}
            <a
              className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-2 hover:text-primary-strong"
              href={props.content}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t('Open it in a new tab')}
              <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
            </a>
          </p>
        )}
      </div>
    )
  }

  if (mode === 'text') {
    return (
      <p className={cn('whitespace-pre-wrap text-sm leading-7 text-muted', props.className)}>
        {props.content}
      </p>
    )
  }

  return (
    <div
      className={cn(documentProseClasses, props.className)}
      // oxlint-disable-next-line no-danger -- sanitizeDocumentHtml/markdownToSanitizedHtml own this string; see sanitize.ts
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
