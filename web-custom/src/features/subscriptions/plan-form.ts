import {
  isPlanDurationUnit,
  isPlanResetPeriod,
  type PlanDraft,
  type SubscriptionPlan,
} from '@/features/subscriptions/api'
import type { PlanFormValues } from '@/features/subscriptions/plan-format'
import { quotaToCurrency } from '@/lib/format'

/**
 * The plan the create form starts from: a one-month plan, enabled, unlimited quota,
 * no reset and no purchase cap — the same defaults `AdminCreateSubscriptionPlan`
 * applies when the corresponding fields are left out.
 */
export const EMPTY_PLAN_FORM: PlanFormValues = {
  title: '',
  subtitle: '',
  price_amount: '0',
  total_amount: '0',
  duration_unit: 'month',
  duration_value: '1',
  custom_seconds: '0',
  quota_reset_period: 'never',
  quota_reset_custom_seconds: '0',
  sort_order: '0',
  max_purchase_per_user: '0',
  enabled: true,
  allow_balance_pay: true,
  allow_wallet_overflow: true,
  upgrade_group: '',
  downgrade_group: '',
  stripe_price_id: '',
  creem_product_id: '',
  waffo_pancake_product_id: '',
}

/** `total_amount` is stored in quota units; the form edits it as currency. */
export function planToFormValues(plan: SubscriptionPlan, quotaPerUnit: number): PlanFormValues {
  return {
    title: plan.title,
    subtitle: plan.subtitle,
    price_amount: String(plan.price_amount),
    total_amount: String(quotaToCurrency(plan.total_amount, quotaPerUnit)),
    duration_unit: isPlanDurationUnit(plan.duration_unit) ? plan.duration_unit : 'month',
    duration_value: String(plan.duration_value),
    custom_seconds: String(plan.custom_seconds),
    quota_reset_period: isPlanResetPeriod(plan.quota_reset_period)
      ? plan.quota_reset_period
      : 'never',
    quota_reset_custom_seconds: String(plan.quota_reset_custom_seconds),
    sort_order: String(plan.sort_order),
    max_purchase_per_user: String(plan.max_purchase_per_user),
    enabled: plan.enabled,
    allow_balance_pay: plan.allow_balance_pay ?? true,
    allow_wallet_overflow: plan.allow_wallet_overflow ?? true,
    upgrade_group: plan.upgrade_group,
    downgrade_group: plan.downgrade_group,
    stripe_price_id: plan.stripe_price_id,
    creem_product_id: plan.creem_product_id,
    waffo_pancake_product_id: plan.waffo_pancake_product_id,
  }
}

/** DERIVED: plan quota in units = entered amount x quota_per_unit (from /api/status). */
export function toQuotaUnits(amount: string, quotaPerUnit: number): number {
  const parsed = Number(amount)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed * quotaPerUnit)
}

function toInteger(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

export function formValuesToDraft(values: PlanFormValues, quotaPerUnit: number): PlanDraft {
  const price = Number(values.price_amount)
  const custom = values.duration_unit === 'custom'

  return {
    title: values.title.trim(),
    subtitle: values.subtitle.trim(),
    price_amount: Number.isFinite(price) ? price : 0,
    currency: 'USD',
    duration_unit: values.duration_unit,
    // The server forces this to 1 for a non-custom unit when it arrives as 0, and
    // ignores it entirely for `custom`; sending the raw value keeps the two in step.
    duration_value: custom ? 0 : toInteger(values.duration_value),
    custom_seconds: custom ? toInteger(values.custom_seconds) : 0,
    enabled: values.enabled,
    sort_order: toInteger(values.sort_order),
    allow_balance_pay: values.allow_balance_pay,
    allow_wallet_overflow: values.allow_wallet_overflow,
    stripe_price_id: values.stripe_price_id.trim(),
    creem_product_id: values.creem_product_id.trim(),
    waffo_pancake_product_id: values.waffo_pancake_product_id.trim(),
    max_purchase_per_user: toInteger(values.max_purchase_per_user),
    upgrade_group: values.upgrade_group.trim(),
    downgrade_group: values.downgrade_group.trim(),
    total_amount: toQuotaUnits(values.total_amount, quotaPerUnit),
    quota_reset_period: values.quota_reset_period,
    // Matches the handler, which zeroes this column for every non-custom cycle.
    quota_reset_custom_seconds:
      values.quota_reset_period === 'custom' ? toInteger(values.quota_reset_custom_seconds) : 0,
  }
}
