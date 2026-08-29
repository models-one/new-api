import { describe, expect, it } from 'vitest'

import {
  errorSlugs,
  errorVariants,
  getHttpStatus,
  isErrorVariant,
  resolveErrorSlug,
} from '@/features/errors/error-catalog'

describe('resolveErrorSlug', () => {
  it.each([
    ['unauthorized', '401'],
    ['forbidden', '403'],
    ['not-found', '404'],
    ['internal-server-error', '500'],
    ['maintenance-error', '503'],
  ])('maps the %s slug to the %s surface', (slug, variant) => {
    expect(resolveErrorSlug(slug)).toBe(variant)
  })

  it('exposes exactly the five legacy slugs', () => {
    expect(errorSlugs).toHaveLength(5)
    expect(new Set(errorSlugs.map(resolveErrorSlug))).toEqual(new Set(errorVariants))
  })

  it.each(['', 'nope', '500', 'Unauthorized', 'not_found', 'constructor', '__proto__'])(
    'falls back to the 404 surface for %j',
    (slug) => {
      expect(resolveErrorSlug(slug)).toBe('404')
    },
  )
})

describe('isErrorVariant', () => {
  it('accepts every catalogued numeral', () => {
    expect(errorVariants.every(isErrorVariant)).toBe(true)
  })

  it('rejects statuses the console has no surface for', () => {
    expect(isErrorVariant('429')).toBe(false)
    expect(isErrorVariant('200')).toBe(false)
  })
})

describe('getHttpStatus', () => {
  it('reads the status off a rejected request', () => {
    expect(getHttpStatus({ response: { status: 429 } })).toBe(429)
  })

  it.each([
    ['a plain Error', new Error('boom')],
    ['null', null],
    ['a string', 'boom'],
    ['an error with no response', { message: 'boom' }],
    ['a null response', { response: null }],
    ['a response with no status', { response: { data: {} } }],
    ['a non-numeric status', { response: { status: '429' } }],
  ])('returns undefined for %s', (_label, error) => {
    expect(getHttpStatus(error)).toBeUndefined()
  })

  it('reads the status through an Error subclass that carries a response', () => {
    class RequestError extends Error {
      response = { status: 503 }
    }
    expect(getHttpStatus(new RequestError('boom'))).toBe(503)
  })
})
