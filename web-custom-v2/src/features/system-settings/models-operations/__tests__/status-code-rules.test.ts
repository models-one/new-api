import { describe, expect, it } from 'vitest'

import {
  countStatusCodes,
  parseStatusCodeRules,
} from '@/features/system-settings/models-operations/status-code-rules'

/**
 * These rules decide which upstream responses take a channel out of rotation, so a parse
 * that accepts something the server would refuse means the operator presses Save and the
 * write fails; a parse that rejects something the server accepts means a legitimate policy
 * cannot be entered at all. Both are checked against
 * `setting/operation_setting/status_code_ranges.go`.
 */
describe('parseStatusCodeRules', () => {
  it('treats an empty value as valid and normalises it to nothing', () => {
    for (const input of ['', '   ', '\n']) {
      const parsed = parseStatusCodeRules(input)
      expect(parsed.ok).toBe(true)
      expect(parsed.normalized).toBe('')
      expect(parsed.ranges).toEqual([])
    }
  })

  it('reads the value the dev server actually stores for AutomaticRetryStatusCodes', () => {
    const live = '100-199,300-399,401-407,409-499,500-503,505-523,525-599'
    const parsed = parseStatusCodeRules(live)

    expect(parsed.ok).toBe(true)
    // The stored default is NOT normalised. `AutomaticRetryStatusCodeRanges` in
    // `setting/operation_setting/status_code_ranges.go` is a hand-written package var that
    // `statusCodeRangesToString` serialises verbatim, so `409-499` and `500-503` sit next to
    // each other having never been through the merge. Both this parser and the server's own
    // `ParseHTTPStatusCodeRanges` join ranges that ABUT (`r.Start <= last.End+1`), so they
    // collapse. Same set of codes, one range fewer.
    expect(parsed.normalized).toBe('100-199,300-399,401-407,409-503,505-523,525-599')
    expect(countStatusCodes(parsed.ranges)).toBe(countStatusCodes(parseStatusCodeRules(live).ranges))
  })

  it('normalises to exactly what the server would compute for the same input', () => {
    // The server VALIDATES both keys but stores the raw text (`controller/option.go` calls
    // ParseHTTPStatusCodeRanges only for its error). The section writes the normalised form,
    // so the two merges have to agree or the stored text would drift from the live policy.
    expect(parseStatusCodeRules('409-499,500-503').normalized).toBe('409-503')
    expect(parseStatusCodeRules('500-503,409-499').normalized).toBe('409-503')
    // A one-code gap is a real gap and must survive: 504 is in `alwaysSkipRetryStatusCodes`.
    expect(parseStatusCodeRules('500-503,505-523').normalized).toBe('500-503,505-523')
  })

  it('merges overlapping and adjacent ranges the way the server does', () => {
    expect(parseStatusCodeRules('500-510, 505-520').normalized).toBe('500-520')
    // Adjacency, not just overlap: 401 and 402 collapse into one range.
    expect(parseStatusCodeRules('402,401').normalized).toBe('401-402')
    expect(parseStatusCodeRules('401,403').normalized).toBe('401,403')
  })

  it('accepts the full-width comma a pasted Chinese document carries', () => {
    expect(parseStatusCodeRules('401，403').normalized).toBe('401,403')
  })

  it('names every segment it could not read instead of failing anonymously', () => {
    const parsed = parseStatusCodeRules('401, 999-abc, 200, oops')

    expect(parsed.ok).toBe(false)
    expect(parsed.invalidTokens).toEqual(['999-abc', 'oops'])
    // A failed parse never claims a normalised form.
    expect(parsed.ranges).toEqual([])
  })

  it('rejects codes outside 100-599 and inverted ranges', () => {
    expect(parseStatusCodeRules('99').ok).toBe(false)
    expect(parseStatusCodeRules('600').ok).toBe(false)
    expect(parseStatusCodeRules('500-400').ok).toBe(false)
    expect(parseStatusCodeRules('4o1').ok).toBe(false)
    expect(parseStatusCodeRules('401-').ok).toBe(false)
    expect(parseStatusCodeRules('100-200-300').ok).toBe(false)
  })

  it('keeps a bare 401, the seeded auto-disable value, intact', () => {
    const parsed = parseStatusCodeRules('401')
    expect(parsed.ok).toBe(true)
    expect(parsed.ranges).toEqual([{ end: 401, start: 401 }])
  })
})

describe('countStatusCodes', () => {
  it('counts how many codes a policy actually covers', () => {
    expect(countStatusCodes(parseStatusCodeRules('401').ranges)).toBe(1)
    expect(countStatusCodes(parseStatusCodeRules('500-599').ranges)).toBe(100)
    // The point of showing this: one careless range covers a hundred ways to lose a channel.
    expect(countStatusCodes(parseStatusCodeRules('401,403,500-599').ranges)).toBe(102)
    expect(countStatusCodes([])).toBe(0)
  })
})
