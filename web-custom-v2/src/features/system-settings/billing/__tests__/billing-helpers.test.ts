import { describe, expect, it } from 'vitest'

import { readPaymentCompliance } from '@/features/system-settings/billing/compliance'
import {
  applyGroupRows,
  buildGroupRows,
  dropEmptyGroups,
  findGroupOverrideProblem,
  findGroupRowProblem,
  parseAutoGroups,
  parseGroupOverrides,
  parseGroupVisibility,
  stringifyAutoGroups,
  stringifyGroupOverrides,
  stringifyGroupVisibility,
  type GroupRow,
} from '@/features/system-settings/billing/group-pricing'
import {
  draftFromEntry,
  flatExpression,
  formatPrice,
  parseFlatExpression,
  pricingFromDraft,
  ratioToUsdPerMillion,
  samePricing,
} from '@/features/system-settings/billing/model-pricing-draft'
import {
  checkJsonShape,
  formatJsonForEditor,
  isSameJson,
  parseNumberMap,
  parseStringMap,
  stringifyMap,
} from '@/features/system-settings/billing/option-json'
import {
  checkAmountDiscount,
  checkAmountOptions,
  checkPayMethods,
  parsePayMethods,
} from '@/features/system-settings/billing/pay-methods'
import {
  findUnpricedModels,
  isBasePriceMissing,
} from '@/features/system-settings/billing/unpriced-models'

/**
 * The pure half of the billing group.
 *
 * Every fixture here is a value the running dev server actually returned from
 * `GET /api/option/`, not an invented shape — the point of these tests is that the
 * coercion survives contact with the real payload, in which every value is a string.
 */

describe('JSON-valued option helpers', () => {
  it('drops entries that are not finite numbers instead of coercing them', () => {
    // A hand-edited row can hold anything. `{"gpt-4": "cheap"}` is a broken entry, and a
    // price of NaN is worse than no price at all.
    expect(parseNumberMap('{"a":1,"b":"cheap","c":null,"d":2.5}')).toEqual({ a: 1, d: 2.5 })
    expect(parseNumberMap('{"a":1e999}')).toEqual({})
  })

  it('answers an empty map for anything that is not a JSON object', () => {
    expect(parseNumberMap('garbage')).toEqual({})
    expect(parseNumberMap('[1,2,3]')).toEqual({})
    expect(parseNumberMap('')).toEqual({})
    expect(parseStringMap('null')).toEqual({})
  })

  it('sorts keys on the way out so a rewritten blob keeps a stable diff', () => {
    expect(stringifyMap({ vip: 2, default: 1, svip: 3 })).toBe('{"default":1,"svip":3,"vip":2}')
  })

  it('treats a reordered blob as unchanged, which is what stops spurious dirty keys', () => {
    // The section re-serialises all ten pricing blobs on every edit. Without this, a key
    // nobody touched would go dirty purely because this console sorts it — and four of
    // those keys corrupt their stored value when a write is refused.
    expect(isSameJson('{"a":1,"b":2}', '{"b":2,"a":1}')).toBe(true)
    expect(isSameJson('{"a":1}', '{"a":2}')).toBe(false)
    // Two unparseable blobs fall back to a text comparison rather than claiming equality.
    expect(isSameJson('nonsense', 'nonsense')).toBe(true)
    expect(isSameJson('nonsense', 'other nonsense')).toBe(false)
  })

  it('leaves an invalid blob exactly as typed rather than mangling it', () => {
    expect(formatJsonForEditor('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(formatJsonForEditor('{"a":')).toBe('{"a":')
  })

  it('separates a syntax error from a shape error, and calls an empty blob a syntax error', () => {
    expect(checkJsonShape('', 'object')).toBe('syntax')
    expect(checkJsonShape('{', 'object')).toBe('syntax')
    expect(checkJsonShape('[]', 'object')).toBe('shape')
    expect(checkJsonShape('{}', 'array')).toBe('shape')
    expect(checkJsonShape('{"gpt-4":"1"}', 'number-map')).toBe('shape')
    expect(checkJsonShape('{"gpt-4":1}', 'number-map')).toBeUndefined()
    expect(checkJsonShape('{"gpt-4":"tiered_expr"}', 'string-map')).toBeUndefined()
  })
})

describe('editing one model’s price', () => {
  const builtin = {
    configured: {},
    effective: { 'billing_setting.billing_expr': 'tier("base", p * 2.5 + c * 15)', 'billing_setting.billing_mode': 'tiered_expr' },
  }

  it('opens a model billed by a built-in expression on that expression, not on an empty form', () => {
    const draft = draftFromEntry(builtin)
    expect(draft.mode).toBe('expression')
    expect(draft.expression).toBe('tier("base", p * 2.5 + c * 15)')
  })

  it('prices a new model with an expression, not a deprecated mode', () => {
    expect(draftFromEntry(undefined).mode).toBe('expression')
    expect(draftFromEntry({ configured: {}, effective: {} }).mode).toBe('expression')
  })

  it('opens on the stored mode when something is stored, even if a built-in price exists', () => {
    const draft = draftFromEntry({ configured: { ModelPrice: 0.04 }, effective: { ModelPrice: 0.04 } })
    expect(draft.mode).toBe('per-request')
    expect(draft.modelPrice).toBe('0.04')
  })

  it('stores an expression with its mode, and keeps legacy ratios so the model can switch back', () => {
    const draft = { ...draftFromEntry({ configured: { ModelRatio: 1.25, CompletionRatio: 8 } }), expression: 'tier("base", p * 2.5)', mode: 'expression' as const }
    expect(pricingFromDraft(draft, {}).values).toEqual({
      'billing_setting.billing_expr': 'tier("base", p * 2.5)',
      'billing_setting.billing_mode': 'tiered_expr',
      CompletionRatio: 8,
      ModelRatio: 1.25,
    })
  })

  it('drops the ratios a fixed price per request would ignore', () => {
    const draft = { ...draftFromEntry({ configured: { ModelRatio: 1.25 } }), mode: 'per-request' as const, modelPrice: '0.02' }
    expect(pricingFromDraft(draft, {}).values).toEqual({ 'billing_setting.billing_mode': 'ratio', ModelPrice: 0.02 })
  })

  it('carries the stored plugin prices over, because a save replaces the model’s pricing as a whole', () => {
    const configured = { 'billing_setting.plugin_billing_expr': { kling: 'tier("base", u("units") * 0.14)' }, ModelRatio: 1 }
    const draft = { ...draftFromEntry({ configured }), ratios: { ...draftFromEntry({ configured }).ratios, ModelRatio: '2' } }
    expect(pricingFromDraft(draft, configured).values).toEqual({
      'billing_setting.billing_mode': 'ratio',
      'billing_setting.plugin_billing_expr': { kling: 'tier("base", u("units") * 0.14)' },
      ModelRatio: 2,
    })
  })

  it('names the field that blocks a save', () => {
    const base = draftFromEntry(undefined)
    expect(pricingFromDraft({ ...base, mode: 'expression', expression: '  ' }, {}).problem).toEqual({ field: 'expression', reason: 'empty' })
    expect(pricingFromDraft({ ...base, mode: 'per-token' }, {}).problem).toEqual({ field: 'ModelRatio', reason: 'empty' })
    // A negative price would turn a charge into a credit.
    expect(pricingFromDraft({ ...base, mode: 'per-request', modelPrice: '-1' }, {}).problem).toEqual({ field: 'modelPrice', reason: 'invalid' })
    expect(pricingFromDraft({ ...base, ratios: { ...base.ratios, ModelRatio: '1', CacheRatio: 'abc' } }, {}).problem).toEqual({ field: 'CacheRatio', reason: 'invalid' })
  })

  it('compares prices by content, so reordered keys are not a change', () => {
    expect(samePricing({ CompletionRatio: 2, ModelRatio: 1 }, { ModelRatio: 1, CompletionRatio: 2 })).toBe(true)
    expect(samePricing({ ModelRatio: 1 }, { ModelRatio: 1.5 })).toBe(false)
  })
})

describe('flat token prices as an expression', () => {
  it('writes and reads the one-tier shape most models need', () => {
    const expression = flatExpression({ cacheRead: '0.25', input: '2.5', output: '15' })
    expect(expression).toBe('tier("base", p * 2.5 + c * 15 + cr * 0.25)')
    expect(parseFlatExpression(expression ?? '')).toEqual({ cacheRead: '0.25', input: '2.5', output: '15' })
    expect(flatExpression({ cacheRead: '', input: '1', output: '4' })).toBe('tier("base", p * 1 + c * 4)')
  })

  it('leaves anything with tiers, conditions, rules or other variables to the text editor', () => {
    expect(parseFlatExpression('len <= 200000 ? tier("short", p * 3 + c * 15) : tier("long", p * 6 + c * 22.5)')).toBeNull()
    expect(parseFlatExpression('tier("base", p * 5 + c * 25)|||when(header("x") has "y") * 6')).toBeNull()
    expect(parseFlatExpression('tier("base", p * 2 + c * 8 + img * 2.5)')).toBeNull()
    expect(parseFlatExpression('tier("request", fixed(0.01))')).toBeNull()
  })

  it('needs both an input and an output price', () => {
    expect(flatExpression({ cacheRead: '', input: '2', output: '' })).toBeNull()
    expect(flatExpression({ cacheRead: '', input: 'x', output: '1' })).toBeNull()
  })

  it('shows a legacy ratio in USD per 1M tokens at the deployment’s quota unit', () => {
    // A model ratio of 1 is $2 per 1M input tokens at the default 500,000 quota per dollar.
    expect(formatPrice(ratioToUsdPerMillion(1, 500_000))).toBe('2')
    expect(formatPrice(ratioToUsdPerMillion(0.075, 500_000))).toBe('0.15')
    // A ratio converted from another currency is shown to six significant digits.
    expect(formatPrice(ratioToUsdPerMillion(0.273972602739726, 500_000))).toBe('0.547945')
  })
})

describe('the pay-method contract', () => {
  it('rejects a numeric min_topup — the write that is refused AFTER the list is destroyed', () => {
    // Verified live: PUT PayMethods with min_topup:50 answers
    // "json: cannot unmarshal number into Go value of type string", and the raw text has
    // ALREADY replaced the stored list. So this is a blocking error, not a warning.
    expect(checkPayMethods('[{"name":"probe","type":"alipay","min_topup":50}]')).toBe('non-string-value')
    expect(checkPayMethods('[{"name":"probe","type":"alipay","min_topup":"50"}]')).toBeUndefined()
  })

  it('accepts the list the dev server actually stores', () => {
    const live = JSON.stringify([
      { icon: 'SiAlipay', name: '支付宝', type: 'alipay' },
      { icon: 'SiWechat', name: '微信', type: 'wxpay' },
      { icon: 'LuCreditCard', min_topup: '50', name: '自定义1', type: 'custom1' },
    ])
    expect(checkPayMethods(live)).toBeUndefined()
    expect(parsePayMethods(live).map((entry) => entry.type)).toEqual(['alipay', 'wxpay', 'custom1'])
    expect(parsePayMethods(live)[2].min_topup).toBe('50')
  })

  it('names each structural problem separately so the message can be specific', () => {
    expect(checkPayMethods('nonsense')).toBe('syntax')
    expect(checkPayMethods('{}')).toBe('not-array')
    expect(checkPayMethods('["alipay"]')).toBe('not-object')
    expect(checkPayMethods('[{"name":"a"}]')).toBe('missing-type')
    expect(checkPayMethods('[{"type":"alipay","name":"  "}]')).toBe('missing-name')
    expect(checkPayMethods('[{"type":"alipay","name":"a"},{"type":"alipay","name":"b"}]')).toBe(
      'duplicate-type',
    )
  })

  it('skips an unusable entry when reading for display rather than throwing', () => {
    expect(parsePayMethods('[{"type":"alipay"},null,42,{"type":"x","name":"X"}]')).toEqual([
      { name: 'X', type: 'x' },
    ])
  })

  it('holds the amount options to whole numbers above zero, as the Go []int demands', () => {
    expect(checkAmountOptions('[10,20,50,100,200,500]')).toBeUndefined()
    expect(checkAmountOptions('garbage')).toBe('syntax')
    expect(checkAmountOptions('{}')).toBe('not-array')
    expect(checkAmountOptions('[10,20.5]')).toBe('not-integer')
    expect(checkAmountOptions('[0]')).toBe('not-integer')
  })

  it('holds the discount map to integer keys and positive numbers', () => {
    expect(checkAmountDiscount('{}')).toBeUndefined()
    expect(checkAmountDiscount('{"100":0.9}')).toBeUndefined()
    expect(checkAmountDiscount('[]')).toBe('not-object')
    expect(checkAmountDiscount('{"a lot":0.9}')).toBe('bad-key')
    expect(checkAmountDiscount('{"100":"0.9"}')).toBe('bad-value')
    expect(checkAmountDiscount('{"100":0}')).toBe('bad-value')
  })
})

describe('joining the three pricing keys into one row per group', () => {
  const live = {
    GroupRatio: '{"default":1,"svip":1,"vip":1}',
    TopupGroupRatio: '{"default":1,"svip":1,"vip":1}',
    UserUsableGroups: '{"default":"默认分组","vip":"vip分组"}',
  }

  it('names a group that appears in any one of the three keys', () => {
    expect(buildGroupRows(live).map((row) => row.name)).toEqual(['default', 'svip', 'vip'])
  })

  it('distinguishes “selectable with a label” from “priced but hidden”', () => {
    const rows = Object.fromEntries(buildGroupRows(live).map((row) => [row.name, row]))
    expect(rows.vip.selectable).toBe(true)
    expect(rows.vip.label).toBe('vip分组')
    // svip is priced but not offered — a real misconfiguration the four separate legacy
    // editors made easy to create and hard to see.
    expect(rows.svip.selectable).toBe(false)
    expect(rows.svip.label).toBeNull()
  })

  it('keeps a missing multiplier null rather than inventing the server default of 1', () => {
    const rows = buildGroupRows({ ...live, TopupGroupRatio: '{"default":1}' })
    expect(rows.find((row) => row.name === 'vip')?.topUpRatio).toBeNull()
  })

  it('round-trips a row list back through all three keys', () => {
    const rows = buildGroupRows(live)
    const rewritten = applyGroupRows(rows)
    expect(buildGroupRows(rewritten)).toEqual(rows)
  })

  it('drops a group from every key when its row is removed', () => {
    const rows = buildGroupRows(live).filter((row) => row.name !== 'svip')
    const rewritten = applyGroupRows(rows)
    expect(parseNumberMap(rewritten.GroupRatio)).toEqual({ default: 1, vip: 1 })
    expect(parseNumberMap(rewritten.TopupGroupRatio)).toEqual({ default: 1, vip: 1 })
  })

  it('falls back to the group name when a selectable group has no label', () => {
    const row: GroupRow = {
      billingRatio: 1,
      label: null,
      name: 'enterprise',
      selectable: true,
      topUpRatio: 1,
    }
    expect(JSON.parse(applyGroupRows([row]).UserUsableGroups)).toEqual({ enterprise: 'enterprise' })
  })

  it('mirrors the server’s own rejection of a negative ratio, per row', () => {
    // ratio_setting.CheckGroupRatio runs BEFORE the value is stored, so a bad GroupRatio
    // is refused cleanly — but the operator should see which row caused it.
    const base = buildGroupRows(live)[0]
    expect(findGroupRowProblem(base)).toBeUndefined()
    expect(findGroupRowProblem({ ...base, billingRatio: -1 })).toBe('billing')
    expect(findGroupRowProblem({ ...base, topUpRatio: -0.5 })).toBe('topup')
    expect(findGroupRowProblem({ ...base, name: '  ' })).toBe('name')
    // Zero is a legitimate free group, not an error.
    expect(findGroupRowProblem({ ...base, billingRatio: 0 })).toBeUndefined()
  })
})


describe('the keys that refer to groups by name', () => {
  it('keeps the auto groups in the order they are tried, dropping a repeated name', () => {
    // The server walks this list front to back, so sorting it would change which group a
    // request tries first.
    const groups = parseAutoGroups('["vip","default","vip","svip"]')
    expect(groups).toEqual(['vip', 'default', 'svip'])
    expect(stringifyAutoGroups(groups)).toBe('["vip","default","svip"]')
  })

  it('reads special ratio rules per user group and writes them back unchanged', () => {
    const raw = '{"vip":{"premium":0.3,"default":0.8},"svip":{}}'
    const overrides = parseGroupOverrides(raw)
    expect(overrides).toEqual([
      { rules: [{ group: 'premium', ratio: 0.3 }, { group: 'default', ratio: 0.8 }], userGroup: 'vip' },
      { rules: [], userGroup: 'svip' },
    ])
    expect(stringifyGroupOverrides(overrides)).toBe(raw)
  })

  it('refuses a special ratio that is negative, empty or names no group', () => {
    const rule = (group: string, ratio: number | null) => [{ rules: [{ group, ratio }], userGroup: 'vip' }]
    expect(findGroupOverrideProblem(rule('premium', 0))).toBeUndefined()
    // A negative ratio would turn a charge into a credit, and the server does not check this key.
    expect(findGroupOverrideProblem(rule('premium', -0.5))).toEqual({ group: 'premium', userGroup: 'vip' })
    expect(findGroupOverrideProblem(rule('premium', null))).toEqual({ group: 'premium', userGroup: 'vip' })
    expect(findGroupOverrideProblem(rule('', 1))).toEqual({ group: '', userGroup: 'vip' })
  })

  it('reads shown and hidden groups, and keeps the stored key form of an untouched rule', () => {
    const raw = '{"vip":{"+:premium":"Premium plan","-:default":"remove","special":"Special group"}}'
    const visibility = parseGroupVisibility(raw)
    expect(visibility).toEqual([
      {
        rules: [
          { description: 'Premium plan', group: 'premium', visible: true },
          { description: 'remove', group: 'default', visible: false },
          { bare: true, description: 'Special group', group: 'special', visible: true },
        ],
        userGroup: 'vip',
      },
    ])
    expect(stringifyGroupVisibility(visibility)).toBe(raw)
  })

  it('drops a user group that holds no rule when the blob is saved', () => {
    expect(dropEmptyGroups('{"vip":{"premium":0.3},"svip":{}}')).toBe('{"vip":{"premium":0.3}}')
    const untouched = '{ "vip": { "premium": 0.3 } }'
    expect(dropEmptyGroups(untouched)).toBe(untouched)
  })
})

describe('reading the payment compliance record', () => {
  it('reads the string “true” as accepted, and the string “false” as not accepted', () => {
    // The whole payload is strings. `if (options.compliance_confirmed)` would read
    // 'false' as accepted and quietly unlock the invitation rewards.
    expect(
      readPaymentCompliance({
        'payment_setting.compliance_confirmed': 'true',
        'payment_setting.compliance_terms_version': 'v1',
      }).confirmed,
    ).toBe(true)

    expect(
      readPaymentCompliance({
        'payment_setting.compliance_confirmed': 'false',
        'payment_setting.compliance_terms_version': 'v1',
      }).confirmed,
    ).toBe(false)
  })

  it('treats an accepted-but-stale terms version as not accepted, and says which it was', () => {
    const stale = readPaymentCompliance({
      'payment_setting.compliance_confirmed': 'true',
      'payment_setting.compliance_terms_version': 'v0',
    })
    expect(stale.confirmed).toBe(false)
    expect(stale.flagged).toBe(true)
    expect(stale.termsVersion).toBe('v0')
  })

  it('reads the audit stamp the dev server holds, with the timestamp in unix seconds', () => {
    const record = readPaymentCompliance({
      'payment_setting.compliance_confirmed': 'true',
      'payment_setting.compliance_confirmed_at': '1788047578',
      'payment_setting.compliance_confirmed_by': '1',
      'payment_setting.compliance_confirmed_ip': '127.0.0.1',
      'payment_setting.compliance_terms_version': 'v1',
    })
    expect(record.confirmedAt).toBe(1_788_047_578)
    expect(record.confirmedBy).toBe(1)
    expect(record.confirmedIp).toBe('127.0.0.1')
  })

  it('reads an option map that has none of the five keys as unconfirmed', () => {
    const missing = readPaymentCompliance({})
    expect(missing.confirmed).toBe(false)
    expect(missing.flagged).toBe(false)
    expect(missing.confirmedAt).toBe(0)
  })

  it('does not throw while the payload is still loading', () => {
    expect(readPaymentCompliance(undefined).confirmed).toBe(false)
  })
})

describe('finding servable models that have no base price', () => {
  const entry = (model_name: string, effective: Record<string, unknown>) => ({ configured: {}, effective, model_name })
  const entries = [
    entry('priced-model', { ModelPrice: 0.04 }),
    entry('ratio-model', { ModelRatio: 15 }),
    entry('tiered-model', { 'billing_setting.billing_expr': 'tier("base", p * 3)', 'billing_setting.billing_mode': 'tiered_expr' }),
    entry('cache-only-model', { CacheRatio: 0.1 }),
  ]

  it('counts a fixed price, a model ratio and an expression as priced, built-in ones included', () => {
    expect(findUnpricedModels(['priced-model', 'ratio-model', 'tiered-model'], entries)).toEqual([])
  })

  it('does not accept a cache ratio as pricing, because it multiplies a base that is missing', () => {
    // relay/helper/price.go refuses the request outright when GetModelRatio misses; the
    // other ratios never come into it.
    expect(findUnpricedModels(['cache-only-model'], entries)).toEqual(['cache-only-model'])
  })

  it('lists a servable model that the pricing has never heard of', () => {
    expect(findUnpricedModels(['brand-new-model'], entries)).toEqual(['brand-new-model'])
  })

  it('sorts and de-duplicates, because a name can be served by several channels', () => {
    expect(findUnpricedModels(['zeta', 'alpha', 'zeta'], entries)).toEqual(['alpha', 'zeta'])
  })

  it('treats an absent entry as missing rather than throwing', () => {
    expect(isBasePriceMissing(undefined)).toBe(true)
  })

  it('ignores a model that is priced but not servable', () => {
    // The pricing table can hold a model no channel offers. That is not an incident.
    expect(findUnpricedModels([], entries)).toEqual([])
  })
})
