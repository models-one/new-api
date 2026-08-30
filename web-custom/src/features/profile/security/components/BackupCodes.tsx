import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/form'
import { Alert, CopyButton, MaskedValue } from '@/components/ui'

type BackupCodesProps = {
  codes: readonly string[]
  /** Controlled state of the "I have saved these" gate. */
  acknowledged: boolean
  onAcknowledgedChange: (acknowledged: boolean) => void
}

/**
 * The one place backup codes are rendered.
 *
 * A backup code is a single-use password: it is masked by default, revealed one
 * at a time on request, and copied through the clipboard control rather than
 * selected out of running text. `POST /api/user/2fa/setup` and
 * `POST /api/user/2fa/backup_codes` are the only responses that ever contain
 * them — the server never shows them again, which is why the acknowledgement
 * checkbox gates the dialog's exit.
 */
export function BackupCodes(props: BackupCodesProps) {
  const { t } = useTranslation()
  const { codes, acknowledged, onAcknowledgedChange } = props

  return (
    <div className="flex flex-col gap-4">
      <Alert title={t('These codes are shown once')} tone="warning">
        {t(
          'Each backup code signs you in a single time if you lose your authenticator. Store them somewhere safe before you continue — they cannot be shown again.',
        )}
      </Alert>

      <ul className="flex flex-col gap-2">
        {codes.map((code, index) => (
          <li className="flex items-center gap-3" key={`${index}-${code}`}>
            <span className="eyebrow w-10 shrink-0 text-muted">
              {t('Code {{index}}', { index: index + 1 })}
            </span>
            <MaskedValue
              className="min-w-0 flex-1"
              copyLabel={t('Copy backup code {{index}}', { index: index + 1 })}
              copyable
              hideLabel={t('Hide backup code {{index}}', { index: index + 1 })}
              showLabel={t('Reveal backup code {{index}}', { index: index + 1 })}
              size="sm"
              value={code}
            />
          </li>
        ))}
      </ul>

      <CopyButton
        label={t('Copy all backup codes')}
        showLabel
        value={codes.join('\n')}
        variant="outline"
      />

      <Checkbox
        checked={acknowledged}
        label={t('I have saved these backup codes somewhere safe')}
        onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
      />
    </div>
  )
}
