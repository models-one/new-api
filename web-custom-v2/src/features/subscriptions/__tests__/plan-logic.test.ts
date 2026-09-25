// @vitest-environment happy-dom

import '@/i18n/config'

import { t } from 'i18next'
import { describe, expect, it } from 'vitest'

import { planToDraft, type SubscriptionPlan } from '@/features/subscriptions/api'
import { EMPTY_PLAN_FORM, formValuesToDraft, planToFormValues, toQuotaUnits } from '@/features/subscriptions/plan-form'
import {
  formatPlanDuration,
  formatResetPeriod,
  formatSeconds,
  hasValidationError,
  validatePlanForm,
  wiredPaymentChannels,
} from '@/features/subscriptions/plan-format'

/** Field-for-field the row shape `GET /api/subscription/admin/plans` returns. */
function makePlan(overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan {
  return {
    id: 7,
    title: 'Starter',
    subtitle: 'For light usage',
    price_amount: 12.5,
    currency: 'USD',
    duration_unit: 'month',
    duration_value: 1,
    custom_seconds: 0,
    enabled: true,
    sort_order: 10,
    allow_balance_pay: true,
    allow_wallet_overflow: true,
    stripe_price_id: '',
    creem_product_id: '',
    waffo_pancake_product_id: '',
    max_purchase_per_user: 0,
    upgrade_group: 'vip',
    downgrade_group: '',
    total_amount: 5_000_000,
    quota_reset_period: 'monthly',
    quota_reset_custom_seconds: 0,
    created_at: 1_787_812_853,
    updated_at: 1_787_812_853,
    ...overrides,
  }
}

const QUOTA_PER_UNIT = 500_000

describe('duration and reset labels', () => {
  it('names the unit the plan was configured with', () => {
    expect(formatPlanDuration(makePlan({ duration_unit: 'year', duration_value: 2 }), t)).toBe('2 years')
    expect(formatPlanDuration(makePlan({ duration_unit: 'hour', duration_value: 6 }), t)).toBe('6 hours')
  })

  it('reduces a custom duration to its largest whole unit', () => {
    const plan = makePlan({ custom_seconds: 172_800, duration_unit: 'custom', duration_value: 0 })
    expect(formatPlanDuration(plan, t)).toBe('2 days')
  })

  it('flags a duration unit the backend would refuse at purchase time', () => {
    expect(formatPlanDuration(makePlan({ duration_unit: 'fortnight' }), t)).toBe('Unsupported duration unit')
  })

  it('folds every unrecognised reset period into "no reset", as NormalizeResetPeriod does', () => {
    expect(formatResetPeriod(makePlan({ quota_reset_period: 'never' }), t)).toBe('No reset')
    expect(formatResetPeriod(makePlan({ quota_reset_period: 'yearly' }), t)).toBe('No reset')
    expect(formatResetPeriod(makePlan({ quota_reset_period: 'weekly' }), t)).toBe('Weekly')
  })

  it('spells out a custom reset interval', () => {
    const plan = makePlan({ quota_reset_custom_seconds: 7200, quota_reset_period: 'custom' })
    expect(formatResetPeriod(plan, t)).toBe('Every 2 hours')
  })

  it('falls through minutes to bare seconds', () => {
    expect(formatSeconds(90, t)).toBe('1 minutes')
    expect(formatSeconds(45, t)).toBe('45 seconds')
  })
})

describe('wiredPaymentChannels', () => {
  it('counts a channel only when its product identifier is stored', () => {
    const plan = makePlan({ creem_product_id: '   ', stripe_price_id: 'price_123' })
    expect(wiredPaymentChannels(plan).map((channel) => channel.id)).toEqual(['stripe'])
  })

  it('reports no channel for a plan sold on balance alone', () => {
    expect(wiredPaymentChannels(makePlan())).toEqual([])
  })
})

describe('validatePlanForm', () => {
  it('reports only the missing title on an untouched create form', () => {
    const errors = validatePlanForm(EMPTY_PLAN_FORM, t)
    expect(errors.title).toBe('A plan title is required.')
    expect(Object.keys(errors)).toEqual(['title'])
  })

  it('accepts the create defaults once a title is typed', () => {
    expect(hasValidationError(validatePlanForm({ ...EMPTY_PLAN_FORM, title: 'Starter' }, t))).toBe(false)
  })

  it('requires a title', () => {
    const errors = validatePlanForm({ ...EMPTY_PLAN_FORM, title: '   ' }, t)
    expect(errors.title).toBe('A plan title is required.')
  })

  it('mirrors the server price ceiling of 9999', () => {
    expect(validatePlanForm({ ...EMPTY_PLAN_FORM, price_amount: '9999' }, t).price_amount).toBeUndefined()
    expect(validatePlanForm({ ...EMPTY_PLAN_FORM, price_amount: '10000' }, t).price_amount)
      .toBe('The server rejects a price above 9999.')
    expect(validatePlanForm({ ...EMPTY_PLAN_FORM, price_amount: '-1' }, t).price_amount)
      .toBe('Enter a price of 0 or more.')
  })

  it('demands seconds for a custom duration and ignores the plain validity field', () => {
    const errors = validatePlanForm(
      { ...EMPTY_PLAN_FORM, custom_seconds: '0', duration_unit: 'custom', duration_value: '0' },
      t,
    )
    expect(errors.custom_seconds).toBe('A custom duration needs more than 0 seconds.')
    expect(errors.duration_value).toBeUndefined()
  })

  it('demands a validity of at least one for every named unit', () => {
    const errors = validatePlanForm({ ...EMPTY_PLAN_FORM, duration_value: '0' }, t)
    expect(errors.duration_value).toBe('Enter a validity of 1 or more.')
  })

  it('demands seconds only for a custom reset cycle', () => {
    expect(validatePlanForm({ ...EMPTY_PLAN_FORM, quota_reset_period: 'monthly' }, t).quota_reset_custom_seconds)
      .toBeUndefined()
    expect(validatePlanForm({ ...EMPTY_PLAN_FORM, quota_reset_period: 'custom' }, t).quota_reset_custom_seconds)
      .toBe('A custom reset cycle needs more than 0 seconds.')
  })

  it('rejects negative quota and purchase limits', () => {
    const errors = validatePlanForm(
      { ...EMPTY_PLAN_FORM, max_purchase_per_user: '-1', total_amount: '-2' },
      t,
    )
    expect(errors.max_purchase_per_user).toBe('Enter a purchase limit of 0 or more.')
    expect(errors.total_amount).toBe('Enter a plan quota of 0 or more.')
  })
})

describe('form to payload conversion', () => {
  it('multiplies the entered amount by quota_per_unit', () => {
    expect(toQuotaUnits('20', QUOTA_PER_UNIT)).toBe(10_000_000)
    expect(toQuotaUnits('', QUOTA_PER_UNIT)).toBe(0)
  })

  it('round-trips a stored plan through the form without drift', () => {
    const plan = makePlan()
    const draft = formValuesToDraft(planToFormValues(plan, QUOTA_PER_UNIT), QUOTA_PER_UNIT)
    expect(draft.total_amount).toBe(plan.total_amount)
    expect(draft.price_amount).toBe(plan.price_amount)
    expect(draft.upgrade_group).toBe('vip')
    expect(draft.quota_reset_period).toBe('monthly')
  })

  it('zeroes the field the chosen unit does not use, matching the handler', () => {
    const custom = formValuesToDraft(
      { ...EMPTY_PLAN_FORM, custom_seconds: '3600', duration_unit: 'custom', duration_value: '9' },
      QUOTA_PER_UNIT,
    )
    expect(custom).toMatchObject({ custom_seconds: 3600, duration_value: 0 })

    const monthly = formValuesToDraft(
      { ...EMPTY_PLAN_FORM, custom_seconds: '3600', duration_unit: 'month', duration_value: '3' },
      QUOTA_PER_UNIT,
    )
    expect(monthly).toMatchObject({ custom_seconds: 0, duration_value: 3 })
  })

  it('drops the custom reset interval whenever the cycle is not custom', () => {
    const draft = formValuesToDraft(
      { ...EMPTY_PLAN_FORM, quota_reset_custom_seconds: '600', quota_reset_period: 'daily' },
      QUOTA_PER_UNIT,
    )
    expect(draft.quota_reset_custom_seconds).toBe(0)
  })

  it('pins the currency to USD, which the backend overwrites anyway', () => {
    expect(formValuesToDraft(EMPTY_PLAN_FORM, QUOTA_PER_UNIT).currency).toBe('USD')
  })
})

describe('planToDraft', () => {
  it('defaults the two nullable columns to true so a PUT cannot blank them', () => {
    const draft = planToDraft(makePlan({ allow_balance_pay: null, allow_wallet_overflow: null }))
    expect(draft.allow_balance_pay).toBe(true)
    expect(draft.allow_wallet_overflow).toBe(true)
  })

  it('normalises a duration unit and reset period the backend no longer accepts', () => {
    const draft = planToDraft(makePlan({ duration_unit: 'fortnight', quota_reset_period: 'yearly' }))
    expect(draft.duration_unit).toBe('month')
    expect(draft.quota_reset_period).toBe('never')
  })
})
