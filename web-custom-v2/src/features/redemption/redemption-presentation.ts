import type { Tone } from '@/components/ui'
import { REDEMPTION_STATUS, type RedemptionCode } from '@/features/redemption/api'

/**
 * What a row actually is, once expiry is taken into account.
 *
 * The database stores three statuses (1 unused, 2 disabled, 3 used). "Expired" is
 * DERIVED in the browser exactly the way `model.SearchRedemptions` derives it on
 * the server, so the badge and the `status=expired` filter agree:
 *
 *   expired  ⇔  status === 1 && expired_time !== 0 && expired_time < now
 *
 * A disabled or already-redeemed code keeps its own state even once its expiry has
 * passed — matching both the server filter and `Redeem`, which rejects on status first.
 */
export type RedemptionState = 'unused' | 'disabled' | 'used' | 'expired'

export function isRedemptionExpired(code: Pick<RedemptionCode, 'expired_time' | 'status'>, nowSeconds: number): boolean {
  if (code.status !== REDEMPTION_STATUS.unused) return false
  return code.expired_time !== 0 && code.expired_time < nowSeconds
}

export function redemptionState(
  code: Pick<RedemptionCode, 'expired_time' | 'status'>,
  nowSeconds: number,
): RedemptionState {
  if (isRedemptionExpired(code, nowSeconds)) return 'expired'
  if (code.status === REDEMPTION_STATUS.disabled) return 'disabled'
  if (code.status === REDEMPTION_STATUS.used) return 'used'
  return 'unused'
}

export const REDEMPTION_STATE_TONE: Readonly<Record<RedemptionState, Tone>> = {
  unused: 'success',
  disabled: 'muted',
  used: 'info',
  expired: 'warning',
}

/** Translation keys for each state; pass through `t()` at the call site. */
export const REDEMPTION_STATE_LABEL: Readonly<Record<RedemptionState, string>> = {
  unused: 'Unused',
  disabled: 'Disabled',
  used: 'Redeemed',
  expired: 'Expired',
}

/**
 * Legacy row-action rules, ported as-is from
 * `web/src/features/redemption-codes/components/data-table-row-actions.tsx`:
 * editing is offered only for a live, unexpired code, and the enable/disable
 * toggle is hidden once a code is redeemed or has lapsed. The API would accept
 * either call; the console declines to offer them.
 */
export function canEditRedemption(code: RedemptionCode, nowSeconds: number): boolean {
  return redemptionState(code, nowSeconds) === 'unused'
}

export function canToggleRedemption(code: RedemptionCode, nowSeconds: number): boolean {
  const state = redemptionState(code, nowSeconds)
  return state === 'unused' || state === 'disabled'
}

export type ExpiryPreset = 'never' | '1d' | '1w' | '1m' | 'keep'

/** The four presets the drawer offers, in the order they are rendered. */
export const EXPIRY_PRESETS: readonly Exclude<ExpiryPreset, 'keep'>[] = ['never', '1d', '1w', '1m']

export const EXPIRY_PRESET_LABEL: Readonly<Record<ExpiryPreset, string>> = {
  never: 'Never',
  '1d': '1 day',
  '1w': '1 week',
  '1m': '1 month',
  keep: 'Keep current expiry',
}

/**
 * Resolves a preset to the unix SECONDS the API wants, where 0 means "never".
 *
 * `1m` advances the calendar month (`setMonth`), matching the legacy
 * `addTimeToDate(1, 0, 0)`; `1w` and `1d` are plain day arithmetic. Both are
 * evaluated against the browser clock at submit time, not at render time.
 */
export function resolveExpiryTimestamp(preset: ExpiryPreset, now: Date, currentExpiry = 0): number {
  if (preset === 'keep') return currentExpiry
  if (preset === 'never') return 0

  const target = new Date(now.getTime())
  if (preset === '1m') target.setMonth(target.getMonth() + 1)
  if (preset === '1w') target.setDate(target.getDate() + 7)
  if (preset === '1d') target.setDate(target.getDate() + 1)
  return Math.floor(target.getTime() / 1000)
}

/**
 * The inverse of `quotaToCurrency`: the drawer takes an amount in the display
 * currency and the API stores integer quota units.
 *
 *   quota = round(amount × quota_per_unit)
 *
 * `quota_per_unit` is read from `GET /api/status` through `useQuotaPerUnit()`; it
 * is never hardcoded here.
 */
export function currencyToQuota(amount: number, quotaPerUnit: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * quotaPerUnit)
}

export const REDEMPTION_NAME_MAX_LENGTH = 20
export const REDEMPTION_COUNT_MIN = 1
export const REDEMPTION_COUNT_MAX = 100

export type RedemptionFormValues = {
  name: string
  /** In the display currency, as typed. */
  amount: number | null
  expiry: ExpiryPreset
  count: number | null
}

export type RedemptionFormErrors = Partial<Record<'name' | 'amount' | 'count', string>>

/**
 * Mirrors what `controller.AddRedemption` enforces (name 1–20 runes counted with
 * `utf8.RuneCountInString`, count 1–100) plus a non-negative quota, so the drawer
 * fails fast instead of round-tripping a rejection.
 */
export function validateRedemptionForm(
  values: RedemptionFormValues,
  options: { requireCount: boolean },
): RedemptionFormErrors {
  const errors: RedemptionFormErrors = {}
  const nameLength = [...values.name.trim()].length

  if (nameLength === 0 || nameLength > REDEMPTION_NAME_MAX_LENGTH) {
    errors.name = 'name-length'
  }
  if (values.amount === null || !Number.isFinite(values.amount) || values.amount < 0) {
    errors.amount = 'amount-invalid'
  }
  if (options.requireCount) {
    const count = values.count
    if (
      count === null
      || !Number.isInteger(count)
      || count < REDEMPTION_COUNT_MIN
      || count > REDEMPTION_COUNT_MAX
    ) {
      errors.count = 'count-range'
    }
  }

  return errors
}
