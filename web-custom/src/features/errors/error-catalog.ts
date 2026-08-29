/**
 * The five error surfaces this console can address, keyed by the HTTP status they stand
 * for. The legacy console had one component per status
 * (`web/src/features/errors/*.tsx`); here they are one presentation driven by a variant.
 */
export const errorVariants = ['401', '403', '404', '500', '503'] as const

export type ErrorVariant = (typeof errorVariants)[number]

/**
 * Slug -> variant map for `/errors/$error`, ported verbatim from the legacy viewer at
 * `web/src/routes/_authenticated/errors/$error.tsx`. Only these five slugs are
 * addressable; the legacy `errorMap[error] || NotFoundError` fallback means anything
 * else — including the bare numerals — renders the 404 surface.
 */
const slugToVariant = new Map<string, ErrorVariant>([
  ['unauthorized', '401'],
  ['forbidden', '403'],
  ['not-found', '404'],
  ['internal-server-error', '500'],
  ['maintenance-error', '503'],
])

export const errorSlugs = [...slugToVariant.keys()]

/**
 * A `Map` rather than an object literal on purpose: the slug arrives straight from the
 * URL, and a plain-object lookup would resolve `__proto__` or `constructor` to inherited
 * members instead of falling through to the 404 surface.
 */
export function resolveErrorSlug(slug: string): ErrorVariant {
  return slugToVariant.get(slug) ?? '404'
}

export function isErrorVariant(value: string): value is ErrorVariant {
  return (errorVariants as readonly string[]).includes(value)
}

/**
 * Digs the HTTP status out of a thrown request error (`error.response.status`), ported
 * from the legacy general-error page. Axios rejections — everything `src/lib/api` throws
 * on a non-2xx — carry that shape; anything else yields `undefined` so the caller falls
 * back to a plain 500.
 */
export function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) return undefined

  const { response } = error
  if (typeof response !== 'object' || response === null || !('status' in response)) return undefined

  const { status } = response
  return typeof status === 'number' ? status : undefined
}
