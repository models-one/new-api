import { describe, expect, it } from 'vitest'

import { formatTierCondition, parseTieredBilling } from '@/features/pricing/tiered-billing'
import type { PricingModel } from '@/lib/api/pricing'

const base: PricingModel = {
  model_name: 'gemini-2.5-pro',
  quota_type: 0,
  model_ratio: 1.25,
  model_price: 0,
  owner_by: '',
  completion_ratio: 8,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
}

function tiered(expression: string): PricingModel {
  return { ...base, billing_mode: 'tiered_expr', billing_expr: expression }
}

describe('parseTieredBilling', () => {
  it('reports nothing for a model that does not bill from an expression', () => {
    expect(parseTieredBilling(base)).toBeUndefined()
  })

  it('reads a single tier and its priced variables', () => {
    const parsed = parseTieredBilling(tiered('tier("base", p * 1.25 + c * 10)'))
    expect(parsed?.parsed).toBe(true)
    expect(parsed?.tiers).toHaveLength(1)
    expect(parsed?.tiers[0].label).toBe('base')
    expect(parsed?.tiers[0].conditions).toEqual([])
    expect(parsed?.tiers[0].prices.map((price) => [price.variable.key, price.perMillion])).toEqual([
      ['p', 1.25],
      ['c', 10],
    ])
  })

  it('reads every tier with its condition, and strips the version prefix', () => {
    const parsed = parseTieredBilling(
      tiered('v2:len > 200000 ? tier("long", p * 2.5 + c * 20) : tier("base", p * 1.25 + c * 10)'),
    )
    expect(parsed?.tiers.map((tier) => tier.label)).toEqual(['long', 'base'])
    expect(parsed?.tiers[0].conditions).toEqual([
      { variable: 'len', operator: '>', value: 200000 },
    ])
    expect(parsed?.tiers[1].conditions).toEqual([])
    expect(parsed?.tiers[0].prices[0].perMillion).toBe(2.5)
  })

  it('lists the cache and media variables the expression charges, skipping zero coefficients', () => {
    const parsed = parseTieredBilling(
      tiered('tier("base", p * 1.25 + c * 10 + cr * 0.125 + cc * 0 + img * 2)'),
    )
    expect(parsed?.tiers[0].prices.map((price) => price.variable.key)).toEqual([
      'p',
      'c',
      'cr',
      'img',
    ])
  })

  it('flags an expression it cannot read instead of guessing a rate', () => {
    const parsed = parseTieredBilling(tiered('some_unknown_form(p, c)'))
    expect(parsed?.parsed).toBe(false)
    expect(parsed?.tiers).toEqual([])
    expect(parsed?.rawExpression).toBe('some_unknown_form(p, c)')
  })

  it('handles a tiered row whose expression is missing altogether', () => {
    const parsed = parseTieredBilling({ ...base, billing_mode: 'tiered_expr' })
    expect(parsed?.parsed).toBe(false)
    expect(parsed?.rawExpression).toBe('')
  })

  it('warns when the expression multiplies the tier by a request-dependent factor', () => {
    const plain = parseTieredBilling(tiered('tier("base", p * 1.25 + c * 10)'))
    expect(plain?.hasConditionalMultipliers).toBe(false)

    const conditional = parseTieredBilling(
      tiered('tier("base", p * 1.25 + c * 10) * (len > 1000 ? 1.5 : 1)'),
    )
    expect(conditional?.hasConditionalMultipliers).toBe(true)
  })

  it('renders a condition the way the expression states it', () => {
    expect(formatTierCondition({ variable: 'len', operator: '>', value: 200000 })).toBe(
      'len > 200,000',
    )
    expect(formatTierCondition({ variable: 'p', operator: '<=', value: 128 })).toBe('p <= 128')
  })
})
