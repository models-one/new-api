import { describe, expect, it } from 'vitest'

import { DEFAULT_RANKINGS_ACCESS, rankingsModuleAccess } from '@/features/rankings/module-access'
import type { ServerStatus } from '@/lib/api/status'

function status(headerNavModules: unknown): ServerStatus {
  return { HeaderNavModules: headerNavModules } as unknown as ServerStatus
}

/**
 * The cases below mirror `middleware/header_nav_test.go` one for one, so the console's idea of
 * the gate and the server's cannot drift apart.
 */
describe('rankingsModuleAccess', () => {
  it('treats an unset option as enabled and public, exactly like the Go fallback', () => {
    // The live seeded instance really does answer `HeaderNavModules: ''`.
    expect(rankingsModuleAccess(status(''))).toEqual(DEFAULT_RANKINGS_ACCESS)
    expect(rankingsModuleAccess(status('   '))).toEqual(DEFAULT_RANKINGS_ACCESS)
    expect(rankingsModuleAccess(undefined)).toEqual(DEFAULT_RANKINGS_ACCESS)
  })

  it('falls back rather than throwing when the option is not valid JSON', () => {
    expect(rankingsModuleAccess(status('{not json'))).toEqual(DEFAULT_RANKINGS_ACCESS)
    expect(rankingsModuleAccess(status('"a string"'))).toEqual(DEFAULT_RANKINGS_ACCESS)
    expect(rankingsModuleAccess(status(42))).toEqual(DEFAULT_RANKINGS_ACCESS)
  })

  it('keeps the defaults when the object says nothing about rankings', () => {
    expect(rankingsModuleAccess(status(JSON.stringify({ pricing: false })))).toEqual(
      DEFAULT_RANKINGS_ACCESS,
    )
  })

  it('reads a bare boolean-ish entry as the enabled flag only', () => {
    // TestHeaderNavModuleAuthRejectsLegacyDisabledModule uses exactly `{"rankings":false}`.
    expect(rankingsModuleAccess(status(JSON.stringify({ rankings: false })))).toEqual({
      enabled: false,
      requireAuth: false,
    })
    expect(rankingsModuleAccess(status(JSON.stringify({ rankings: 'false' })))).toEqual({
      enabled: false,
      requireAuth: false,
    })
    expect(rankingsModuleAccess(status(JSON.stringify({ rankings: 0 })))).toEqual({
      enabled: false,
      requireAuth: false,
    })
    expect(rankingsModuleAccess(status(JSON.stringify({ rankings: 1 })))).toEqual({
      enabled: true,
      requireAuth: false,
    })
    // An unrecognised string keeps the fallback, the way parseHeaderNavBool does.
    expect(rankingsModuleAccess(status(JSON.stringify({ rankings: 'maybe' })))).toEqual(
      DEFAULT_RANKINGS_ACCESS,
    )
  })

  it('reads both flags out of the object form', () => {
    // TestHeaderNavModuleAuthRequiresLoginForRankings uses exactly this shape.
    expect(
      rankingsModuleAccess(status(JSON.stringify({ rankings: { enabled: true, requireAuth: true } }))),
    ).toEqual({ enabled: true, requireAuth: true })
    expect(rankingsModuleAccess(status(JSON.stringify({ rankings: { requireAuth: '1' } })))).toEqual({
      enabled: true,
      requireAuth: true,
    })
    expect(rankingsModuleAccess(status(JSON.stringify({ rankings: { enabled: false } })))).toEqual({
      enabled: false,
      requireAuth: false,
    })
  })

  it('accepts an already-parsed object, since /api/status may hand one back', () => {
    expect(rankingsModuleAccess(status({ rankings: { enabled: false } }))).toEqual({
      enabled: false,
      requireAuth: false,
    })
  })
})
