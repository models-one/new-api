// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'

import {
  buildChatUrl,
  detectChatPresetKind,
  findChatPreset,
  normalizeApiKey,
  parseChatIndex,
  parseChatPresets,
  presetRequiresApiKey,
  presetScheme,
  substitutedPlaceholders,
} from '@/features/chat/chat-presets'

/**
 * `chats` exactly as `GET /api/status` returns it on the seeded dev server: an array of
 * single-key objects, nine entries, mixing web templates with desktop-app protocols.
 */
const seededChats: unknown = [
  { 'Cherry Studio': 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}' },
  { AionUI: 'aionui://provider/add?v=1&data={aionuiConfig}' },
  { 流畅阅读: 'fluentread' },
  { 'CC Switch': 'ccswitch' },
  { DeepChat: 'deepchat://provider/install?v=1&data={deepchatConfig}' },
  {
    'Lobe Chat 官方示例':
      'https://chat-preview.lobehub.com/?settings={"keyVaults":{"openai":{"apiKey":"{key}","baseURL":"{address}/v1"}}}',
  },
  {
    'AI as Workspace':
      'https://aiaw.app/set-provider?provider={"type":"openai","settings":{"apiKey":"{key}","baseURL":"{address}/v1","compatibility":"strict"}}',
  },
  { 'AMA 问天': 'ama://set-api-key?server={address}&key={key}' },
  { OpenCat: 'opencat://team/join?domain={address}&token={key}' },
]

const SERVER_ADDRESS = 'http://localhost:3000'
const SECRET = 'sk-ZsbYkbcr7wIDZIaZvWoOu9AR9Uw5xhrtiRgPERsvLIVqDbvu'

describe('parseChatPresets', () => {
  it('reads the seeded catalogue and keeps the array position as the index', () => {
    const presets = parseChatPresets(seededChats)

    expect(presets).toHaveLength(9)
    expect(presets[0]).toEqual({
      index: 0,
      kind: 'custom-protocol',
      name: 'Cherry Studio',
      template: 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}',
    })
    expect(presets[5]?.name).toBe('Lobe Chat 官方示例')
    expect(presets[5]?.kind).toBe('web')
    expect(presets[2]?.kind).toBe('fluent')
  })

  it('drops malformed entries without renumbering the survivors', () => {
    const presets = parseChatPresets([
      { First: 'https://one.example/' },
      { Two: 'https://two.example/', Extra: 'https://three.example/' },
      null,
      'not-an-object',
      { Blank: '   ' },
      { NotAString: 42 },
      { Last: 'https://last.example/' },
    ])

    expect(presets.map((preset) => preset.index)).toEqual([0, 6])
    expect(findChatPreset(presets, 6)?.name).toBe('Last')
    expect(findChatPreset(presets, 1)).toBeUndefined()
  })

  it('accepts the block as a JSON string, and refuses anything else', () => {
    expect(parseChatPresets(JSON.stringify([{ Web: 'https://a.example/' }]))).toHaveLength(1)
    expect(parseChatPresets('{ not json')).toEqual([])
    expect(parseChatPresets({ Web: 'https://a.example/' })).toEqual([])
    expect(parseChatPresets(undefined)).toEqual([])
    expect(parseChatPresets(null)).toEqual([])
  })
})

describe('preset classification', () => {
  it('separates web, extension bridge and desktop protocol', () => {
    expect(detectChatPresetKind('https://chat.example/')).toBe('web')
    expect(detectChatPresetKind('HTTP://chat.example/')).toBe('web')
    expect(detectChatPresetKind('fluentread')).toBe('fluent')
    expect(detectChatPresetKind('cherrystudio://x')).toBe('custom-protocol')
    expect(detectChatPresetKind('ccswitch')).toBe('custom-protocol')
  })

  it('names the protocol handler a desktop preset would have used', () => {
    expect(presetScheme('opencat://team/join?domain={address}')).toBe('opencat')
    expect(presetScheme('fluentread')).toBeNull()
  })

  it('knows which templates need the user key', () => {
    expect(presetRequiresApiKey('https://a.example/?k={key}')).toBe(true)
    expect(presetRequiresApiKey('cherrystudio://x?data={cherryConfig}')).toBe(true)
    expect(presetRequiresApiKey('aionui://x?data={aionuiConfig}')).toBe(true)
    expect(presetRequiresApiKey('deepchat://x?data={deepchatConfig}')).toBe(true)
    expect(presetRequiresApiKey('https://a.example/?s={address}')).toBe(false)
    expect(presetRequiresApiKey('https://a.example/')).toBe(false)
  })

  it('reports only the placeholders the resolver actually substitutes', () => {
    expect(substitutedPlaceholders('https://a.example/?k={key}&s={address}')).toEqual([
      '{address}',
      '{key}',
    ])
    // The config token short-circuits, so {key} beside it is left alone.
    expect(substitutedPlaceholders('https://a.example/?d={cherryConfig}&k={key}')).toEqual([
      '{cherryConfig}',
    ])
    expect(substitutedPlaceholders('https://a.example/')).toEqual([])
  })
})

describe('parseChatIndex', () => {
  it('accepts only a plain non-negative integer', () => {
    expect(parseChatIndex('0')).toBe(0)
    expect(parseChatIndex('5')).toBe(5)
    expect(parseChatIndex('-1')).toBeNull()
    expect(parseChatIndex('1e3')).toBeNull()
    expect(parseChatIndex('0x2')).toBeNull()
    expect(parseChatIndex(' 1')).toBeNull()
    expect(parseChatIndex('1.0')).toBeNull()
    expect(parseChatIndex('')).toBeNull()
    expect(parseChatIndex('99999999999999999999')).toBeNull()
  })
})

describe('normalizeApiKey', () => {
  it('adds the sk- prefix once', () => {
    expect(normalizeApiKey('abc')).toBe('sk-abc')
    expect(normalizeApiKey('sk-abc')).toBe('sk-abc')
    expect(normalizeApiKey('  abc  ')).toBe('sk-abc')
    expect(normalizeApiKey('   ')).toBe('')
  })
})

describe('buildChatUrl', () => {
  const lobeTemplate =
    'https://chat-preview.lobehub.com/?settings={"keyVaults":{"openai":{"apiKey":"{key}","baseURL":"{address}/v1"}}}'

  it('fills {key} and {address} into the operator template', () => {
    const result = buildChatUrl({
      apiKey: SECRET,
      serverAddress: SERVER_ADDRESS,
      template: lobeTemplate,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.origin).toBe('https://chat-preview.lobehub.com')
    expect(result.url).toContain(SECRET)
    expect(result.url).toContain(encodeURIComponent(SERVER_ADDRESS))
    expect(new URL(result.url).origin).toBe('https://chat-preview.lobehub.com')
  })

  it('leaves {key} in place when no key is supplied', () => {
    const result = buildChatUrl({ serverAddress: SERVER_ADDRESS, template: lobeTemplate })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.url).toContain('{key}')
  })

  it('base64-encodes the cherry payload the way the legacy resolver did', () => {
    const result = buildChatUrl({
      apiKey: SECRET,
      serverAddress: SERVER_ADDRESS,
      template: 'https://cherry.example/import?data={cherryConfig}',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const encoded = new URL(result.url).searchParams.get('data') ?? ''
    expect(JSON.parse(atob(encoded))).toEqual({
      apiKey: SECRET,
      baseUrl: SERVER_ADDRESS,
      id: 'new-api',
    })
  })

  it('refuses a template that is not http or https', () => {
    expect(
      buildChatUrl({
        apiKey: SECRET,
        serverAddress: SERVER_ADDRESS,
        template: 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}',
      }),
    ).toEqual({ ok: false, reason: 'unsupported-scheme' })

    expect(
      buildChatUrl({ apiKey: SECRET, serverAddress: SERVER_ADDRESS, template: 'javascript:alert(1)' }),
    ).toEqual({ ok: false, reason: 'unsupported-scheme' })
  })

  it('refuses a template that is not a URL at all', () => {
    expect(
      buildChatUrl({ apiKey: SECRET, serverAddress: SERVER_ADDRESS, template: 'fluentread' }),
    ).toEqual({ ok: false, reason: 'template-not-a-url' })
  })

  it('refuses to let a placeholder decide the destination host', () => {
    // Without the origin gate this would resolve to https://sk-….evil.example — the key
    // leaving as a DNS lookup to a host the operator never wrote down.
    expect(
      buildChatUrl({
        apiKey: SECRET,
        serverAddress: SERVER_ADDRESS,
        template: 'https://{key}.evil.example/',
      }),
    ).toEqual({ ok: false, reason: 'origin-not-literal' })

    // A placeholder standing in for the whole authority is refused one gate earlier:
    // percent-encoding the address makes the resolved host unparseable.
    expect(
      buildChatUrl({
        apiKey: SECRET,
        serverAddress: 'https://attacker.example',
        template: 'https://{address}/chat',
      }),
    ).toEqual({ ok: false, reason: 'resolved-not-a-url' })
  })

  it('keeps a literal origin even when the key lands in the path', () => {
    const result = buildChatUrl({
      apiKey: SECRET,
      serverAddress: SERVER_ADDRESS,
      template: 'https://good.example/join/{key}',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.origin).toBe('https://good.example')
  })
})
