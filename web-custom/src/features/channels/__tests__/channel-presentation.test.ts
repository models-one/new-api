import { describe, expect, it } from 'vitest'

import { resolveChannelPermission } from '@/features/channels/access'
import type { Channel } from '@/features/channels/api'
import {
  applyTypeDefaults,
  buildCreatePayload,
  buildOtherSettingsJson,
  buildSettingJson,
  buildUpdatePayload,
  channelStatusReason,
  channelToForm,
  emptyChannelForm,
  parseJsonRecord,
  splitList,
  validateChannelForm,
  validateJsonObjectField,
  type ChannelFormValues,
} from '@/features/channels/channel-presentation'

/**
 * A verbatim row from `GET /api/channel/:id` on the dev server, with nothing elided.
 * `key` really is the empty string: all three read handlers run GORM `Omit("key")`.
 */
const storedChannel: Channel = {
  auto_ban: 1,
  balance: 0,
  balance_updated_time: 0,
  base_url: 'http://127.0.0.1:9',
  channel_info: {
    is_multi_key: false,
    multi_key_mode: '',
    multi_key_polling_index: 0,
    multi_key_size: 0,
    multi_key_status_list: null,
  },
  created_time: 1_788_052_007,
  group: 'default',
  header_override: null,
  id: 3,
  key: '',
  model_mapping: '{"a":"b"}',
  models: 'gpt-4o-mini',
  name: '__probe_chanui',
  openai_organization: null,
  other: '',
  other_info: '{"status_reason":"manual batch operation","status_time":1788052084}',
  param_override: null,
  priority: 3,
  remark: 'probe',
  response_time: 0,
  setting: '',
  settings: '',
  status: 1,
  status_code_mapping: '',
  tag: 'probeTag',
  test_model: null,
  test_time: 0,
  type: 1,
  used_quota: 0,
  weight: 2,
}

function form(overrides: Partial<ChannelFormValues> = {}): ChannelFormValues {
  return {
    ...emptyChannelForm(),
    key: 'sk-example-1234567890',
    models: 'gpt-4o-mini',
    name: 'probe',
    ...overrides,
  }
}

describe('the permission gate', () => {
  it('grants root every action without consulting the matrix', () => {
    expect(resolveChannelPermission(100, undefined, 'sensitive_write')).toBe(true)
    expect(resolveChannelPermission(100, {}, 'secret_view')).toBe(true)
  })

  it('gives an admin only the actions its matrix actually grants', () => {
    // The admin baseline in service/authz/resources_channel.go: read + operate + write,
    // but NOT sensitive_write.
    const matrix = { channel: { operate: true, read: true, write: true } }
    expect(resolveChannelPermission(10, matrix, 'read')).toBe(true)
    expect(resolveChannelPermission(10, matrix, 'operate')).toBe(true)
    expect(resolveChannelPermission(10, matrix, 'write')).toBe(true)
    expect(resolveChannelPermission(10, matrix, 'sensitive_write')).toBe(false)
  })

  it('refuses a common user even when a matrix claims otherwise', () => {
    const matrix = { channel: { read: true, sensitive_write: true } }
    expect(resolveChannelPermission(1, matrix, 'read')).toBe(false)
    expect(resolveChannelPermission(1, matrix, 'sensitive_write')).toBe(false)
  })
})

describe('the JSON-shaped fields', () => {
  it('accepts an empty field and a plain object', () => {
    expect(validateJsonObjectField('')).toBeUndefined()
    expect(validateJsonObjectField('   ')).toBeUndefined()
    expect(validateJsonObjectField('{"gpt-4o": "gpt-4o-2024-11-20"}')).toBeUndefined()
  })

  it('carries the parser message rather than swallowing it', () => {
    const error = validateJsonObjectField('{"a": }')
    expect(error?.code).toBe('json-invalid')
    expect(error?.detail).toBeTruthy()
  })

  it('rejects a JSON array and a bare scalar, which the server unmarshals as a map', () => {
    expect(validateJsonObjectField('["a"]')?.code).toBe('json-invalid')
    expect(validateJsonObjectField('42')?.code).toBe('json-invalid')
  })

  it('stops a malformed model mapping from ever being sent', () => {
    const errors = validateChannelForm(form({ model_mapping: '{oops' }), { isEdit: false })
    expect(errors.model_mapping?.code).toBe('json-invalid')
  })
})

describe('form validation', () => {
  it('requires a key on create, because validateChannel(isAdd) refuses an empty one', () => {
    expect(validateChannelForm(form({ key: '' }), { isEdit: false }).key?.code).toBe('key-required')
  })

  it('leaves the key optional on edit, where blank means "keep the stored one"', () => {
    expect(validateChannelForm(form({ key: '' }), { isEdit: true }).key).toBeUndefined()
  })

  it('requires a name, at least one model and at least one group', () => {
    const errors = validateChannelForm(
      form({ groups: [], models: '  ', name: '  ' }),
      { isEdit: false },
    )
    expect(errors.name?.code).toBe('name-required')
    expect(errors.models?.code).toBe('models-required')
    expect(errors.groups?.code).toBe('groups-required')
  })

  it('requires the base URL for a type that has no built-in address', () => {
    // type 60 (New API): `validateChannel` refuses an empty base URL outright.
    expect(validateChannelForm(form({ type: 60 }), { isEdit: false }).base_url?.code)
      .toBe('base-url-required')
    expect(validateChannelForm(form({ base_url: 'https://gw.example.com', type: 60 }), { isEdit: false }).base_url)
      .toBeUndefined()
  })

  it('requires the Azure API version, which lives in the `other` column', () => {
    expect(validateChannelForm(form({ base_url: 'https://x.openai.azure.com', other: '', type: 3 }), { isEdit: false }).other?.code)
      .toBe('other-required')
  })

  it('demands the Vertex region map carry a "default" entry', () => {
    const missingDefault = validateChannelForm(
      form({ other: '{"europe-west1": "x"}', type: 41 }),
      { isEdit: false },
    )
    expect(missingDefault.other?.code).toBe('vertex-region-shape')

    const plainString = validateChannelForm(form({ other: 'us-central1', type: 41 }), { isEdit: false })
    expect(plainString.other?.code).toBe('json-invalid')

    const valid = validateChannelForm(form({ other: '{"default": "us-central1"}', type: 41 }), { isEdit: false })
    expect(valid.other).toBeUndefined()
  })

  it('demands a Codex key be JSON with access_token and account_id', () => {
    expect(validateChannelForm(form({ key: 'sk-plain', type: 57 }), { isEdit: false }).key?.code)
      .toBe('codex-key-shape')
    expect(validateChannelForm(form({ key: '{"access_token":"a"}', type: 57 }), { isEdit: false }).key?.code)
      .toBe('codex-key-shape')
    expect(validateChannelForm(
      form({ key: '{"access_token":"a","account_id":"b"}', type: 57 }),
      { isEdit: false },
    ).key).toBeUndefined()
  })

  it('does not demand a Codex key shape when the field is left blank on edit', () => {
    expect(validateChannelForm(form({ key: '', type: 57 }), { isEdit: true }).key).toBeUndefined()
  })

  it('enforces the HTTP transport rules ValidateHTTPTransport applies server-side', () => {
    expect(validateChannelForm(form({ http2_connection_shards: '9' }), { isEdit: false }).http2_connection_shards?.code)
      .toBe('shards-invalid')
    expect(validateChannelForm(form({ http2_connection_shards: '0' }), { isEdit: false }).http2_connection_shards?.code)
      .toBe('shards-invalid')
    expect(validateChannelForm(
      form({ http2_connection_shards: '4', http_protocol: 'http1' }),
      { isEdit: false },
    ).http2_connection_shards?.code).toBe('shards-with-http1')
    expect(validateChannelForm(
      form({ http2_connection_shards: '1', http_protocol: 'http1' }),
      { isEdit: false },
    ).http2_connection_shards).toBeUndefined()
  })

  it('rejects a non-integer priority or weight', () => {
    const errors = validateChannelForm(form({ priority: '1.5', weight: 'abc' }), { isEdit: false })
    expect(errors.priority?.code).toBe('priority-invalid')
    expect(errors.weight?.code).toBe('weight-invalid')
  })
})

describe('switching the provider type', () => {
  it('never blanks a base URL that is already there', () => {
    const values = form({ base_url: 'https://proxy.example.com', type: 1 })
    expect(applyTypeDefaults(values, 14).base_url).toBe('https://proxy.example.com')
  })

  it('seeds the per-type `other` default only when the field is empty', () => {
    // Azure needs an api-version; a new channel gets the default.
    expect(applyTypeDefaults(form({ other: '', type: 1 }), 3).other).toBe('2024-12-01-preview')
    // An existing value is kept rather than overwritten.
    expect(applyTypeDefaults(form({ other: '2023-05-15', type: 3 }), 3).other).toBe('2023-05-15')
  })

  it('clears `other` for a type that has no use for it', () => {
    // `other` is Azure's api-version; an OpenAI channel must not carry it over.
    expect(applyTypeDefaults(form({ other: '2024-12-01-preview', type: 3 }), 1).other).toBe('')
  })
})

describe('the create payload', () => {
  it('sends the typed key and the chosen mode', () => {
    const payload = buildCreatePayload(form({ groups: ['default', 'vip'], models: ' a , b ,, ' }))
    expect(payload.mode).toBe('single')
    expect(payload.channel.key).toBe('sk-example-1234567890')
    expect(payload.channel.group).toBe('default,vip')
    // Blank entries are dropped and each name is trimmed before it is joined back.
    expect(payload.channel.models).toBe('a,b')
    expect(payload.multi_key_mode).toBeUndefined()
  })

  it('carries the rotation mode only in multi-key mode', () => {
    const payload = buildCreatePayload(form({ mode: 'multi_to_single', multi_key_mode: 'polling' }))
    expect(payload.multi_key_mode).toBe('polling')
    expect(payload.batch_add_set_key_prefix_2_name).toBeUndefined()
  })

  it('carries the name-prefix flag only in batch mode', () => {
    const payload = buildCreatePayload(form({ batch_add_set_key_prefix_2_name: true, mode: 'batch' }))
    expect(payload.batch_add_set_key_prefix_2_name).toBe(true)
    expect(payload.multi_key_mode).toBeUndefined()
  })

  it('never sends a status: UpdateChannel refuses any body carrying one', () => {
    const payload = buildCreatePayload(form())
    expect(Object.keys(payload.channel)).not.toContain('status')
  })
})

describe('the update payload', () => {
  it('omits the key entirely when the field is left blank, so the stored one survives', () => {
    const values = channelToForm(storedChannel)
    const payload = buildUpdatePayload(values, storedChannel)
    expect(Object.keys(payload)).not.toContain('key')
  })

  it('sends the key only when one was actually typed', () => {
    const values = { ...channelToForm(storedChannel), key: '  sk-replacement  ' }
    expect(buildUpdatePayload(values, storedChannel).key).toBe('sk-replacement')
  })

  it('drops every unchanged sensitive field so a write-only admin is not refused', () => {
    // channelHasSensitiveChanges compares the request keys against the stored row; a
    // routing-only edit must not carry type/base_url/setting/settings at all.
    const values = { ...channelToForm(storedChannel), models: 'gpt-4o-mini,gpt-4o' }
    const payload = buildUpdatePayload(values, storedChannel)

    expect(payload.models).toBe('gpt-4o-mini,gpt-4o')
    for (const field of ['type', 'base_url', 'other', 'setting', 'settings', 'param_override', 'header_override', 'openai_organization']) {
      expect(Object.keys(payload)).not.toContain(field)
    }
  })

  it('keeps a sensitive field once it really changes', () => {
    const values = { ...channelToForm(storedChannel), base_url: 'https://proxy.example.com' }
    const payload = buildUpdatePayload(values, storedChannel)
    expect(payload.base_url).toBe('https://proxy.example.com')
    expect(Object.keys(payload)).not.toContain('type')
  })

  it('preserves settings keys this console has no control for', () => {
    const withAdvanced: Channel = {
      ...storedChannel,
      settings: '{"advanced_custom":{"advanced_routes":[{"incoming_path":"/v1/x"}]},"upstream_model_update_check_enabled":true}',
      type: 58,
    }
    const values = { ...channelToForm(withAdvanced), models: 'a,b' }
    const payload = buildUpdatePayload(values, withAdvanced)
    // Nothing changed in `settings`, so it is dropped from the body — and therefore
    // cannot be overwritten with a blob missing advanced_custom.
    expect(Object.keys(payload)).not.toContain('settings')

    const rebuilt = parseJsonRecord(buildOtherSettingsJson(values, parseJsonRecord(withAdvanced.settings)))
    expect(rebuilt.advanced_custom).toBeDefined()
    expect(rebuilt.upstream_model_update_check_enabled).toBe(true)
  })

  it('never sends a status field', () => {
    const payload = buildUpdatePayload(channelToForm(storedChannel), storedChannel)
    expect(Object.keys(payload)).not.toContain('status')
  })
})

describe('settings serialisation', () => {
  it('emits nothing when every managed value is at its Go zero value', () => {
    // dto.ChannelSettings carries omitempty on all of these, so Go would write nothing.
    expect(buildSettingJson(emptyChannelForm(), {})).toBe('')
  })

  it('writes only what was actually set', () => {
    const serialised = buildSettingJson(
      form({ force_format: true, proxy: ' socks5://127.0.0.1:1080 ' }),
      {},
    )
    expect(parseJsonRecord(serialised)).toEqual({
      force_format: true,
      proxy: 'socks5://127.0.0.1:1080',
    })
  })

  it('writes an extra only for a type that exposes it', () => {
    // `claude_beta_query` belongs to the Anthropic spec; an OpenAI channel must not
    // acquire it just because the form value happens to be true.
    const openai = buildOtherSettingsJson(form({ claude_beta_query: true, type: 1 }), {})
    expect(parseJsonRecord(openai).claude_beta_query).toBeUndefined()

    const anthropic = buildOtherSettingsJson(form({ claude_beta_query: true, type: 14 }), {})
    expect(parseJsonRecord(anthropic).claude_beta_query).toBe(true)
  })

  it('keeps an explicit false for openrouter_enterprise, which is a *bool server-side', () => {
    const serialised = buildOtherSettingsJson(form({ openrouter_enterprise: false, type: 20 }), {})
    expect(parseJsonRecord(serialised).openrouter_enterprise).toBe(false)
  })
})

describe('reading a stored channel back', () => {
  it('never pre-fills the key field: the server does not return one', () => {
    expect(channelToForm(storedChannel).key).toBe('')
  })

  it('splits the comma-joined group and model columns', () => {
    expect(splitList('default, vip ,,svip')).toEqual(['default', 'vip', 'svip'])
    expect(splitList('')).toEqual([])
    expect(splitList(null)).toEqual([])
  })

  it('surfaces the server-recorded status reason and tolerates a malformed blob', () => {
    expect(channelStatusReason(storedChannel)).toBe('manual batch operation')
    expect(channelStatusReason({ ...storedChannel, other_info: 'not json' })).toBeUndefined()
    expect(channelStatusReason({ ...storedChannel, other_info: '' })).toBeUndefined()
  })
})
