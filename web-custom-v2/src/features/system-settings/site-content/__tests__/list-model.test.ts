import { describe, expect, it } from 'vitest'

import {
  appendItem,
  blankFields,
  chatCodec,
  inspectList,
  parseList,
  removeItem,
  replaceItem,
  serializeList,
  validateList,
  type ListEditorSpec,
} from '@/features/system-settings/site-content/list-editor/list-model'

/**
 * The list editor is one piece of code standing in for five option keys, so these tests
 * exercise it through two specs that between them cover every branch that differs: an
 * object-shaped console list with an enum, a length limit and a uniqueness rule, and the
 * single-key-object shape `Chats` demands.
 */

const apiInfoSpec: ListEditorSpec = {
  emptyValue: '[]',
  fields: [
    { kind: 'text', label: 'Base URL', maxBytes: 500, name: 'url', required: true },
    { kind: 'text', label: 'Route', maxBytes: 100, name: 'route', required: true },
    {
      check: (value) => value !== 'boom',
      checkMessage: 'no',
      kind: 'text',
      label: 'Description',
      maxBytes: 8,
      name: 'description',
      required: true,
    },
    {
      defaultValue: 'blue',
      kind: 'select',
      label: 'Colour',
      name: 'color',
      options: [{ label: 'Blue', value: 'blue' }, { label: 'Grey', value: 'grey' }],
      required: true,
    },
  ],
  maxItems: 2,
  optionKey: 'console_setting.api_info',
  uniqueField: 'route',
}

const chatSpec: ListEditorSpec = {
  codec: chatCodec,
  emptyValue: '[]',
  fields: [
    { kind: 'text', label: 'Client name', name: 'name', required: true },
    { kind: 'textarea', label: 'Link template', name: 'template', required: true },
  ],
  optionKey: 'Chats',
  uniqueField: 'name',
}

function row(url: string, route: string, description = 'ok', color = 'blue') {
  return { color, description, route, url }
}

describe('parseList', () => {
  it('reads an unset key as the empty list, because four of these five keys hold ""', () => {
    const parsed = parseList(apiInfoSpec, '')
    expect(parsed.ok && parsed.items).toEqual([])
    expect(parseList(apiInfoSpec, '   ').ok).toBe(true)
  })

  it('reports malformed text instead of showing an empty table over it', () => {
    const parsed = parseList(apiInfoSpec, '[{"url":')
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.issue).toEqual({ kind: 'invalid-json' })
  })

  it('reports a JSON object where an array belongs', () => {
    const parsed = parseList(apiInfoSpec, '{"url":"https://a.example.com"}')
    expect(!parsed.ok && parsed.issue).toEqual({ kind: 'not-array' })
  })

  it('refuses to drop an entry it cannot read, naming its 1-based position', () => {
    // The legacy console dropped this row silently and the next save deleted it.
    const parsed = parseList(apiInfoSpec, '[{"url":"https://a.example.com"}, 42]')
    expect(!parsed.ok && parsed.issue).toEqual({ kind: 'entry-unreadable', position: 2 })
  })

  it('fills in a field the stored entry is missing rather than inventing one', () => {
    const parsed = parseList(apiInfoSpec, '[{"url":"https://a.example.com"}]')
    expect(parsed.ok && parsed.items[0].fields).toEqual({
      color: '',
      description: '',
      route: '',
      url: 'https://a.example.com',
    })
  })

  it('keeps unknown keys and writes them back untouched', () => {
    const stored = '[{"url":"https://a.example.com","route":"main","description":"ok","color":"blue","id":7}]'
    const parsed = parseList(apiInfoSpec, stored)
    expect(parsed.ok && parsed.items[0].extra).toEqual({ id: 7 })

    const roundTripped = parsed.ok ? serializeList(apiInfoSpec, parsed.items) : ''
    expect(JSON.parse(roundTripped)).toEqual([
      { color: 'blue', description: 'ok', id: 7, route: 'main', url: 'https://a.example.com' },
    ])
  })

  it('coerces a stored number into its text so the row is still editable', () => {
    const parsed = parseList(apiInfoSpec, '[{"url":"https://a.example.com","route":2}]')
    expect(parsed.ok && parsed.items[0].fields.route).toBe('2')
  })
})

describe('the Chats codec', () => {
  it('reads the single-key entries the gateway and the chat page both require', () => {
    const parsed = parseList(chatSpec, '[{"Cherry Studio":"cherrystudio://x"}]')
    expect(parsed.ok && parsed.items[0].fields).toEqual({
      name: 'Cherry Studio',
      template: 'cherrystudio://x',
    })
  })

  it('refuses a two-key entry rather than guessing which preset was meant', () => {
    const parsed = parseList(chatSpec, '[{"A":"x","B":"y"}]')
    expect(!parsed.ok && parsed.issue).toEqual({ kind: 'entry-unreadable', position: 1 })
  })

  it('refuses a non-string value, which the gateway also refuses', () => {
    const parsed = parseList(chatSpec, '[{"A":123}]')
    expect(!parsed.ok && parsed.issue).toEqual({ kind: 'entry-unreadable', position: 1 })
  })

  it('writes the name back as the object key', () => {
    const next = appendItem(chatSpec, [], { name: 'Lobe', template: 'https://lobe.example/?k={key}' })
    expect(JSON.parse(next)).toEqual([{ Lobe: 'https://lobe.example/?k={key}' }])
  })
})

describe('validateList', () => {
  const items = (raw: string) => {
    const parsed = parseList(apiInfoSpec, raw)
    if (!parsed.ok) throw new Error('fixture does not parse')
    return parsed.items
  }

  it('enforces the server’s entry cap', () => {
    const three = JSON.stringify([row('https://a.e.com', 'a'), row('https://b.e.com', 'b'), row('https://c.e.com', 'c')])
    expect(validateList(apiInfoSpec, items(three))).toEqual({ count: 3, kind: 'too-many', max: 2 })
  })

  it('reports a missing required field against its position', () => {
    const blank = JSON.stringify([row('https://a.e.com', '')])
    expect(validateList(apiInfoSpec, items(blank))).toEqual({
      field: 'route',
      kind: 'field-required',
      position: 1,
    })
  })

  it('measures a length limit in bytes', () => {
    // Three Chinese characters are nine bytes and break an eight-byte limit, while three
    // ASCII characters do not.
    expect(validateList(apiInfoSpec, items(JSON.stringify([row('https://a.e.com', 'a', 'abc')])))).toBeUndefined()
    expect(validateList(apiInfoSpec, items(JSON.stringify([row('https://a.e.com', 'a', '说明书')])))).toEqual({
      field: 'description',
      kind: 'field-too-long',
      maxBytes: 8,
      position: 1,
    })
  })

  it('rejects a value outside an enumerated field', () => {
    expect(validateList(apiInfoSpec, items(JSON.stringify([row('https://a.e.com', 'a', 'ok', 'chartreuse')])))).toEqual({
      field: 'color',
      kind: 'field-invalid',
      position: 1,
    })
  })

  it('runs the field’s own shape check', () => {
    expect(validateList(apiInfoSpec, items(JSON.stringify([row('https://a.e.com', 'a', 'boom')])))).toEqual({
      field: 'description',
      kind: 'field-invalid',
      position: 1,
    })
  })

  it('reports a duplicate in the field the server requires to be unique', () => {
    const duplicated = JSON.stringify([row('https://a.e.com', 'main'), row('https://b.e.com', 'main')])
    expect(validateList(apiInfoSpec, items(duplicated))).toEqual({
      field: 'route',
      kind: 'field-duplicate',
      position: 2,
    })
  })

  it('accepts a list the server would accept', () => {
    const fine = JSON.stringify([row('https://a.e.com', 'main'), row('https://b.e.com', 'backup')])
    expect(validateList(apiInfoSpec, items(fine))).toBeUndefined()
  })
})

describe('inspectList', () => {
  it('surfaces a parse failure ahead of any field rule', () => {
    expect(inspectList(apiInfoSpec, 'nonsense')).toEqual({ kind: 'invalid-json' })
  })

  it('passes an empty value, which is what an unconfigured list holds', () => {
    expect(inspectList(apiInfoSpec, '')).toBeUndefined()
  })
})

describe('row edits', () => {
  const parsed = parseList(apiInfoSpec, JSON.stringify([row('https://a.e.com', 'a'), row('https://b.e.com', 'b')]))
  const items = parsed.ok ? parsed.items : []

  it('renumbers after a removal so the remaining rows stay addressable', () => {
    const next = removeItem(apiInfoSpec, items, 0)
    const reparsed = parseList(apiInfoSpec, next)
    expect(reparsed.ok && reparsed.items.map((item) => item.position)).toEqual([0])
    expect(reparsed.ok && reparsed.items[0].fields.route).toBe('b')
  })

  it('replaces only the row at that position', () => {
    const next = replaceItem(apiInfoSpec, items, 1, row('https://c.e.com', 'c'))
    expect(JSON.parse(next).map((entry: { route: string }) => entry.route)).toEqual(['a', 'c'])
  })

  it('writes the empty list as the spec’s empty value, never as an empty string', () => {
    // `Chats` is refused outright when it is sent as "" — verified against the server.
    expect(removeItem(chatSpec, [], 0)).toBe('[]')
  })
})

describe('blankFields', () => {
  it('seeds a new row from the spec, so a required enum is never blank on open', () => {
    expect(blankFields(apiInfoSpec)).toEqual({ color: 'blue', description: '', route: '', url: '' })
  })

  it('evaluates a function seed when the dialog opens, not when the page loads', () => {
    let calls = 0
    const spec: ListEditorSpec = {
      emptyValue: '[]',
      fields: [{ defaultValue: () => `t${++calls}`, kind: 'text', label: 'When', name: 'when' }],
      optionKey: 'x',
    }
    expect(blankFields(spec).when).toBe('t1')
    expect(blankFields(spec).when).toBe('t2')
  })
})
