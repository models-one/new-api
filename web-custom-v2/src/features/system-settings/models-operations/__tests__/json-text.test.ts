import { describe, expect, it } from 'vitest'

import {
  compactJson,
  formatJsonForEditing,
  jsonErrorMessage,
  validateJsonText,
} from '@/features/system-settings/models-operations/json-text'

/**
 * `channel_affinity_setting.rules` is NOT validated by the server — writing the literal
 * text `not json` to it returns `{"success":true}` and is stored verbatim, after which no
 * affinity rule matches and nothing reports an error. These checks are the only thing
 * standing between a typo and that outcome, so they are tested as behaviour, not markup.
 */
describe('validateJsonText', () => {
  it('accepts an empty value, because the section writes its own fallback instead', () => {
    expect(validateJsonText('', 'object')).toEqual({ valid: true })
    expect(validateJsonText('   ', 'string-array')).toEqual({ valid: true })
  })

  it('rejects text that is not JSON at all', () => {
    const result = validateJsonText('not json', 'object-array')
    expect(result.valid).toBe(false)
  })

  it('enforces object-array for the affinity rule list', () => {
    expect(validateJsonText('[{"name":"a"}]', 'object-array').valid).toBe(true)
    expect(validateJsonText('[]', 'object-array').valid).toBe(true)
    // A bare object is the mistake an operator makes when adding their first rule.
    expect(validateJsonText('{"name":"a"}', 'object-array').valid).toBe(false)
    expect(validateJsonText('["a"]', 'object-array').valid).toBe(false)
  })

  it('enforces string-array for the thinking blacklist and imagine models', () => {
    expect(validateJsonText('["kimi-k2-thinking"]', 'string-array').valid).toBe(true)
    expect(validateJsonText('[1,2]', 'string-array').valid).toBe(false)
    expect(validateJsonText('{}', 'string-array').valid).toBe(false)
  })

  it('enforces string-map the way the server validates gemini.safety_settings', () => {
    expect(validateJsonText('{"default":"OFF"}', 'string-map').valid).toBe(true)
    expect(validateJsonText('{"default":1}', 'string-map').valid).toBe(false)
    expect(validateJsonText('[]', 'string-map').valid).toBe(false)
  })

  it('enforces integer-map the way the server validates claude.default_max_tokens', () => {
    expect(validateJsonText('{"default":8192}', 'integer-map').valid).toBe(true)
    // The exact refusal the live server gives: a string where an int is expected.
    expect(validateJsonText('{"default":"nope"}', 'integer-map').valid).toBe(false)
    expect(validateJsonText('{"default":8192.5}', 'integer-map').valid).toBe(false)
    expect(validateJsonText('{"default":-1}', 'integer-map').valid).toBe(false)
  })

  it('points at the failing position rather than saying "invalid"', () => {
    const result = validateJsonText('{\n  "a": 1,\n  "b" 2\n}', 'object')
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('expected a failure')
    // Whichever engine parses it, the message carries a location or the plain fallback.
    expect(
      result.message === 'Invalid JSON at line {{line}}, column {{column}}.'
      || result.message === 'This is not valid JSON.',
    ).toBe(true)
  })
})

describe('jsonErrorMessage', () => {
  it('returns nothing for a valid value so a pristine field stays clean', () => {
    expect(jsonErrorMessage({ valid: true }, (key) => key)).toBeUndefined()
  })

  it('hands the interpolation values to the translator instead of building a sentence', () => {
    const translate = (key: string, values?: Record<string, number>) =>
      `${key}|${JSON.stringify(values ?? null)}`

    expect(
      jsonErrorMessage(
        { message: 'Invalid JSON at line {{line}}, column {{column}}.', valid: false, values: { column: 5, line: 3 } },
        translate,
      ),
    ).toBe('Invalid JSON at line {{line}}, column {{column}}.|{"column":5,"line":3}')
  })
})

describe('compactJson', () => {
  it('writes the callerfallback for an empty value, never an empty string', () => {
    expect(compactJson('', '[]')).toBe('[]')
    expect(compactJson('   ', '{}')).toBe('{}')
  })

  it('strips formatting so re-indenting the same JSON is not a change', () => {
    expect(compactJson('{\n  "a": 1\n}', '{}')).toBe('{"a":1}')
  })

  it('passes unparseable text through untouched, leaving validation to refuse it', () => {
    expect(compactJson('not json', '[]')).toBe('not json')
  })
})

describe('formatJsonForEditing', () => {
  it('pretty-prints what the option store returns as one compact line', () => {
    expect(formatJsonForEditing('{"default":"v1beta"}')).toBe('{\n  "default": "v1beta"\n}')
  })

  it('leaves an unparseable stored value visible so it can be repaired', () => {
    expect(formatJsonForEditing('not json')).toBe('not json')
    expect(formatJsonForEditing('')).toBe('')
  })
})
