import { describe, expect, it } from 'vitest'

import {
  ANY_GROUP,
  EMPTY_FILTERS,
  activeFilterCount,
  autoGroupChain,
  billingShape,
  endpointRoute,
  endpointTypeOptions,
  fallbackMultipliers,
  filterAndSortModels,
  formatModelPrice,
  formatMultiplier,
  matchesSearch,
  modelDetailParam,
  modelMultipliers,
  resolveGroupRatio,
  selectableGroups,
  tagOptions,
  tokenPricePerMillion,
  vendorOptions,
} from '@/features/pricing/pricing-presentation'
import type { PricingModel, PricingResponse, PricingVendor } from '@/lib/api/pricing'

/** Field for field a row a live `GET /api/pricing` returned from the seeded backend. */
const tokenModel: PricingModel = {
  model_name: 'gpt-4o-mini',
  vendor_id: 1,
  quota_type: 0,
  model_ratio: 0.075,
  model_price: 0,
  owner_by: '',
  completion_ratio: 4,
  cache_ratio: 0.5,
  enable_groups: ['default', 'vip'],
  supported_endpoint_types: ['openai'],
}

const imageModel: PricingModel = {
  model_name: 'gpt-image-1',
  vendor_id: 1,
  quota_type: 0,
  model_ratio: 2.5,
  model_price: 0,
  owner_by: '',
  completion_ratio: 8,
  image_ratio: 2,
  enable_groups: ['default'],
  supported_endpoint_types: ['image-generation', 'openai'],
}

const perRequestModel: PricingModel = {
  model_name: 'mj_imagine',
  quota_type: 1,
  model_ratio: 0,
  model_price: 0.1,
  owner_by: '',
  completion_ratio: 0,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
}

const tieredModel: PricingModel = {
  ...tokenModel,
  model_name: 'gemini-2.5-pro',
  billing_mode: 'tiered_expr',
  billing_expr: 'tier("base", p * 1.25 + c * 10)',
}

const vendors: PricingVendor[] = [
  { id: 1, name: 'OpenAI' },
  { id: 2, name: 'Anthropic' },
]

const groupRatio = { default: 1, vip: 2 }

describe('billing shapes', () => {
  it('reads the shape off quota_type, with billing_mode outranking it', () => {
    expect(billingShape(tokenModel)).toBe('per-token')
    expect(billingShape(perRequestModel)).toBe('per-request')
    expect(billingShape(tieredModel)).toBe('tiered')
    // A tiered row keeps quota_type 0; the expression still wins.
    expect(tieredModel.quota_type).toBe(0)
  })
})

describe('token prices', () => {
  it('prices input and output with the legacy model_ratio * 2 * groupRatio formula', () => {
    expect(tokenPricePerMillion(tokenModel, 'input', 1)).toBeCloseTo(0.15, 10)
    expect(tokenPricePerMillion(tokenModel, 'output', 1)).toBeCloseTo(0.6, 10)
    // The group ratio scales both sides.
    expect(tokenPricePerMillion(tokenModel, 'input', 2)).toBeCloseTo(0.3, 10)
    expect(tokenPricePerMillion(tokenModel, 'output', 2)).toBeCloseTo(1.2, 10)
  })

  it('returns undefined for a price row the model publishes no ratio for', () => {
    // cache_ratio 0.5 is present; create_cache_ratio and the audio ratios are not.
    expect(tokenPricePerMillion(tokenModel, 'cache', 1)).toBeCloseTo(0.075, 10)
    expect(tokenPricePerMillion(tokenModel, 'create_cache', 1)).toBeUndefined()
    expect(tokenPricePerMillion(tokenModel, 'audio_input', 1)).toBeUndefined()
    expect(tokenPricePerMillion(tokenModel, 'audio_output', 1)).toBeUndefined()
    expect(tokenPricePerMillion(tokenModel, 'image', 1)).toBeUndefined()
    expect(tokenPricePerMillion(imageModel, 'image', 1)).toBeCloseTo(10, 10)
  })

  it('refuses to quote a per-token rate for the other two shapes', () => {
    // model_ratio is 0 on a flat row and a fallback on a tiered one; neither may be printed.
    expect(tokenPricePerMillion(perRequestModel, 'input', 1)).toBeUndefined()
    expect(tokenPricePerMillion(tieredModel, 'input', 1)).toBeUndefined()
  })
})

describe('formatting', () => {
  it('keeps enough precision for a cheap model without inventing digits', () => {
    expect(formatModelPrice(0.15)).toBe('$0.15')
    expect(formatModelPrice(0.075)).toBe('$0.075')
    expect(formatModelPrice(0.1)).toBe('$0.10')
    expect(formatModelPrice(1200)).toBe('$1,200.00')
    expect(formatModelPrice(Number.NaN)).toBe('$0.00')
  })

  it('renders ratios as multipliers, never as currency', () => {
    expect(formatMultiplier(1)).toBe('×1')
    expect(formatMultiplier(0.5)).toBe('×0.5')
  })
})

describe('group resolution', () => {
  it('quotes the cheapest enabled group when none is picked', () => {
    expect(resolveGroupRatio(tokenModel, ANY_GROUP, groupRatio)).toEqual({
      ratio: 1,
      group: 'default',
      isBest: true,
    })
  })

  it('quotes the picked group, and nothing at all when the model is not in it', () => {
    expect(resolveGroupRatio(tokenModel, 'vip', groupRatio)).toEqual({
      ratio: 2,
      group: 'vip',
      isBest: false,
    })
    expect(resolveGroupRatio(perRequestModel, 'vip', groupRatio)).toBeUndefined()
  })

  it('reports no ratio when group_ratio publishes none for any enabled group', () => {
    expect(resolveGroupRatio(tokenModel, ANY_GROUP, {})).toBeUndefined()
  })

  it('keeps a valid zero ratio instead of falling back to 1', () => {
    const resolved = resolveGroupRatio(tokenModel, 'default', { default: 0, vip: 2 })
    expect(resolved?.ratio).toBe(0)
  })

  it('drops the empty and auto pseudo-groups from the selector', () => {
    const payload = {
      usable_group: { '': 'unnamed', auto: 'auto', default: '默认分组', vip: 'vip分组' },
      group_ratio: { default: 1, vip: 2 },
    } as unknown as PricingResponse
    expect(selectableGroups(payload)).toEqual([
      { name: 'default', description: '默认分组', ratio: 1 },
      { name: 'vip', description: 'vip分组', ratio: 2 },
    ])
  })
})

describe('filtering and sorting', () => {
  const models = [tokenModel, imageModel, perRequestModel, tieredModel]

  it('searches name, description, vendor and tags', () => {
    expect(matchesSearch(tokenModel, vendors, 'GPT-4O')).toBe(true)
    expect(matchesSearch(tokenModel, vendors, 'openai')).toBe(true)
    expect(matchesSearch(tokenModel, vendors, 'anthropic')).toBe(false)
    expect(matchesSearch({ ...tokenModel, tags: 'vision, fast' }, vendors, 'vision')).toBe(true)
    expect(matchesSearch(tokenModel, vendors, '   ')).toBe(true)
  })

  it('narrows by vendor, endpoint, tag, quota type and group', () => {
    const byEndpoint = filterAndSortModels(models, vendors, groupRatio, {
      ...EMPTY_FILTERS,
      endpointType: 'image-generation',
    })
    expect(byEndpoint.map((model) => model.model_name)).toEqual(['gpt-image-1'])

    const byQuota = filterAndSortModels(models, vendors, groupRatio, {
      ...EMPTY_FILTERS,
      quotaType: 'request',
    })
    expect(byQuota.map((model) => model.model_name)).toEqual(['mj_imagine'])

    const byGroup = filterAndSortModels(models, vendors, groupRatio, {
      ...EMPTY_FILTERS,
      group: 'vip',
    })
    expect(byGroup.map((model) => model.model_name)).toEqual(['gemini-2.5-pro', 'gpt-4o-mini'])

    const byVendor = filterAndSortModels(models, vendors, groupRatio, {
      ...EMPTY_FILTERS,
      vendor: '2',
    })
    expect(byVendor).toEqual([])
  })

  it('sorts unpriceable shapes last instead of ranking them on a meaningless number', () => {
    const ascending = filterAndSortModels(models, vendors, groupRatio, {
      ...EMPTY_FILTERS,
      sort: 'price-asc',
    })
    // gpt-4o-mini $0.15 then gpt-image-1 $5.00; the flat and tiered rows have no per-1M rate.
    expect(ascending.map((model) => model.model_name)).toEqual([
      'gpt-4o-mini',
      'gpt-image-1',
      'gemini-2.5-pro',
      'mj_imagine',
    ])

    const descending = filterAndSortModels(models, vendors, groupRatio, {
      ...EMPTY_FILTERS,
      sort: 'price-desc',
    })
    expect(descending.slice(0, 2).map((model) => model.model_name)).toEqual([
      'gpt-image-1',
      'gpt-4o-mini',
    ])
    expect(descending.slice(2).map((model) => model.model_name)).toEqual([
      'gemini-2.5-pro',
      'mj_imagine',
    ])
  })

  it('counts only the narrowing filters, not the search box', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...EMPTY_FILTERS, search: 'gpt' })).toBe(0)
    expect(activeFilterCount({ ...EMPTY_FILTERS, group: 'vip', quotaType: 'token' })).toBe(2)
  })

  it('offers only options the published rows actually carry', () => {
    expect(endpointTypeOptions(models)).toEqual(['image-generation', 'openai'])
    expect(tagOptions(models)).toEqual([])
    expect(tagOptions([{ ...tokenModel, tags: 'Vision, fast' }])).toEqual(['fast', 'vision'])
    expect(vendorOptions(models, vendors).map((vendor) => vendor.name)).toEqual(['OpenAI'])
  })
})

describe('model attributes', () => {
  it('lists the multipliers that actually price a token model', () => {
    expect(modelMultipliers(tokenModel).map((entry) => entry.id)).toEqual([
      'model',
      'completion',
      'cache',
    ])
  })

  it('lists no multipliers where they are meaningless, and marks tiered ones as fallbacks', () => {
    // quota_type 1 carries model_ratio 0 and completion_ratio 0, which price nothing.
    expect(modelMultipliers(perRequestModel)).toEqual([])
    expect(fallbackMultipliers(perRequestModel)).toEqual([])

    // A tiered row prices from its expression, so its ratios are reported separately.
    expect(modelMultipliers(tieredModel)).toEqual([])
    expect(fallbackMultipliers(tieredModel).map((entry) => entry.id)).toEqual([
      'model',
      'completion',
      'cache',
    ])
    expect(fallbackMultipliers(tokenModel)).toEqual([])
  })

  it('reads the endpoint route out of the untyped supported_endpoint map', () => {
    const catalog = {
      openai: { path: '/v1/chat/completions', method: 'POST' },
      pathless: { method: 'POST' },
      methodless: { path: '/v1/messages' },
      wrong: 'not-an-object',
    }
    expect(endpointRoute(catalog, 'openai')).toBe('POST /v1/chat/completions')
    expect(endpointRoute(catalog, 'methodless')).toBe('/v1/messages')
    expect(endpointRoute(catalog, 'pathless')).toBeUndefined()
    expect(endpointRoute(catalog, 'wrong')).toBeUndefined()
    expect(endpointRoute(catalog, 'missing')).toBeUndefined()
  })

  it('narrows the auto chain to the groups the model actually enables', () => {
    expect(autoGroupChain(tokenModel, ['vip', 'default'])).toEqual(['vip', 'default'])
    expect(autoGroupChain(perRequestModel, ['vip', 'default'])).toEqual(['default'])
    expect(autoGroupChain(tokenModel, [])).toEqual([])
  })

  it('encodes a model name that would otherwise break the detail path', () => {
    expect(modelDetailParam('qwen/qwen-max')).toBe('qwen%2Fqwen-max')
    expect(decodeURIComponent(modelDetailParam('qwen/qwen-max'))).toBe('qwen/qwen-max')
  })
})
