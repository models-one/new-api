import { queryOptions } from '@tanstack/react-query'

import { getJson, postJson, putJson } from '@/lib/api/client'

/**
 * `model.SubscriptionPlan` (model/subscription.go). Every field is written by the
 * backend on `GET /api/subscription/admin/plans`; the two `*bool` columns are the only
 * ones that can arrive as `null` — `NormalizeDefaults()` fills them on read, but a row
 * written by an older build can still carry a SQL NULL, so they stay nullable here.
 */
export type SubscriptionPlan = {
  id: number
  title: string
  subtitle: string
  /** Display money amount charged for the plan. The backend pins `currency` to USD. */
  price_amount: number
  currency: string
  duration_unit: string
  duration_value: number
  custom_seconds: number
  enabled: boolean
  sort_order: number
  allow_balance_pay: boolean | null
  allow_wallet_overflow: boolean | null
  stripe_price_id: string
  creem_product_id: string
  waffo_pancake_product_id: string
  max_purchase_per_user: number
  upgrade_group: string
  downgrade_group: string
  /** Quota granted per billing period, in quota units. 0 means unlimited. */
  total_amount: number
  quota_reset_period: string
  quota_reset_custom_seconds: number
  created_at: number
  updated_at: number
}

/** The list endpoint wraps every plan in `SubscriptionPlanDTO{ Plan }`. */
export type AdminPlanRecord = {
  plan: SubscriptionPlan
}

/** `model.SubscriptionDuration*`. Anything else is rejected at purchase time. */
export const PLAN_DURATION_UNITS = ['year', 'month', 'day', 'hour', 'custom'] as const
export type PlanDurationUnit = (typeof PLAN_DURATION_UNITS)[number]

/** `model.NormalizeResetPeriod` maps every unrecognised value to `never`. */
export const PLAN_RESET_PERIODS = ['never', 'daily', 'weekly', 'monthly', 'custom'] as const
export type PlanResetPeriod = (typeof PLAN_RESET_PERIODS)[number]

export function isPlanDurationUnit(value: string): value is PlanDurationUnit {
  return (PLAN_DURATION_UNITS as readonly string[]).includes(value)
}

export function isPlanResetPeriod(value: string): value is PlanResetPeriod {
  return (PLAN_RESET_PERIODS as readonly string[]).includes(value)
}

/**
 * The body of `POST /api/subscription/admin/plans` and `PUT …/plans/:id`, both of which
 * bind `AdminUpsertSubscriptionPlanRequest{ Plan }`. The PUT handler writes a fixed
 * column map, so every field it knows about must be present on an update or the column
 * is overwritten with the zero value.
 */
export type PlanDraft = {
  title: string
  subtitle: string
  price_amount: number
  currency: string
  duration_unit: PlanDurationUnit
  duration_value: number
  custom_seconds: number
  enabled: boolean
  sort_order: number
  allow_balance_pay: boolean
  allow_wallet_overflow: boolean
  stripe_price_id: string
  creem_product_id: string
  waffo_pancake_product_id: string
  max_purchase_per_user: number
  upgrade_group: string
  downgrade_group: string
  total_amount: number
  quota_reset_period: PlanResetPeriod
  quota_reset_custom_seconds: number
}

/** `model.SubscriptionResetResult`. `plan_title` and the user ids carry `json:"-"`. */
export type SubscriptionResetResult = {
  plan_id: number
  matched_count: number
  reset_count: number
  user_count: number
  advance_reset_time: boolean
}

export function adminPlansQuery() {
  return queryOptions({
    queryKey: ['subscription', 'admin', 'plans'],
    queryFn: () => getJson<AdminPlanRecord[]>('/api/subscription/admin/plans'),
    staleTime: 30 * 1000,
  })
}

/**
 * `GET /api/group/` — the group names the plan's upgrade/downgrade selects must choose
 * from. The create and update handlers reject any name absent from the group ratio map.
 * The trailing slash is required: without it the router answers 301.
 */
export function adminGroupsQuery() {
  return queryOptions({
    queryKey: ['admin', 'groups'],
    queryFn: () => getJson<string[]>('/api/group/'),
    staleTime: 5 * 60 * 1000,
  })
}

/** Answers with the created row itself, not the `{ plan }` wrapper the list uses. */
export function createPlan(draft: PlanDraft): Promise<SubscriptionPlan> {
  return postJson<SubscriptionPlan>('/api/subscription/admin/plans', { plan: draft })
}

/** Answers with a null payload; re-read the list to see the result. */
export function updatePlan(id: number, draft: PlanDraft): Promise<null> {
  return putJson<null>(`/api/subscription/admin/plans/${id}`, { plan: draft })
}

/**
 * Zeroes `amount_used` on every ACTIVE, unexpired subscription of the plan, and — when
 * `advanceResetTime` is set — moves each one's next reset to the following period.
 *
 * The flag is sent explicitly on purpose: `controller.resolveAdvanceResetTime` treats an
 * absent value as `true`, so omitting it would silently pick the destructive default.
 */
export function resetPlanSubscriptions(
  planId: number,
  advanceResetTime: boolean,
): Promise<SubscriptionResetResult> {
  return postJson<SubscriptionResetResult>(
    `/api/subscription/admin/plans/${planId}/subscriptions/reset`,
    { advance_reset_time: advanceResetTime },
  )
}

/** Round-trips a stored plan back into an update body, so a PUT never blanks a column. */
export function planToDraft(plan: SubscriptionPlan): PlanDraft {
  return {
    title: plan.title,
    subtitle: plan.subtitle,
    price_amount: plan.price_amount,
    // The backend overwrites this with USD regardless of what is sent.
    currency: 'USD',
    duration_unit: isPlanDurationUnit(plan.duration_unit) ? plan.duration_unit : 'month',
    duration_value: plan.duration_value,
    custom_seconds: plan.custom_seconds,
    enabled: plan.enabled,
    sort_order: plan.sort_order,
    allow_balance_pay: plan.allow_balance_pay ?? true,
    allow_wallet_overflow: plan.allow_wallet_overflow ?? true,
    stripe_price_id: plan.stripe_price_id,
    creem_product_id: plan.creem_product_id,
    waffo_pancake_product_id: plan.waffo_pancake_product_id,
    max_purchase_per_user: plan.max_purchase_per_user,
    upgrade_group: plan.upgrade_group,
    downgrade_group: plan.downgrade_group,
    total_amount: plan.total_amount,
    quota_reset_period: isPlanResetPeriod(plan.quota_reset_period)
      ? plan.quota_reset_period
      : 'never',
    quota_reset_custom_seconds: plan.quota_reset_custom_seconds,
  }
}
