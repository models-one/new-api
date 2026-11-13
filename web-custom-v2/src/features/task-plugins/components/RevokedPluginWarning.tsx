import { useTranslation } from 'react-i18next'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'

import { localizedText } from '../presentation'
import type { MarketplaceRevokedEntry } from '../types'

/** Tells the administrator that the installed code was taken down, and why. */
export function RevokedPluginWarning(props: { entry?: MarketplaceRevokedEntry }) {
  const { i18n, t } = useTranslation()
  if (!props.entry) return null
  const reason = localizedText(props.entry.reason, i18n.language)
  return (
    <p className="flex items-start gap-1.5 text-sm font-medium text-destructive" role="alert">
      <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        {t('This version was taken down from community plugins.')}
        {reason === '' ? null : <> {t('Reason: {{reason}}', { reason })}</>}
      </span>
    </p>
  )
}
