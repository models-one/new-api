import { describe, expect, it } from 'vitest'

import {
  hasOption,
  readOptionBoolean,
  readOptionJson,
  readOptionNumber,
  readOptionString,
  readOptionStringList,
  serializeOptionValue,
  toSystemOptionMap,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'

/**
 * Values lifted verbatim from `GET /api/option/` on the running dev server, including the
 * exact strings that make naive reads wrong.
 */
const live: SystemOptionMap = toSystemOptionMap([
  { key: 'DefaultCollapseSidebar', value: 'false' },
  { key: 'SelfUseModeEnabled', value: 'false' },
  { key: 'PasswordRegisterEnabled', value: 'true' },
  { key: 'AutomaticDisableStatusCodes', value: '401' },
  { key: 'Price', value: '7.3' },
  { key: 'grok.violation_deduction_amount', value: '0.05' },
  { key: 'SystemName', value: 'New API' },
  { key: 'ServerAddress', value: '' },
  { key: 'GroupRatio', value: '{"default":1,"svip":1,"vip":1}' },
  { key: 'AutoGroups', value: '["default"]' },
  { key: 'fetch_setting.allowed_ports', value: '["80","443","8080","8443"]' },
  { key: 'fetch_setting.domain_list', value: '[]' },
  { key: 'console_setting.announcements', value: '' },
  {
    key: 'EmailDomainWhitelist',
    value: 'gmail.com,163.com,126.com,qq.com',
  },
  {
    key: 'AutomaticDisableKeywords',
    value: 'Your credit balance is too low\nThis organization has been disabled.',
  },
  { key: 'billing_setting.billing_mode', value: '{}' },
])

describe('toSystemOptionMap', () => {
  it('flattens the {key,value} array the endpoint returns', () => {
    expect(live.SystemName).toBe('New API')
    expect(live['fetch_setting.domain_list']).toBe('[]')
  })

  it('survives the null Go serialises an empty option slice as', () => {
    expect(toSystemOptionMap(null)).toEqual({})
    expect(toSystemOptionMap(undefined)).toEqual({})
  })
})

describe('readOptionBoolean', () => {
  it("reads the string 'false' as false — the whole reason this helper exists", () => {
    expect(readOptionBoolean(live, 'DefaultCollapseSidebar')).toBe(false)
    expect(readOptionBoolean(live, 'SelfUseModeEnabled')).toBe(false)
    // The raw value is a non-empty string, so a direct `if (option.value)` is true here.
    expect(Boolean(live.DefaultCollapseSidebar)).toBe(true)
  })

  it("reads the string 'true' as true", () => {
    expect(readOptionBoolean(live, 'PasswordRegisterEnabled')).toBe(true)
  })

  it('accepts the 1/0 spelling a hand-edited row can hold', () => {
    const options = toSystemOptionMap([
      { key: 'on', value: '1' },
      { key: 'off', value: '0' },
      { key: 'blank', value: '' },
      { key: 'padded', value: '  TRUE ' },
    ])
    expect(readOptionBoolean(options, 'on')).toBe(true)
    expect(readOptionBoolean(options, 'off')).toBe(false)
    expect(readOptionBoolean(options, 'blank')).toBe(false)
    expect(readOptionBoolean(options, 'padded')).toBe(true)
  })

  it('falls back rather than reading an unrecognised value as false', () => {
    const options = toSystemOptionMap([{ key: 'weird', value: 'yes please' }])
    expect(readOptionBoolean(options, 'weird', true)).toBe(true)
    expect(readOptionBoolean(options, 'weird', false)).toBe(false)
  })

  it('falls back for a missing key and for a missing payload', () => {
    expect(readOptionBoolean(live, 'HeaderNavModules')).toBe(false)
    expect(readOptionBoolean(live, 'HeaderNavModules', true)).toBe(true)
    expect(readOptionBoolean(undefined, 'PasswordRegisterEnabled', true)).toBe(true)
  })
})

describe('readOptionNumber', () => {
  it('parses integers and decimals', () => {
    expect(readOptionNumber(live, 'AutomaticDisableStatusCodes')).toBe(401)
    expect(readOptionNumber(live, 'Price')).toBe(7.3)
    expect(readOptionNumber(live, 'grok.violation_deduction_amount')).toBe(0.05)
  })

  it('falls back for empty, non-numeric, infinite and missing values', () => {
    const options = toSystemOptionMap([
      { key: 'blank', value: '' },
      { key: 'words', value: 'later' },
      { key: 'huge', value: 'Infinity' },
    ])
    expect(readOptionNumber(options, 'blank', 5)).toBe(5)
    expect(readOptionNumber(options, 'words', 5)).toBe(5)
    expect(readOptionNumber(options, 'huge', 5)).toBe(5)
    expect(readOptionNumber(options, 'absent', 5)).toBe(5)
    expect(readOptionNumber(undefined, 'blank', 5)).toBe(5)
  })
})

describe('readOptionString', () => {
  it('returns the stored string, including the empty one', () => {
    expect(readOptionString(live, 'SystemName')).toBe('New API')
    expect(readOptionString(live, 'ServerAddress', 'fallback')).toBe('')
  })

  it('falls back only when the key is absent', () => {
    expect(readOptionString(live, 'SidebarModulesAdmin', 'unset')).toBe('unset')
  })
})

describe('readOptionJson', () => {
  it('parses a stored blob', () => {
    expect(readOptionJson<Record<string, number>>(live, 'GroupRatio', {})).toEqual({
      default: 1,
      svip: 1,
      vip: 1,
    })
  })

  it('does not throw on malformed JSON and returns the fallback instead', () => {
    const options = toSystemOptionMap([{ key: 'broken', value: '{"default":1,' }])
    expect(() => readOptionJson(options, 'broken', { safe: true })).not.toThrow()
    expect(readOptionJson(options, 'broken', { safe: true })).toEqual({ safe: true })
  })

  it('treats an empty string as unset — four content keys ship that way', () => {
    expect(readOptionJson(live, 'console_setting.announcements', [])).toEqual([])
  })

  it('falls back when the guard rejects the parsed shape', () => {
    const isNumberRecord = (value: unknown): value is Record<string, number> =>
      typeof value === 'object' && value !== null && !Array.isArray(value)

    expect(readOptionJson(live, 'AutoGroups', { fallback: 1 }, isNumberRecord)).toEqual({
      fallback: 1,
    })
    expect(readOptionJson(live, 'GroupRatio', { fallback: 1 }, isNumberRecord)).toEqual({
      default: 1,
      svip: 1,
      vip: 1,
    })
  })

  it('falls back for a missing key', () => {
    expect(readOptionJson(live, 'HeaderNavModules', { fallback: true })).toEqual({ fallback: true })
  })
})

describe('readOptionStringList', () => {
  it('reads a JSON array, including one holding stringified numbers', () => {
    expect(readOptionStringList(live, 'fetch_setting.allowed_ports', 'json')).toEqual([
      '80',
      '443',
      '8080',
      '8443',
    ])
    expect(readOptionStringList(live, 'fetch_setting.domain_list', 'json')).toEqual([])
  })

  it('reads a comma list and a newline list', () => {
    expect(readOptionStringList(live, 'EmailDomainWhitelist', 'comma')).toEqual([
      'gmail.com',
      '163.com',
      '126.com',
      'qq.com',
    ])
    expect(readOptionStringList(live, 'AutomaticDisableKeywords', 'newline')).toEqual([
      'Your credit balance is too low',
      'This organization has been disabled.',
    ])
  })

  it('returns an empty list for an empty value and the fallback for a missing key', () => {
    expect(readOptionStringList(live, 'console_setting.announcements', 'json', ['x'])).toEqual([])
    expect(readOptionStringList(live, 'HeaderNavModules', 'json', ['x'])).toEqual(['x'])
  })

  it('falls back instead of throwing when a JSON list is not a list', () => {
    expect(readOptionStringList(live, 'billing_setting.billing_mode', 'json', ['x'])).toEqual(['x'])
  })
})

describe('hasOption', () => {
  it('separates "set to empty" from "never set"', () => {
    expect(hasOption(live, 'ServerAddress')).toBe(true)
    // Read by middleware/header_nav.go but never seeded by model.InitOptionMap.
    expect(hasOption(live, 'HeaderNavModules')).toBe(false)
    expect(hasOption(undefined, 'ServerAddress')).toBe(false)
  })
})

describe('serializeOptionValue', () => {
  it('writes booleans the way the server stores them', () => {
    expect(serializeOptionValue(true)).toBe('true')
    expect(serializeOptionValue(false)).toBe('false')
  })

  it('writes numbers in decimal and leaves strings alone', () => {
    expect(serializeOptionValue(401)).toBe('401')
    expect(serializeOptionValue(7.3)).toBe('7.3')
    expect(serializeOptionValue('New API')).toBe('New API')
  })

  it('never sends the literal text NaN', () => {
    expect(serializeOptionValue(Number.NaN)).toBe('')
  })
})
