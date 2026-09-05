import { useTranslation } from 'react-i18next'

import { SegmentedControl } from '@/components/ui'
import type { LogScope } from '@/features/logs/api'

/**
 * The mine/everyone switch. Rendered only for role >= 10 — `GET /api/log/` answers
 * 403 below that, so an always-visible disabled control would advertise a capability
 * the account does not have rather than inform.
 */
export function LogScopeControl(props: {
  scope: LogScope
  onChange: (scope: LogScope) => void
  disabled: boolean
  label: string
}) {
  const { t } = useTranslation()

  return (
    <SegmentedControl<LogScope>
      label={props.label}
      onChange={props.onChange}
      options={[
        { id: 'mine', label: t('My logs'), disabled: props.disabled },
        { id: 'everyone', label: t('All users'), disabled: props.disabled },
      ]}
      size="sm"
      value={props.scope}
    />
  )
}
