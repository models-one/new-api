import { describe, expect, it } from 'vitest'

import { readPaymentCompliance } from '@/features/system-settings/billing/compliance'
import {
  applyGroupRows,
  buildGroupRows,
  findGroupRowProblem,
  type GroupRow,
} from '@/features/system-settings/billing/group-pricing'
import {
  applyModelEdit,
  buildModelRows,
  checkExpression,
  countTiers,
  removeModels,
  toEdit,
  type ModelPricingMaps,
} from '@/features/system-settings/billing/model-pricing'
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

/** The ten pricing maps, trimmed from the live payload. */
function pricingMaps(overrides: Partial<ModelPricingMaps> = {}): ModelPricingMaps {
  return {
    AudioCompletionRatio: '{}',
    AudioRatio: '{}',
    'billing_setting.billing_expr': '{}',
    'billing_setting.billing_mode': '{}',
    CacheRatio: '{}',
    CompletionRatio: '{}',
    CreateCacheRatio: '{}',
    ImageRatio: '{}',
    ModelPrice: '{}',
    ModelRatio: '{}',
    ...overrides,
  }
}

describe('joining the ten pricing maps into one row per model', () => {
  it('names a model that appears in any one of the maps', () => {
    const rows = buildModelRows(
      pricingMaps({
        AudioRatio: '{"gpt-4o-audio-preview":16}',
        ModelRatio: '{"BLOOMZ-7B":0.273972602739726}',
      }),
    )
    expect(rows.map((row) => row.name)).toEqual(['BLOOMZ-7B', 'gpt-4o-audio-preview'])
  })

  it('resolves the three modes in the precedence the gateway itself applies', () => {
    // relay/helper/price.go: an expression beats a fixed price, which beats the ratios.
    const rows = buildModelRows(
      pricingMaps({
        'billing_setting.billing_expr': '{"claude-4":"tier(\\"base\\", p * 3 + c * 15)"}',
        'billing_setting.billing_mode': '{"claude-4":"tiered_expr"}',
        ModelPrice: '{"dall-e-3":0.04,"claude-4":9}',
        ModelRatio: '{"gpt-4":15,"claude-4":1}',
      }),
    )
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]))

    expect(byName['claude-4'].mode).toBe('tiered_expr')
    expect(byName['dall-e-3'].mode).toBe('per-request')
    expect(byName['gpt-4'].mode).toBe('per-token')
  })

  it('flags the ambiguous middle: a fixed price sitting on top of per-token ratios', () => {
    const rows = buildModelRows(
      pricingMaps({ CompletionRatio: '{"gpt-4-all":2}', ModelPrice: '{"gpt-4-all":0.1}' }),
    )
    expect(rows[0].hasConflict).toBe(true)
    expect(rows[0].mode).toBe('per-request')
  })

  it('does not call a model with only ratios a conflict', () => {
    const rows = buildModelRows(pricingMaps({ ModelRatio: '{"gpt-4":15}' }))
    expect(rows[0].hasConflict).toBe(false)
  })

  it('keeps “no entry” distinct from a ratio of zero', () => {
    const rows = buildModelRows(pricingMaps({ ModelPrice: '{"mj_custom_zoom":0}' }))
    expect(rows[0].price).toBe(0)
    expect(rows[0].ratio).toBeNull()
  })

  it('hides an expression belonging to a model whose mode is not tiered', () => {
    // The stored expression outlives a mode change. Showing it would suggest it is in
    // force when the gateway is ignoring it.
    const rows = buildModelRows(
      pricingMaps({
        'billing_setting.billing_expr': '{"gpt-4":"tier(\\"base\\", p * 1)"}',
        ModelRatio: '{"gpt-4":15}',
      }),
    )
    expect(rows[0].mode).toBe('per-token')
    expect(rows[0].expr).toBe('')
  })
})

describe('folding an edited model back into the ten maps', () => {
  it('clears the keys the chosen mode does not use, so a stale price cannot keep billing', () => {
    // This is the mispricing guard. relay/helper/price.go prefers a fixed ModelPrice over
    // every ratio, so leaving one behind when the operator picks per-token would keep the
    // model billed per request while the UI showed ratios.
    const before = pricingMaps({
      CompletionRatio: '{"gpt-4":2}',
      ModelPrice: '{"gpt-4":0.5}',
      ModelRatio: '{"gpt-4":15}',
    })

    const after = applyModelEdit(before, {
      ...toEdit(buildModelRows(before)[0]),
      completionRatio: 2,
      mode: 'per-token',
      ratio: 15,
    })

    expect(parseNumberMap(after.ModelPrice)).toEqual({})
    expect(parseNumberMap(after.ModelRatio)).toEqual({ 'gpt-4': 15 })
    expect(buildModelRows(after)[0].mode).toBe('per-token')
  })

  it('clears every ratio when the operator switches a model to a flat per-request price', () => {
    const before = pricingMaps({ CacheRatio: '{"gpt-4":0.1}', ModelRatio: '{"gpt-4":15}' })

    const after = applyModelEdit(before, {
      ...toEdit(buildModelRows(before)[0]),
      mode: 'per-request',
      price: 0.04,
    })

    expect(parseNumberMap(after.ModelRatio)).toEqual({})
    expect(parseNumberMap(after.CacheRatio)).toEqual({})
    expect(parseNumberMap(after.ModelPrice)).toEqual({ 'gpt-4': 0.04 })
  })

  it('clears the ratios and the price when the model moves to an expression', () => {
    const before = pricingMaps({ ModelPrice: '{"gpt-4":0.5}', ModelRatio: '{"gpt-4":15}' })

    const after = applyModelEdit(before, {
      ...toEdit(buildModelRows(before)[0]),
      expr: 'tier("base", p * 3 + c * 15)',
      mode: 'tiered_expr',
    })

    expect(parseNumberMap(after.ModelPrice)).toEqual({})
    expect(parseNumberMap(after.ModelRatio)).toEqual({})
    expect(parseStringMap(after['billing_setting.billing_mode'])).toEqual({ 'gpt-4': 'tiered_expr' })
    expect(parseStringMap(after['billing_setting.billing_expr'])).toEqual({
      'gpt-4': 'tier("base", p * 3 + c * 15)',
    })
  })

  it('leaves every other model alone', () => {
    const before = pricingMaps({ ModelRatio: '{"gpt-4":15,"gpt-3.5":1}' })
    const target = buildModelRows(before).find((row) => row.name === 'gpt-4')
    expect(target).toBeDefined()
    if (target === undefined) return

    const after = applyModelEdit(before, { ...toEdit(target), ratio: 30 })
    expect(parseNumberMap(after.ModelRatio)).toEqual({ 'gpt-3.5': 1, 'gpt-4': 30 })
  })

  it('refuses a blank model name rather than writing an empty-string key', () => {
    const before = pricingMaps({ ModelRatio: '{"gpt-4":15}' })
    expect(applyModelEdit(before, { ...toEdit(buildModelRows(before)[0]), name: '   ' })).toBe(before)
  })

  it('removes every trace of a model from all ten maps', () => {
    const before = pricingMaps({
      'billing_setting.billing_expr': '{"a":"tier(\\"x\\", p)"}',
      'billing_setting.billing_mode': '{"a":"tiered_expr"}',
      CacheRatio: '{"a":0.1,"b":0.2}',
      ModelRatio: '{"a":1,"b":2}',
    })

    const after = removeModels(before, ['a'])

    expect(buildModelRows(after).map((row) => row.name)).toEqual(['b'])
    expect(parseStringMap(after['billing_setting.billing_mode'])).toEqual({})
    expect(parseStringMap(after['billing_setting.billing_expr'])).toEqual({})
    expect(parseNumberMap(after.CacheRatio)).toEqual({ b: 0.2 })
  })

  it('is a no-op when nothing is selected', () => {
    const before = pricingMaps({ ModelRatio: '{"a":1}' })
    expect(removeModels(before, [])).toBe(before)
  })
})

describe('the billing-expression structural check', () => {
  // PUT /api/option/ does not validate billing_setting.billing_expr at all — verified
  // live, the literal text "not json at all" was accepted and stored. These checks are
  // the only thing between a typo and mispriced live traffic, and they are deliberately
  // structural rather than pretending to be the compiler in pkg/billingexpr.
  it('accepts the multi-tier form documented in pkg/billingexpr/expr.md', () => {
    const expr = [
      'len <= 200000',
      '  ? tier("standard", p * 3 + c * 15 + cr * 0.3 + cc * 3.75 + cc1h * 6)',
      '  : tier("long_context", p * 6 + c * 22.5 + cr * 0.6 + cc * 7.5 + cc1h * 12)',
    ].join('\n')
    expect(checkExpression(expr)).toBeUndefined()
    expect(countTiers(expr)).toBe(2)
  })

  it('accepts a request-rule expression appended after the ||| separator', () => {
    expect(
      checkExpression('tier("base", p * 5 + c * 25)|||when(header("anthropic-beta") has "fast-mode") * 6'),
    ).toBeUndefined()
  })

  it('rejects an empty expression, which the server would store and then fail on at bill time', () => {
    expect(checkExpression('   ')).toBe('empty')
  })

  it('rejects unbalanced brackets and an unterminated string', () => {
    expect(checkExpression('tier("base", p * 3')).toBe('unbalanced')
    expect(checkExpression('tier("base", p * 3))')).toBe('unbalanced')
    expect(checkExpression('tier("base, p * 3)')).toBe('unbalanced')
  })

  it('does not count a bracket that lives inside a string literal', () => {
    expect(checkExpression('tier("base)", p * 3)')).toBeUndefined()
  })

  it('rejects an expression with no tier() wrapper, because the matched tier is logged', () => {
    expect(checkExpression('p * 3 + c * 15')).toBe('no-tier')
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

describe('joining the four group keys into one row per group', () => {
  const live = {
    AutoGroups: '["default"]',
    GroupRatio: '{"default":1,"svip":1,"vip":1}',
    TopupGroupRatio: '{"default":1,"svip":1,"vip":1}',
    UserUsableGroups: '{"default":"默认分组","vip":"vip分组"}',
  }

  it('names a group that appears in any one of the four keys', () => {
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
    expect(rows.default.automatic).toBe(true)
    expect(rows.svip.automatic).toBe(false)
  })

  it('keeps a missing multiplier null rather than inventing the server default of 1', () => {
    const rows = buildGroupRows({ ...live, TopupGroupRatio: '{"default":1}' })
    expect(rows.find((row) => row.name === 'vip')?.topUpRatio).toBeNull()
  })

  it('round-trips a row list back through all four keys', () => {
    const rows = buildGroupRows(live)
    const rewritten = applyGroupRows(rows)
    expect(buildGroupRows(rewritten)).toEqual(rows)
    expect(rewritten.AutoGroups).toBe('["default"]')
  })

  it('drops a group from all four keys when its row is removed', () => {
    const rows = buildGroupRows(live).filter((row) => row.name !== 'svip')
    const rewritten = applyGroupRows(rows)
    expect(parseNumberMap(rewritten.GroupRatio)).toEqual({ default: 1, vip: 1 })
    expect(parseNumberMap(rewritten.TopupGroupRatio)).toEqual({ default: 1, vip: 1 })
  })

  it('falls back to the group name when a selectable group has no label', () => {
    const row: GroupRow = {
      automatic: false,
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
  const maps: ModelPricingMaps = {
    AudioCompletionRatio: '{}',
    AudioRatio: '{}',
    'billing_setting.billing_expr': '{"tiered-model":"tier(\\"base\\", p * 3)"}',
    'billing_setting.billing_mode': '{"tiered-model":"tiered_expr"}',
    CacheRatio: '{"cache-only-model":0.1}',
    CompletionRatio: '{}',
    CreateCacheRatio: '{}',
    ImageRatio: '{}',
    ModelPrice: '{"priced-model":0.04}',
    ModelRatio: '{"ratio-model":15}',
  }

  const rows = buildModelRows(maps)

  it('counts a fixed price, a model ratio and an expression as priced', () => {
    expect(findUnpricedModels(['priced-model', 'ratio-model', 'tiered-model'], rows)).toEqual([])
  })

  it('does not accept a cache ratio as pricing, because it multiplies a base that is missing', () => {
    // relay/helper/price.go refuses the request outright when GetModelRatio misses; the
    // other ratios never come into it.
    expect(findUnpricedModels(['cache-only-model'], rows)).toEqual(['cache-only-model'])
  })

  it('lists a servable model that the pricing keys have never heard of', () => {
    expect(findUnpricedModels(['brand-new-model'], rows)).toEqual(['brand-new-model'])
  })

  it('sorts and de-duplicates, because a name can be served by several channels', () => {
    expect(findUnpricedModels(['zeta', 'alpha', 'zeta'], rows)).toEqual(['alpha', 'zeta'])
  })

  it('treats an absent row as missing rather than throwing', () => {
    expect(isBasePriceMissing(undefined)).toBe(true)
  })

  it('ignores a model that is priced but not servable', () => {
    // The pricing table can hold a model no channel offers. That is not an incident.
    expect(findUnpricedModels([], rows)).toEqual([])
  })
})
