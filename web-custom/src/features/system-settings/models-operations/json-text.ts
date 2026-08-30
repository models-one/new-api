/**
 * The JSON-blob helpers the models sections share.
 *
 * Eight of the keys in this scope are serialised JSON edited as text
 * (`gemini.safety_settings`, `gemini.version_settings`,
 * `gemini.supported_imagine_models`, `claude.model_headers_settings`,
 * `claude.default_max_tokens`, `global.thinking_model_blacklist`,
 * `global.chat_completions_to_responses_policy`,
 * `channel_affinity_setting.rules`).
 *
 * The server validates only SOME of them. Verified live:
 *   PUT gemini.safety_settings  '{"default":'  → success:false
 *       "Gemini safety settings must be a JSON string map: unexpected end of JSON input"
 *   PUT claude.default_max_tokens '{"default":"nope"}' → success:false
 *       "Claude default max tokens must be a JSON map of model to integer: …"
 *   PUT channel_affinity_setting.rules 'not json' → success:TRUE, stored verbatim
 *
 * That last one is why these helpers exist: an unvalidated key will happily swallow
 * garbage and the feature then silently stops matching. Every JSON field in this scope is
 * validated in the browser before the write is attempted.
 */

/**
 * A failure carries an ENGLISH SOURCE STRING plus its interpolation values, so the caller
 * renders it with `t(error.message, error.values)` and the string lives in all seven
 * locale files like every other. Building the sentence here with template literals would
 * put an untranslatable message on screen.
 */
export type JsonValidation =
  | { valid: true }
  | { valid: false; message: string; values?: Record<string, number> }

/** Pretty-prints for an editor; returns the original text when it does not parse. */
export function formatJsonForEditing(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return value
  }
}

/**
 * Compacts on the way to the server so a whitespace-only edit is not a change.
 * Unparseable text is passed through unchanged — validation refuses it first.
 */
export function compactJson(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return fallback
  try {
    return JSON.stringify(JSON.parse(trimmed))
  } catch {
    return trimmed
  }
}

function describeSyntaxError(error: unknown, source: string): JsonValidation {
  const generic = { message: 'This is not valid JSON.', valid: false } as const
  if (!(error instanceof Error)) return generic

  // V8 says "at position 12", SpiderMonkey says "at line 2 column 3"; both are read so the
  // operator is pointed at the character rather than told the whole blob is wrong.
  const positionMatch = /at position (\d+)/i.exec(error.message)
  if (positionMatch !== null) {
    const position = Number.parseInt(positionMatch[1], 10)
    const consumed = source.slice(0, position).split('\n')
    return {
      message: 'Invalid JSON at line {{line}}, column {{column}}.',
      valid: false,
      values: { column: (consumed[consumed.length - 1]?.length ?? 0) + 1, line: consumed.length },
    }
  }

  const lineMatch = /at line (\d+) column (\d+)/i.exec(error.message)
  if (lineMatch !== null) {
    return {
      message: 'Invalid JSON at line {{line}}, column {{column}}.',
      valid: false,
      values: {
        column: Number.parseInt(lineMatch[2], 10),
        line: Number.parseInt(lineMatch[1], 10),
      },
    }
  }

  return generic
}

export type JsonShape =
  /** Any parseable JSON. */
  | 'any'
  /** `{}` — a JSON object, the shape every per-model map uses. */
  | 'object'
  /** `[]` of strings — the blacklist and imagine-model lists. */
  | 'string-array'
  /** `[]` of objects — the channel affinity rule list. */
  | 'object-array'
  /** `{}` whose every value is a string — gemini safety / version overrides. */
  | 'string-map'
  /** `{}` whose every value is a non-negative integer — claude default max tokens. */
  | 'integer-map'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function checkShape(parsed: unknown, shape: JsonShape): string | undefined {
  switch (shape) {
    case 'any':
      return undefined
    case 'object':
      return isPlainObject(parsed) ? undefined : 'Expected a JSON object.'
    case 'string-array':
      if (!Array.isArray(parsed)) return 'Expected a JSON array of strings.'
      return parsed.every((entry) => typeof entry === 'string')
        ? undefined
        : 'Expected a JSON array of strings.'
    case 'object-array':
      if (!Array.isArray(parsed)) return 'Expected a JSON array of objects.'
      return parsed.every((entry) => isPlainObject(entry))
        ? undefined
        : 'Expected a JSON array of objects.'
    case 'string-map':
      if (!isPlainObject(parsed)) return 'Expected a JSON object whose values are strings.'
      return Object.values(parsed).every((entry) => typeof entry === 'string')
        ? undefined
        : 'Expected a JSON object whose values are strings.'
    case 'integer-map': {
      if (!isPlainObject(parsed)) return 'Expected a JSON object whose values are whole numbers.'
      const allIntegers = Object.values(parsed).every(
        (entry) => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0,
      )
      return allIntegers ? undefined : 'Expected a JSON object whose values are whole numbers.'
    }
  }
}

/**
 * An EMPTY value is valid: every key in this scope writes its own fallback (`[]` / `{}`)
 * instead, because none of them treats an empty string as meaningful.
 */
export function validateJsonText(value: string, shape: JsonShape = 'any'): JsonValidation {
  const trimmed = value.trim()
  if (trimmed === '') return { valid: true }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    return describeSyntaxError(error, trimmed)
  }

  const shapeError = checkShape(parsed, shape)
  return shapeError === undefined ? { valid: true } : { message: shapeError, valid: false }
}

/** `t()` applied to a failure, so a section never has to know about the values bag. */
export function jsonErrorMessage(
  validation: JsonValidation,
  translate: (key: string, values?: Record<string, number>) => string,
): string | undefined {
  if (validation.valid) return undefined
  return translate(validation.message, validation.values)
}
