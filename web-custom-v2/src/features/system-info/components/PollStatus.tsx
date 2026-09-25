import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui'
import { formatTime } from '@/lib/format'

type PollStatusProps = {
  /** `query.dataUpdatedAt` — epoch MILLISECONDS, and 0 until the first success. */
  dataUpdatedAt: number
  /** The named poll constant this panel runs on. Omit for a panel that never polls. */
  intervalMs?: number
  /** False while the tab is hidden, when the interval is switched off entirely. */
  isVisible?: boolean
  isFetching: boolean
  onRefresh: () => void
  /** Accessible name for the icon-only refresh control. */
  refreshLabel: string
}

/**
 * The "is this still live?" line every polling panel carries. Without the timestamp a
 * stalled poll looks exactly like a healthy one, which on a health page is the worst
 * possible failure mode.
 */
export function PollStatus(props: PollStatusProps) {
  const { i18n, t } = useTranslation()
  const seconds = props.intervalMs === undefined ? 0 : Math.round(props.intervalMs / 1000)

  let cadence = t('Refreshed on demand')
  if (props.intervalMs !== undefined) {
    cadence = props.isVisible
      ? t('Polling every {{seconds}}s', { seconds })
      : t('Polling paused while this tab is hidden')
  }

  return (
    <div className="flex items-center gap-2">
      <p aria-live="polite" className="text-right text-xs leading-4 text-muted" role="status">
        <span className="block">
          {props.dataUpdatedAt > 0
            ? t('Updated {{time}}', {
              time: formatTime(Math.floor(props.dataUpdatedAt / 1000), i18n.language),
            })
            : t('Not yet updated')}
        </span>
        <span className="block">{cadence}</span>
      </p>

      <Button
        aria-busy={props.isFetching}
        aria-label={props.refreshLabel}
        disabled={props.isFetching}
        onClick={props.onRefresh}
        size="icon-md"
        title={props.refreshLabel}
        variant="quiet"
      >
        <RefreshCwIcon aria-hidden="true" />
      </Button>
    </div>
  )
}
