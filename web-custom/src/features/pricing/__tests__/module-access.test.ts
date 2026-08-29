import { describe, expect, it } from 'vitest'

import { DEFAULT_PRICING_ACCESS, pricingModuleAccess } from '@/features/pricing/module-access'
import type { ServerStatus } from '@/lib/api/status'

function status(headerNavModules: unknown): ServerStatus {
  return { HeaderNavModules: headerNavModules } as unknown as ServerStatus
}

describe('pricingModuleAccess', () => {
  it('treats an unset option as enabled and public, exactly like the Go fallback', () => {
    // The seeded instance really does answer `HeaderNavModules: ''`.
    expect(pricingModuleAccess(status(''))).toEqual(DEFAULT_PRICING_ACCESS)
    expect(pricingModuleAccess(status('   '))).toEqual(DEFAULT_PRICING_ACCESS)
    expect(pricingModuleAccess(undefined)).toEqual(DEFAULT_PRICING_ACCESS)
  })

  it('falls back rather than throwing when the option is not valid JSON', () => {
    expect(pricingModuleAccess(status('{not json'))).toEqual(DEFAULT_PRICING_ACCESS)
    expect(pricingModuleAccess(status('"a string"'))).toEqual(DEFAULT_PRICING_ACCESS)
    expect(pricingModuleAccess(status(42))).toEqual(DEFAULT_PRICING_ACCESS)
  })

  it('keeps the defaults when the object says nothing about pricing', () => {
    expect(pricingModuleAccess(status(JSON.stringify({ rankings: false })))).toEqual(
      DEFAULT_PRICING_ACCESS,
    )
  })

  it('reads a bare boolean-ish entry as the enabled flag only', () => {
    expect(pricingModuleAccess(status(JSON.stringify({ pricing: false })))).toEqual({
      enabled: false,
      requireAuth: false,
    })
    expect(pricingModuleAccess(status(JSON.stringify({ pricing: 'false' })))).toEqual({
      enabled: false,
      requireAuth: false,
    })
    expect(pricingModuleAccess(status(JSON.stringify({ pricing: 0 })))).toEqual({
      enabled: false,
      requireAuth: false,
    })
    expect(pricingModuleAccess(status(JSON.stringify({ pricing: 1 })))).toEqual({
      enabled: true,
      requireAuth: false,
    })
    // An unrecognised string keeps the fallback, the way parseHeaderNavBool does.
    expect(pricingModuleAccess(status(JSON.stringify({ pricing: 'maybe' })))).toEqual(
      DEFAULT_PRICING_ACCESS,
    )
  })

  it('reads both flags out of the object form', () => {
    expect(
      pricingModuleAccess(status(JSON.stringify({ pricing: { enabled: true, requireAuth: true } }))),
    ).toEqual({ enabled: true, requireAuth: true })
    expect(
      pricingModuleAccess(status(JSON.stringify({ pricing: { requireAuth: '1' } }))),
    ).toEqual({ enabled: true, requireAuth: true })
    expect(pricingModuleAccess(status(JSON.stringify({ pricing: { enabled: false } })))).toEqual({
      enabled: false,
      requireAuth: false,
    })
  })

  it('accepts an already-parsed object, since /api/status may republish it either way', () => {
    expect(pricingModuleAccess(status({ pricing: { enabled: false } }))).toEqual({
      enabled: false,
      requireAuth: false,
    })
  })
})
