import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'

/**
 * The admin-configurable public documents.
 *
 * Verified against the running backend (controller/misc.go):
 *   GET /api/about            -> {"success":true,"message":"","data":"<blob>"}
 *   GET /api/privacy-policy   -> same shape, from the `legal.privacy_policy` setting
 *   GET /api/user-agreement   -> same shape, from the `legal.user_agreement` setting
 *   GET /api/home_page_content-> same shape, from the `HomePageContent` option
 *
 * An UNCONFIGURED instance answers `success: true` with `data: ""` — the endpoints never
 * fail for a missing document, so "empty" is a normal state and not an error. `message` is
 * always `""` on these routes, which is why the empty states below are written by the
 * console rather than echoed from the server.
 */

export type ContentDocumentKey = 'about' | 'privacy-policy' | 'user-agreement'

const documentEndpoints: Record<ContentDocumentKey, string> = {
  about: '/api/about',
  'privacy-policy': '/api/privacy-policy',
  'user-agreement': '/api/user-agreement',
}

/**
 * These are public, unauthenticated pages; the shared axios interceptor would toast on
 * failure, so both handlers are opted out and the pages render their own inline recovery.
 */
const publicRequestConfig = { skipBusinessError: true, skipErrorHandler: true } as const

async function fetchDocument(url: string): Promise<string> {
  return (await getJson<string | null>(url, publicRequestConfig)) ?? ''
}

export function contentDocumentQuery(key: ContentDocumentKey) {
  return queryOptions({
    queryKey: ['content-document', key],
    queryFn: () => fetchDocument(documentEndpoints[key]),
    staleTime: 10 * 60 * 1000,
  })
}

export function homePageContentQuery() {
  return queryOptions({
    queryKey: ['home-page-content'],
    queryFn: () => fetchDocument('/api/home_page_content'),
    staleTime: 10 * 60 * 1000,
  })
}
