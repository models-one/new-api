import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PasswordInput } from '@/components/form'
import { Button } from '@/components/ui'

/**
 * A WRITE-ONLY CREDENTIAL FIELD.
 *
 * `controller.GetOptions` skips every option key ending in `Token`, `Secret`, `Key`,
 * `secret` or `api_key` before serialising the payload. They are not masked — they are
 * ABSENT. `EpayKey`, `StripeApiSecret`, `StripeWebhookSecret`, `NowPaymentsAPIKey`,
 * `NowPaymentsIPNSecret`, `CreemApiKey`, `CreemWebhookSecret`, `WaffoApiKey`,
 * `WaffoPrivateKey`, `WaffoSandboxApiKey`, `WaffoSandboxPrivateKey` and
 * `WaffoPancakePrivateKey` were all confirmed missing from the live payload.
 *
 * So this field can never show what is stored, and an empty box therefore means "unknown",
 * not "empty". Two consequences it is built around:
 *
 *   - Leaving it untouched writes nothing. The section's draft holds '' as the saved
 *     value, so the key only becomes dirty once something has been typed.
 *   - Clearing a stored credential cannot be expressed by emptying the box, because that
 *     is the untouched state. It gets its own explicit action, which writes the empty
 *     string on its own.
 *
 * The value never leaves this control: no logging, no interpolation into a sentence, and
 * the reveal toggle is the kit's own.
 */

type SecretFieldProps = {
  label: string
  description?: ReactNode
  value: string
  onChange: (value: string) => void
  /** Omit to hide the clear action, e.g. while the payload is still loading. */
  onClear?: () => void
  disabled?: boolean
  /** Names the stored credential in the clear button's accessible name. */
  clearLabel: string
  placeholder?: string
}

export function SecretField(props: SecretFieldProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <PasswordInput
        autoComplete="off"
        description={props.description ?? t('Stored write-only. The server never returns it, so this box stays empty; type a value to replace what is stored, or leave it alone to keep it.')}
        disabled={props.disabled}
        label={props.label}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        value={props.value}
      />
      {props.onClear ? (
        <div>
          <Button
            aria-label={props.clearLabel}
            disabled={props.disabled}
            onClick={props.onClear}
            size="sm"
            title={props.clearLabel}
            variant="quiet"
          >
            {t('Clear the stored value')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
