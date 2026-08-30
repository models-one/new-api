import CreditCardIcon from 'lucide-react/dist/esm/icons/credit-card'

import {
  CheckinSection,
  CurrencySection,
  GroupPricingSection,
  ModelPricingSection,
  PaymentSection,
  QuotaSection,
} from '@/features/system-settings/billing'
import type { SettingsGroupDefinition } from '@/features/system-settings/groups/types'

/**
 * OWNER: the agent rebuilding the Billing group.
 *
 * Section ids mirror `web/src/features/system-settings/billing/section-registry.tsx`.
 *
 * THE COMPLIANCE GATE IS REAL AND IT IS HERE. `controller/option.go`:
 *   - `payment_setting.compliance_confirmed`, `…_terms_version`, `…_confirmed_at`,
 *     `…_confirmed_by` and `…_confirmed_ip` are ALWAYS refused through `PUT /api/option/`
 *     ("合规确认字段不允许通过通用设置接口修改" — verified live). They are read-only here
 *     and are set through `POST /api/option/payment_compliance` instead.
 *   - `QuotaForInviter` and `QuotaForInvitee` are refused for any POSITIVE value while
 *     compliance is unconfirmed. Zero is always accepted. The dev server has compliance
 *     confirmed, so a positive write succeeds there — do not mistake that for the gate
 *     being absent.
 *
 * Every payment credential is stripped from the read payload as a secret: `EpayKey`,
 * `StripeApiSecret`, `StripeWebhookSecret`, `NowPaymentsAPIKey`, `NowPaymentsIPNSecret`,
 * `CreemApiKey`, `CreemWebhookSecret`, `WaffoApiKey`, `WaffoPrivateKey`,
 * `WaffoSandboxApiKey`, `WaffoSandboxPrivateKey`, `WaffoPancakePrivateKey`. Write-only.
 */
export const billingGroup: SettingsGroupDefinition = {
  Icon: CreditCardIcon,
  description: 'Balances, currency display, model prices and the payment gateways.',
  id: 'billing',
  sections: [
    {
      description: 'Starting balance, pre-consumption and invitation rewards.',
      Component: QuotaSection,
      id: 'quota',
      title: 'Quota settings',
    },
    {
      description: 'The quota divisor, exchange rates and how balances are displayed.',
      Component: CurrencySection,
      id: 'currency',
      title: 'Currency and display',
    },
    {
      description: 'Per-model ratios and fixed prices.',
      Component: ModelPricingSection,
      id: 'model-pricing',
      title: 'Model pricing',
    },
    {
      description: 'Per-group multipliers and which groups a user may select.',
      Component: GroupPricingSection,
      id: 'group-pricing',
      title: 'Group pricing',
    },
    {
      description: 'Top-up providers, amounts and callbacks.',
      Component: PaymentSection,
      id: 'payment',
      title: 'Payment gateway',
    },
    {
      description: 'The daily check-in reward range.',
      Component: CheckinSection,
      id: 'checkin',
      title: 'Check-in rewards',
    },
  ],
  title: 'Billing',
}
