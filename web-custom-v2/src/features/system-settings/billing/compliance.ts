import { useMutation } from '@tanstack/react-query'

import { postJson } from '@/lib/api/client'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  useInvalidateSystemOptions,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'

/**
 * THE PAYMENT COMPLIANCE GATE
 * ===========================
 * Five option keys record that an operator has accepted the payment compliance terms.
 * They are read like any other setting and are the ONLY settings in this console that
 * cannot be written through `PUT /api/option/`:
 *
 *   PUT {"key":"payment_setting.compliance_confirmed","value":"true"}
 *   → 200 {"success":false,"message":"合规确认字段不允许通过通用设置接口修改"}   (verified live)
 *
 * `controller.UpdateOption` refuses every key prefixed `payment_setting.compliance_`.
 * The only way to set them is `POST /api/option/payment_compliance`, which stamps all
 * five at once from the server's own clock, the caller's user id and the caller's IP —
 * an audit record, not a form field. Nothing in this console may claim otherwise.
 *
 * WHAT THE GATE ACTUALLY BLOCKS, from the Go source rather than from the UI:
 *   - `QuotaForInviter` / `QuotaForInvitee` are refused for a POSITIVE value while the
 *     gate is closed (`controller/option.go`); zero is always accepted.
 *   - Every top-up gateway reports itself disabled: `isEpayTopUpEnabled`,
 *     `isStripeTopUpEnabled`, `isNowPaymentsTopUpEnabled`, `isCreemTopUpEnabled`,
 *     `isWaffoTopUpEnabled` and `isWaffoPancakeTopUpEnabled` all return false first thing
 *     (`controller/payment_webhook_availability.go`), so no money can be taken.
 *   - Redemption codes are switched off with them (`enable_redemption`).
 * Credentials can still be SAVED while the gate is closed. They simply do not take money.
 *
 * `POST /api/option/payment_compliance` also refuses a personal access token
 * (`use_access_token`) with HTTP 403 — it must be the browser's own signed-in session,
 * which is what this console uses.
 */

/** `operation_setting.CurrentComplianceTermsVersion`. A stamp of any other version is stale. */
export const CURRENT_COMPLIANCE_TERMS_VERSION = 'v1'

export type PaymentCompliance = {
  /** True only when the flag is set AND the stamped terms version is the current one. */
  confirmed: boolean
  /** The raw flag, so a stale-version state can be told apart from an unconfirmed one. */
  flagged: boolean
  termsVersion: string
  /** Unix SECONDS, like every other timestamp in this API. 0 when never stamped. */
  confirmedAt: number
  confirmedBy: number
  confirmedIp: string
}

export function readPaymentCompliance(options: SystemOptionMap | undefined): PaymentCompliance {
  const flagged = readOptionBoolean(options, 'payment_setting.compliance_confirmed', false)
  const termsVersion = readOptionString(options, 'payment_setting.compliance_terms_version')

  return {
    confirmed: flagged && termsVersion === CURRENT_COMPLIANCE_TERMS_VERSION,
    confirmedAt: readOptionNumber(options, 'payment_setting.compliance_confirmed_at', 0),
    confirmedBy: readOptionNumber(options, 'payment_setting.compliance_confirmed_by', 0),
    confirmedIp: readOptionString(options, 'payment_setting.compliance_confirmed_ip'),
    flagged,
    termsVersion,
  }
}

/** The `data` of a successful `POST /api/option/payment_compliance`. */
export type PaymentComplianceResult = {
  confirmed: boolean
  terms_version: string
  confirmed_at: number
  confirmed_by: number
}

/**
 * Sends the acceptance and re-reads the option store, because five keys change at once
 * and every gateway's readiness flips with them.
 */
export function useConfirmPaymentCompliance() {
  const invalidate = useInvalidateSystemOptions()

  return useMutation({
    mutationFn: () =>
      postJson<PaymentComplianceResult>(
        '/api/option/payment_compliance',
        { confirmed: true },
        { skipBusinessError: true, skipErrorHandler: true },
      ),
    onSuccess: () => invalidate(),
  })
}
