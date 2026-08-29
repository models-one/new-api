import LoaderCircleIcon from 'lucide-react/dist/esm/icons/loader-circle'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { homePageContentQuery } from '@/features/content/api'
import { DocumentBody } from '@/features/content/components/DocumentBody'
import { PublicPageFrame } from '@/features/content/components/PublicPageFrame'
import { detectDocumentMode } from '@/features/content/content-format'
import { LandingPage } from '@/features/landing/LandingPage'

/**
 * Same key the legacy dashboard uses (`web/src/features/home/hooks/use-home-page-content.ts`),
 * so a visitor who has already loaded either console paints the configured page instantly
 * instead of waiting on `/api/home_page_content`.
 */
const STORAGE_KEY = 'home_page_content'

function readCachedContent(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private mode, disabled storage — the query result is still authoritative.
    return null
  }
}

function writeCachedContent(content: string): void {
  try {
    if (content.trim() === '') window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, content)
  } catch {
    // Nothing to do: the cache is an optimisation, not a source of truth.
  }
}

/**
 * The public home page.
 *
 * `GET /api/home_page_content` holds an operator-supplied blob (controller/misc.go reads
 * the `HomePageContent` option). When it is set it REPLACES the marketing landing page,
 * in whichever of the four content modes it turns out to be. An unconfigured instance
 * answers `data: ""`, which is the normal case, and the Models.one landing page renders.
 */
export function HomePage() {
  const { t } = useTranslation()
  const { data, isPending } = useQuery(homePageContentQuery())
  // Read once, before first paint, so a configured instance does not flash the marketing page.
  const [cachedContent] = useState(readCachedContent)

  useEffect(() => {
    if (data === undefined) return
    writeCachedContent(data)
  }, [data])

  const resolved = data ?? cachedContent

  if (resolved === null || resolved === undefined) {
    // No answer yet and nothing cached. A request failure lands here too once it settles,
    // and `isPending` is false by then, so the marketing page renders as the fallback.
    if (isPending) {
      return (
        <div
          className="settings-canvas grid min-h-screen place-items-center px-6 text-center"
          role="status"
        >
          <div>
            <LoaderCircleIcon aria-hidden="true" className="mx-auto size-7 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted">{t('Loading')}</p>
          </div>
        </div>
      )
    }
    return <LandingPage />
  }

  const content = resolved.trim()
  if (content === '') return <LandingPage />

  const isFramed = detectDocumentMode(content) === 'url'

  return (
    <PublicPageFrame mainLabel={t('Home')} variant="full">
      <DocumentBody
        allowTopNavigation
        className={isFramed ? undefined : 'mx-auto max-w-[1100px] px-4 py-10 sm:px-6'}
        content={content}
        fullBleed={isFramed}
        title={t('Home')}
      />
    </PublicPageFrame>
  )
}
