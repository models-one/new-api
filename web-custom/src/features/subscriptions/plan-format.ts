import type { TFunction } from 'i18next'

import type { PlanDurationUnit, PlanResetPeriod, SubscriptionPlan } from '@/features/subscriptions/api'

export const SECONDS_PER_MINUTE = 60
export const SECONDS_PER_HOUR = 3600
export const SECONDS_PER_DAY = 86_400

/**
 * Renders a raw second count as the largest whole unit that divides it, the way the
 * legacy console did. Derived client-side: the backend stores and bills on the raw
 * seconds, and this is only a label.
 */
export function formatSeconds(seconds: number, t: TFunction): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.trunc(seconds)) : 0
  if (value >= SECONDS_PER_DAY) {
    return t('{{value}} days', { value: Math.floor(value / SECONDS_PER_DAY) })
  }
  if (value >= SECONDS_PER_HOUR) {
    return t('{{value}} hours', { value: Math.floor(value / SECONDS_PER_HOUR) })
  }
  if (value >= SECONDS_PER_MINUTE) {
    return t('{{value}} minutes', { value: Math.floor(value / SECONDS_PER_MINUTE) })
  }
  return t('{{value}} seconds', { value })
}

export function formatPlanDuration(
  plan: Pick<SubscriptionPlan, 'duration_unit' | 'duration_value' | 'custom_seconds'>,
  t: TFunction,
): string {
  const value = Number(plan.duration_value)
  switch (plan.duration_unit) {
    case 'year':
      return t('{{value}} years', { value })
    case 'month':
      return t('{{value}} months', { value })
    case 'day':
      return t('{{value}} days', { value })
    case 'hour':
      return t('{{value}} hours', { value })
    case 'custom':
      return formatSeconds(plan.custom_seconds, t)
    default:
      // An unrecognised unit makes the plan unbuyable: calcPlanEndTime rejects it.
      return t('Unsupported duration unit')
  }
}

export function formatResetPeriod(
  plan: Pick<SubscriptionPlan, 'quota_reset_period' | 'quota_reset_custom_seconds'>,
  t: TFunction,
): string {
  switch (plan.quota_reset_period) {
    case 'daily':
      return t('Daily')
    case 'weekly':
      return t('Weekly')
    case 'monthly':
      return t('Monthly')
    case 'custom':
      return t('Every {{interval}}', {
        interval: formatSeconds(plan.quota_reset_custom_seconds, t),
      })
    default:
      // NormalizeResetPeriod folds every unknown value into "never".
      return t('No reset')
  }
}

export type PaymentChannel = {
  id: 'stripe' | 'creem' | 'waffo-pancake'
  label: string
  productId: string
}

/**
 * The payment channels a plan is actually wired to. A channel counts as wired only when
 * its product identifier is stored on the plan — that identifier is what the checkout
 * handlers look up, so an empty one means the channel cannot sell this plan.
 */
export function wiredPaymentChannels(plan: SubscriptionPlan): PaymentChannel[] {
  const channels: PaymentChannel[] = []
  if (plan.stripe_price_id.trim() !== '') {
    channels.push({ id: 'stripe', label: 'Stripe', productId: plan.stripe_price_id })
  }
  if (plan.creem_product_id.trim() !== '') {
    channels.push({ id: 'creem', label: 'Creem', productId: plan.creem_product_id })
  }
  if (plan.waffo_pancake_product_id.trim() !== '') {
    channels.push({
      id: 'waffo-pancake',
      label: 'Waffo Pancake',
      productId: plan.waffo_pancake_product_id,
    })
  }
  return channels
}

export type PlanValidationErrors = {
  title?: string
  price_amount?: string
  duration_value?: string
  custom_seconds?: string
  quota_reset_custom_seconds?: string
  max_purchase_per_user?: string
  total_amount?: string
}

export type PlanFormValues = {
  title: string
  subtitle: string
  /** Kept as strings so a cleared number input stays cleared instead of snapping to 0. */
  price_amount: string
  total_amount: string
  duration_unit: PlanDurationUnit
  duration_value: string
  custom_seconds: string
  quota_reset_period: PlanResetPeriod
  quota_reset_custom_seconds: string
  sort_order: string
  max_purchase_per_user: string
  enabled: boolean
  allow_balance_pay: boolean
  allow_wallet_overflow: boolean
  upgrade_group: string
  downgrade_group: string
  stripe_price_id: string
  creem_product_id: string
  waffo_pancake_product_id: string
}

/** `AdminCreateSubscriptionPlan` rejects anything above this. */
export const MAX_PLAN_PRICE = 9999

/**
 * Mirrors the server-side checks in `AdminCreateSubscriptionPlan` /
 * `AdminUpdateSubscriptionPlan`, plus the two `calcPlanEndTime` preconditions that the
 * write handlers do NOT enforce (a plan with `custom` duration and no seconds saves
 * cleanly and then fails at purchase time). The server remains the authority; this only
 * stops the round trip early.
 */
export function validatePlanForm(values: PlanFormValues, t: TFunction): PlanValidationErrors {
  const errors: PlanValidationErrors = {}

  if (values.title.trim() === '') errors.title = t('A plan title is required.')

  const price = Number(values.price_amount)
  if (values.price_amount.trim() === '' || !Number.isFinite(price) || price < 0) {
    errors.price_amount = t('Enter a price of 0 or more.')
  } else if (price > MAX_PLAN_PRICE) {
    errors.price_amount = t('The server rejects a price above {{max}}.', { max: MAX_PLAN_PRICE })
  }

  if (values.duration_unit === 'custom') {
    const seconds = Number(values.custom_seconds)
    if (!Number.isFinite(seconds) || seconds <= 0) {
      errors.custom_seconds = t('A custom duration needs more than 0 seconds.')
    }
  } else {
    const duration = Number(values.duration_value)
    if (!Number.isFinite(duration) || duration < 1) {
      errors.duration_value = t('Enter a validity of 1 or more.')
    }
  }

  if (values.quota_reset_period === 'custom') {
    const seconds = Number(values.quota_reset_custom_seconds)
    if (!Number.isFinite(seconds) || seconds <= 0) {
      errors.quota_reset_custom_seconds = t('A custom reset cycle needs more than 0 seconds.')
    }
  }

  const limit = Number(values.max_purchase_per_user)
  if (!Number.isFinite(limit) || limit < 0) {
    errors.max_purchase_per_user = t('Enter a purchase limit of 0 or more.')
  }

  const quota = Number(values.total_amount)
  if (values.total_amount.trim() === '' || !Number.isFinite(quota) || quota < 0) {
    errors.total_amount = t('Enter a plan quota of 0 or more.')
  }

  return errors
}

export function hasValidationError(errors: PlanValidationErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined)
}
