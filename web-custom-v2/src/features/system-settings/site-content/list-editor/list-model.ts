import { byteLength, isPlainObject } from '@/features/system-settings/site-content/option-json'

/**
 * ONE LIST EDITOR FOR FIVE OPTIONS
 * ================================
 * `console_setting.announcements`, `console_setting.api_info`, `console_setting.faq`,
 * `console_setting.uptime_kuma_groups` and `Chats` are all the same thing: a single
 * option value holding a serialised JSON ARRAY of small flat records. They differ only in
 * which fields a record has and what the server checks about them.
 *
 * So the shape below is the difference, and everything else — parsing, validating,
 * the table, the add/edit dialog, the delete confirmation, the raw-JSON escape hatch —
 * is written once in `OptionListEditor` and reused five times.
 *
 * TWO DECISIONS WORTH THE WORDS:
 *
 * 1. AN UNREADABLE ENTRY IS AN ERROR, NOT A DROPPED ROW. The legacy console parsed these
 *    blobs leniently: an entry it could not understand simply vanished from the table,
 *    and the next save wrote the survivors back — deleting the operator's data without
 *    ever saying so. Here `parseList` fails loudly and names the position, and the table
 *    refuses to render until the JSON tab is fixed. Nothing is ever written that was not
 *    round-tripped.
 *
 * 2. UNKNOWN KEYS ON AN ENTRY SURVIVE. The Go validators read these blobs as
 *    `[]map[string]interface{}` and ignore fields they do not know, and the legacy
 *    console wrote a synthetic `id` into every record. An entry's unrecognised keys are
 *    kept in `extra` and merged back on write, so editing a row that came from another
 *    console does not quietly strip half of it.
 */

/** Every field of every one of the five lists is a string. That is what makes this generic. */
export type ListFields = Readonly<Record<string, string>>

/** One entry as the editor holds it: its known fields, plus whatever else was stored with it. */
export type ListItem = {
  /** Position in the stored array. The row identity for the table and the dialogs. */
  position: number
  fields: ListFields
  extra: Readonly<Record<string, unknown>>
}

export type ListFieldKind = 'text' | 'textarea' | 'select' | 'datetime'

export type ListFieldOption = {
  value: string
  label: string
}

export type ListFieldSpec = {
  /** The key inside the stored object, spelled verbatim. */
  name: string
  /** Translated label for the dialog control and for error messages naming this field. */
  label: string
  kind: ListFieldKind
  description?: string
  placeholder?: string
  /** Mirrors a server-side "缺少X字段" check: empty is refused. */
  required?: boolean
  /** Mirrors a server-side length check. BYTES, because Go's `len()` counts bytes. */
  maxBytes?: number
  /** For `kind: 'select'`; the value written is the option value. */
  options?: readonly ListFieldOption[]
  /**
   * What a NEW row starts with. Not a fallback for an existing row — an entry stored
   * without this field keeps its empty value and is reported by `required` if the server
   * demands one. It exists because several of these fields are required AND enumerated:
   * an announcement whose `type` is the empty string is refused by the server outright.
   *
   * A function is evaluated when the add dialog opens, so a seeded timestamp is the time
   * the operator pressed Add rather than the time the page was loaded.
   */
  defaultValue?: string | (() => string)
  rows?: number
  /** Shape check mirroring the server's own. Returns true when the value is acceptable. */
  check?: (value: string) => boolean
  /** Translated sentence shown when `check` fails. Required whenever `check` is set. */
  checkMessage?: string
  /** Present the field as a table column. Omit to keep it out of the table. */
  column?: ListColumnSpec
}

export type ListColumnSpec = {
  header: string
  /** Narrow columns for badges and codes; the first column with none takes the slack. */
  className?: string
  mono?: boolean
}

/**
 * How one stored entry maps to fields. The default handles the four object-shaped lists;
 * `Chats` needs its own because an entry there is `{ "<name>": "<template>" }` — the NAME
 * is the object key, not a field of it.
 */
export type ListItemCodec = {
  decode: (entry: unknown) => { fields: Record<string, string>; extra: Record<string, unknown> } | null
  encode: (fields: ListFields, extra: Readonly<Record<string, unknown>>) => unknown
}

export type ListEditorSpec = {
  /** The option key this list is stored in, spelled verbatim. */
  optionKey: string
  fields: readonly ListFieldSpec[]
  /** The server's own cap, so the form refuses the entry the server would refuse. */
  maxItems?: number
  codec?: ListItemCodec
  /** A field the server requires to be unique across the list. */
  uniqueField?: string
  /**
   * The empty list. `[]` everywhere except where the server accepts the empty string;
   * `Chats` REFUSES `''` outright, so it is `[]` there and that is not negotiable.
   */
  emptyValue: string
}

/* ------------------------------------------------------------------ *
 * Codecs
 * ------------------------------------------------------------------ */

const KNOWN_STRING = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return undefined
}

/**
 * The default codec for the four `console_setting.*` lists. A stored field that is a
 * number or a boolean is coerced to its text — the Go validators accept only strings for
 * the fields they check, but a neighbouring key written by hand may hold anything, and
 * losing it would be worse than showing it.
 */
export function objectCodec(fieldNames: readonly string[]): ListItemCodec {
  return {
    decode(entry) {
      if (!isPlainObject(entry)) return null
      const fields: Record<string, string> = {}
      const extra: Record<string, unknown> = {}

      for (const [key, value] of Object.entries(entry)) {
        if (!fieldNames.includes(key)) {
          extra[key] = value
          continue
        }
        fields[key] = KNOWN_STRING(value) ?? ''
      }
      for (const name of fieldNames) {
        if (!Object.hasOwn(fields, name)) fields[name] = ''
      }
      return { extra, fields }
    },
    encode(fields, extra) {
      return { ...extra, ...fields }
    },
  }
}

/**
 * `Chats`, whose entries are single-key objects — the shape `parseChatPresets` in
 * `@/features/chat/chat-presets` requires and the shape Go's `[]map[string]string`
 * unmarshals into. A multi-key entry decodes as unreadable rather than being guessed at,
 * because picking one of two keys would silently discard a preset.
 */
export const chatCodec: ListItemCodec = {
  decode(entry) {
    if (!isPlainObject(entry)) return null
    const pairs = Object.entries(entry)
    if (pairs.length !== 1) return null
    const [name, template] = pairs[0]
    if (typeof template !== 'string') return null
    return { extra: {}, fields: { name, template } }
  },
  encode(fields) {
    return { [fields.name]: fields.template }
  },
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

export type ListIssue =
  | { kind: 'invalid-json' }
  | { kind: 'not-array' }
  | { kind: 'entry-unreadable'; position: number }
  | { kind: 'too-many'; max: number; count: number }
  | { kind: 'field-required'; position: number; field: string }
  | { kind: 'field-too-long'; position: number; field: string; maxBytes: number }
  | { kind: 'field-invalid'; position: number; field: string }
  | { kind: 'field-duplicate'; position: number; field: string }

export type ParsedList =
  | { ok: true; items: ListItem[] }
  | { ok: false; issue: ListIssue }

function codecFor(spec: ListEditorSpec): ListItemCodec {
  return spec.codec ?? objectCodec(spec.fields.map((field) => field.name))
}

/**
 * The stored string → editable rows. An empty or whitespace-only value is the EMPTY LIST,
 * not an error: four of these five keys hold `''` on a fresh deployment.
 */
export function parseList(spec: ListEditorSpec, raw: string): ParsedList {
  const trimmed = raw.trim()
  if (trimmed === '') return { items: [], ok: true }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { issue: { kind: 'invalid-json' }, ok: false }
  }

  if (!Array.isArray(parsed)) return { issue: { kind: 'not-array' }, ok: false }

  const codec = codecFor(spec)
  const items: ListItem[] = []
  for (const [index, entry] of parsed.entries()) {
    const decoded = codec.decode(entry)
    if (decoded === null) {
      return { issue: { kind: 'entry-unreadable', position: index + 1 }, ok: false }
    }
    items.push({ extra: decoded.extra, fields: decoded.fields, position: index })
  }

  return { items, ok: true }
}

/** Rows → the compact JSON the server stores. Never called with rows that failed validation. */
export function serializeList(spec: ListEditorSpec, items: readonly ListItem[]): string {
  if (items.length === 0) return spec.emptyValue
  const codec = codecFor(spec)
  return JSON.stringify(items.map((item) => codec.encode(item.fields, item.extra)))
}

/* ------------------------------------------------------------------ *
 * Validation — the server's rules, checked before the write goes out.
 * ------------------------------------------------------------------ */

/** What is wrong with one value of one field, or undefined. The single source of the rules. */
export type FieldFault = 'required' | 'too-long' | 'invalid'

export function checkField(field: ListFieldSpec, value: string): FieldFault | undefined {
  if (field.required === true && value.trim() === '') return 'required'
  if (value === '') return undefined

  if (field.maxBytes !== undefined && byteLength(value) > field.maxBytes) return 'too-long'
  if (field.options !== undefined && !field.options.some((option) => option.value === value)) {
    return 'invalid'
  }
  if (field.check !== undefined && !field.check(value)) return 'invalid'
  return undefined
}

/** The first thing wrong with one row, or undefined. Used by the dialog and by the list. */
export function validateItemFields(
  spec: ListEditorSpec,
  fields: ListFields,
  position: number,
): ListIssue | undefined {
  for (const field of spec.fields) {
    const fault = checkField(field, fields[field.name] ?? '')
    if (fault === 'required') return { field: field.name, kind: 'field-required', position }
    if (fault === 'too-long') {
      return { field: field.name, kind: 'field-too-long', maxBytes: field.maxBytes ?? 0, position }
    }
    if (fault === 'invalid') return { field: field.name, kind: 'field-invalid', position }
  }
  return undefined
}

/** The first thing wrong with the whole list, or undefined. */
export function validateList(spec: ListEditorSpec, items: readonly ListItem[]): ListIssue | undefined {
  if (spec.maxItems !== undefined && items.length > spec.maxItems) {
    return { count: items.length, kind: 'too-many', max: spec.maxItems }
  }

  for (const item of items) {
    const issue = validateItemFields(spec, item.fields, item.position + 1)
    if (issue !== undefined) return issue
  }

  const uniqueField = spec.uniqueField
  if (uniqueField !== undefined) {
    const seen = new Set<string>()
    for (const item of items) {
      const value = item.fields[uniqueField] ?? ''
      if (seen.has(value)) {
        return { field: uniqueField, kind: 'field-duplicate', position: item.position + 1 }
      }
      seen.add(value)
    }
  }

  return undefined
}

/** Parse and validate in one step — what the section's `validate` callback runs. */
export function inspectList(spec: ListEditorSpec, raw: string): ListIssue | undefined {
  const parsed = parseList(spec, raw)
  if (!parsed.ok) return parsed.issue
  return validateList(spec, parsed.items)
}

/* ------------------------------------------------------------------ *
 * Row edits. All pure: they take rows and return the next stored string.
 * ------------------------------------------------------------------ */

function renumber(items: readonly ListItem[]): ListItem[] {
  return items.map((item, index) => ({ ...item, position: index }))
}

export function appendItem(spec: ListEditorSpec, items: readonly ListItem[], fields: ListFields): string {
  return serializeList(spec, renumber([...items, { extra: {}, fields, position: items.length }]))
}

export function replaceItem(
  spec: ListEditorSpec,
  items: readonly ListItem[],
  position: number,
  fields: ListFields,
): string {
  const next = items.map((item) => (item.position === position ? { ...item, fields } : item))
  return serializeList(spec, renumber(next))
}

export function removeItem(spec: ListEditorSpec, items: readonly ListItem[], position: number): string {
  return serializeList(spec, renumber(items.filter((item) => item.position !== position)))
}

/** A blank row for the add dialog: every field present, seeded where the spec says so. */
export function blankFields(spec: ListEditorSpec): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const field of spec.fields) {
    const seed = field.defaultValue
    fields[field.name] = typeof seed === 'function' ? seed() : (seed ?? '')
  }
  return fields
}
