import { describe, expect, it } from 'vitest'

import {
  byteLength,
  compactJson,
  formatJson,
  hasDangerousContent,
  isConsoleUrl,
  isRfc3339,
  isUptimeSlug,
} from '@/features/system-settings/site-content/option-json'

/**
 * These are the server's rules, so the tests are the server's cases: each one is a value
 * `setting/console_setting/validation.go` accepts or refuses, and the point of the test is
 * that this console agrees with it rather than inventing a looser or stricter rule.
 */

describe('byteLength', () => {
  it('counts bytes, not characters, because Go’s len() does', () => {
    // The server's limits are `len(str) > 200`. Counting UTF-16 units would let a form
    // accept 200 Chinese characters — 600 bytes — that the server then refuses.
    expect(byteLength('hello')).toBe(5)
    expect(byteLength('公告')).toBe(6)
    expect(byteLength('🙂')).toBe(4)
  })
})

describe('hasDangerousContent', () => {
  it('matches the server’s fragment list case-insensitively', () => {
    expect(hasDangerousContent('<SCRIPT>alert(1)</script>')).toBe(true)
    expect(hasDangerousContent('click JavaScript:void(0)')).toBe(true)
    expect(hasDangerousContent('<iframe src=x>')).toBe(true)
    expect(hasDangerousContent('a img onerror=boom')).toBe(true)
  })

  it('leaves ordinary copy alone', () => {
    expect(hasDangerousContent('Main route, EU region')).toBe(false)
    expect(hasDangerousContent('script kiddie')).toBe(false)
  })
})

describe('isConsoleUrl', () => {
  it('accepts what the server’s pattern accepts', () => {
    expect(isConsoleUrl('https://api.example.com')).toBe(true)
    expect(isConsoleUrl('http://127.0.0.1:3000/v1')).toBe(true)
    expect(isConsoleUrl('https://example.com:8443/a/b?c=d')).toBe(true)
  })

  it('refuses what the server refuses, including URLs new URL() would accept', () => {
    expect(isConsoleUrl('ftp://example.com')).toBe(false)
    expect(isConsoleUrl('example.com')).toBe(false)
    // Credentials in the authority: legal to the WHATWG parser, refused by the server.
    expect(isConsoleUrl('https://user:pass@example.com')).toBe(false)
    expect(isConsoleUrl('https://例え.jp')).toBe(false)
    expect(isConsoleUrl('')).toBe(false)
  })
})

describe('isUptimeSlug', () => {
  it('is the server’s slug pattern', () => {
    expect(isUptimeSlug('status-page_1')).toBe(true)
    expect(isUptimeSlug('bad slug')).toBe(false)
    expect(isUptimeSlug('slash/es')).toBe(false)
    expect(isUptimeSlug('')).toBe(false)
  })
})

describe('isRfc3339', () => {
  it('accepts what time.Parse(time.RFC3339) accepts', () => {
    expect(isRfc3339('2026-01-02T03:04:05Z')).toBe(true)
    expect(isRfc3339('2026-01-02T03:04:05.123Z')).toBe(true)
    expect(isRfc3339('2026-01-02T03:04:05+08:00')).toBe(true)
  })

  it('refuses a bare date, which the server rejected live', () => {
    expect(isRfc3339('2026-01-02')).toBe(false)
    expect(isRfc3339('2026-01-02 03:04:05')).toBe(false)
    expect(isRfc3339('not a date')).toBe(false)
    // Shaped right, but not a real instant.
    expect(isRfc3339('2026-13-45T99:99:99Z')).toBe(false)
  })
})

describe('compactJson and formatJson', () => {
  it('compacts on the way to the server so a whitespace-only edit is a no-op write', () => {
    expect(compactJson('[\n  {"a": 1}\n]')).toBe('[{"a":1}]')
    expect(compactJson('   ')).toBe('')
  })

  it('leaves text it cannot parse untouched rather than mangling the operator’s work', () => {
    expect(compactJson('[{"a": ')).toBe('[{"a":')
    expect(formatJson('[{"a": ', '[]')).toBe('[{"a": ')
  })

  it('falls back to the empty list when there is nothing to format', () => {
    expect(formatJson('', '[]')).toBe('[]')
    expect(formatJson('[{"a":1}]', '[]')).toBe('[\n  {\n    "a": 1\n  }\n]')
  })
})
