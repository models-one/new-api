import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui'
import { formatGrowth, type Movement } from '@/features/rankings/rankings-presentation'

/**
 * A model's or vendor's period-over-period change.
 *
 * A new entrant is labelled as such rather than as "+100%": the server reports 100 for anything
 * with no traffic in the preceding window, so the percentage would be a measurement it never
 * made. See `modelMovement` for the split.
 */
export function MovementBadge(props: { movement: Movement; comparedTo: string }) {
  const { t } = useTranslation()

  if (props.movement.kind === 'new') {
    return (
      <Badge tone="info" title={t('No traffic in {{baseline}}, so there is nothing to compare against.', { baseline: props.comparedTo })}>
        {t('New')}
      </Badge>
    )
  }

  if (props.movement.kind === 'flat') {
    return (
      <Badge tone="muted" title={t('Unchanged against {{baseline}}.', { baseline: props.comparedTo })}>
        {t('No change')}
      </Badge>
    )
  }

  const growth = formatGrowth(props.movement.growthPct)

  return (
    <Badge
      tone={props.movement.kind === 'up' ? 'success' : 'destructive'}
      title={t('Token volume against {{baseline}}.', { baseline: props.comparedTo })}
    >
      <span className="mono">{growth}</span>
    </Badge>
  )
}
