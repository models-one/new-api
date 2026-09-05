import { describe, expect, it } from 'vitest'

import type { RegistryModel, SyncConflict, Vendor } from '@/features/model-registry/api'
import {
  buildOverwritePayload,
  buildSyncPlan,
  conflictFieldLabel,
  conflictValueText,
  endpointOptions,
  formToPayload,
  isCodedConflictValue,
  isSyncLocale,
  modelStatusLabel,
  modelToForm,
  nameRuleLabel,
  overwriteKey,
  parseEndpoints,
  parseTags,
  quotaTypeLabel,
  serialiseEndpoints,
  untouchedCount,
  validateRegistryForm,
  vendorName,
  type RegistryFormValues,
} from '@/features/model-registry/model-registry-presentation'

/** A verbatim row from `GET /api/models/` on the dev server. */
const row: RegistryModel = {
  bound_channels: [{ name: 'local-test', type: 1 }],
  created_time: 1_788_578_034,
  description: 'Small omni GPT for cheap multimodal assistance and production-scale traffic',
  enable_groups: ['default'],
  endpoints: '["openai"]',
  icon: 'OpenAI',
  id: 2,
  model_name: 'gpt-4o-mini',
  name_rule: 0,
  quota_types: [0],
  status: 1,
  sync_official: 0,
  tags: 'Tools,Files,Vision,128K',
  updated_time: 1_788_578_034,
  vendor_id: 1,
}

const vendors: Vendor[] = [
  { created_time: 1, icon: 'OpenAI', id: 1, name: 'OpenAI', status: 1, updated_time: 1 },
  { created_time: 1, icon: 'Claude.Color', id: 2, name: 'Anthropic', status: 1, updated_time: 1 },
]

describe('the columns the API omits when empty', () => {
  it('reads an absent vendor_id as "no vendor" rather than vendor 0', () => {
    // Go marshals `vendor_id` with omitempty, so 0 arrives as an absent key.
    expect(vendorName(vendors, undefined)).toBeUndefined()
    expect(vendorName(vendors, 0)).toBeUndefined()
    expect(vendorName(vendors, 1)).toBe('OpenAI')
    expect(vendorName(vendors, 99)).toBeUndefined()
  })

  it('turns an absent tags column into no tags, not a single empty one', () => {
    expect(parseTags(undefined)).toEqual([])
    expect(parseTags('Tools,Files,,Vision, 128K ')).toEqual(['Tools', 'Files', 'Vision', '128K'])
  })
})

describe('the endpoints column', () => {
  it('parses the JSON array string the server stores', () => {
    expect(parseEndpoints('["openai","anthropic"]')).toEqual(['openai', 'anthropic'])
  })

  it('yields nothing for a blank, malformed or non-array column instead of throwing', () => {
    expect(parseEndpoints(undefined)).toEqual([])
    expect(parseEndpoints('')).toEqual([])
    expect(parseEndpoints('not json')).toEqual([])
    expect(parseEndpoints('{"a":1}')).toEqual([])
    expect(parseEndpoints('[1,"openai",null]')).toEqual(['openai'])
  })

  it('serialises an empty selection to "" so the gateway derives the list', () => {
    expect(serialiseEndpoints([])).toBe('')
    expect(serialiseEndpoints(['openai'])).toBe('["openai"]')
  })

  it('keeps an unrecognised stored endpoint in the offered options', () => {
    const options = endpointOptions(['openai', 'some-future-surface'])
    expect(options).toContain('some-future-surface')
    expect(options).toContain('openai')
    // The known list is not duplicated by a value that is already in it.
    expect(options.filter((entry) => entry === 'openai')).toHaveLength(1)
  })
})

describe('the form payload', () => {
  it('round-trips a row into the form and back into what the server binds', () => {
    const values = modelToForm(row)
    expect(values.vendor_id).toBe('1')
    expect(values.status).toBe(true)
    expect(values.sync_official).toBe(false)
    expect(values.endpoints).toEqual(['openai'])

    const payload = formToPayload(values)
    expect(payload).toEqual({
      description: row.description,
      endpoints: '["openai"]',
      icon: 'OpenAI',
      model_name: 'gpt-4o-mini',
      name_rule: 0,
      status: 1,
      sync_official: 0,
      tags: 'Tools,Files,Vision,128K',
      vendor_id: 1,
    })
  })

  it('sends vendor 0 when no vendor is selected, which is what clears the column', () => {
    const values: RegistryFormValues = { ...modelToForm(row), vendor_id: '' }
    expect(formToPayload(values).vendor_id).toBe(0)
  })

  it('refuses an empty name, which is the one check the server makes before writing', () => {
    expect(validateRegistryForm({ ...modelToForm(row), model_name: '   ' }).model_name)
      .toBe('A model name is required.')
    expect(validateRegistryForm(modelToForm(row))).toEqual({})
  })
})

describe('the coded columns', () => {
  it('labels the four match rules and leaves an unknown one unnamed', () => {
    expect(nameRuleLabel(0)).toBe('Exact')
    expect(nameRuleLabel(1)).toBe('Prefix')
    expect(nameRuleLabel(2)).toBe('Contains')
    expect(nameRuleLabel(3)).toBe('Suffix')
    expect(nameRuleLabel(9)).toBe('')
  })

  it('does not pretend an out-of-range status is one of the two known ones', () => {
    expect(modelStatusLabel(1)).toBe('Enabled')
    expect(modelStatusLabel(0)).toBe('Disabled')
    expect(modelStatusLabel(2)).toBe('')
  })

  it('names the two quota types the pricing cache produces', () => {
    expect(quotaTypeLabel(0)).toBe('Per token')
    expect(quotaTypeLabel(1)).toBe('Per request')
    expect(quotaTypeLabel(7)).toBe('')
  })
})

describe('the sync diff', () => {
  const conflicts: SyncConflict[] = [
    {
      fields: [
        { field: 'description', local: 'local desc', upstream: 'Omni-era GPT' },
        { field: 'vendor', local: '', upstream: 'OpenAI' },
      ],
      model_name: 'gpt-4o',
    },
    {
      fields: [{ field: 'name_rule', local: 0, upstream: 1 }],
      model_name: 'gpt-4o-mini',
    },
  ]

  it('derives the skipped set as MISSING_MODELS minus the preview offer', () => {
    const plan = buildSyncPlan(
      ['gpt-4o', 'gpt-4o-mini'],
      conflicts,
      ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'my-custom-model'],
    )
    expect(plan.create).toEqual(['gpt-4o', 'gpt-4o-mini'])
    expect(plan.skip).toEqual(['claude-3-5-sonnet-20241022', 'my-custom-model'])
  })

  it('reads the null arrays the empty preview actually returns', () => {
    const plan = buildSyncPlan(null, null, undefined)
    expect(plan.create).toEqual([])
    expect(plan.conflicts).toEqual([])
    expect(plan.skip).toEqual([])
  })

  it('builds an overwrite payload from only the ticked fields', () => {
    const selected = new Set([
      overwriteKey('gpt-4o', 'description'),
      overwriteKey('gpt-4o-mini', 'name_rule'),
    ])
    expect(buildOverwritePayload(conflicts, selected)).toEqual([
      { fields: ['description'], model_name: 'gpt-4o' },
      { fields: ['name_rule'], model_name: 'gpt-4o-mini' },
    ])
  })

  it('sends nothing at all when no field is ticked, so the apply only creates', () => {
    expect(buildOverwritePayload(conflicts, new Set())).toEqual([])
  })

  it('counts the untouched rows as REGISTRY_TOTAL minus the differing ones', () => {
    expect(untouchedCount(12, 2)).toBe(2 + 8)
    expect(untouchedCount(undefined, 2)).toBe(0)
    // The two numbers come from separate requests, so a stale total cannot go negative.
    expect(untouchedCount(1, 5)).toBe(0)
  })

  it('separates the coded conflict values from the plain text ones', () => {
    expect(isCodedConflictValue('name_rule', 1)).toBe(true)
    expect(isCodedConflictValue('status', 0)).toBe(true)
    expect(isCodedConflictValue('description', 'text')).toBe(false)
    expect(conflictValueText('description', 'local desc')).toBe('local desc')
    expect(conflictValueText('vendor', '')).toBe('')
    expect(conflictValueText('name_rule', 1)).toBe('Prefix')
  })

  it('labels the six fields the sync endpoint reads, and only those', () => {
    expect(conflictFieldLabel('vendor')).toBe('Vendor')
    expect(conflictFieldLabel('name_rule')).toBe('Match rule')
    expect(conflictFieldLabel('endpoints')).toBe('')
  })

  it('offers only the locales normalizeLocale can actually match', () => {
    // Its switch compares a lower-cased input against "zh-CN"/"zh-TW", so neither can
    // ever match and the request silently falls back to the default files.
    expect(isSyncLocale('en')).toBe(true)
    expect(isSyncLocale('ja')).toBe(true)
    expect(isSyncLocale('')).toBe(true)
    expect(isSyncLocale('zh-CN')).toBe(false)
    expect(isSyncLocale('zh-TW')).toBe(false)
  })
})
