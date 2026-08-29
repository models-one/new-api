import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import CoinsIcon from 'lucide-react/dist/esm/icons/coins'
import LayersIcon from 'lucide-react/dist/esm/icons/layers'
import { useTranslation } from 'react-i18next'

import { Panel, Skeleton, StatCard, type Tone } from '@/components/ui'
import {
  changeDirection,
  displayedChange,
  percentChange,
  type ChangeDirection,
  type UsageTotals,
} from '@/features/analytics/usage'
import { formatCompactNumber, formatPercent, formatTokens, quotaToCurrency, splitCurrency } from '@/lib/format'

/** Mirrors the shape StatCard accepts; the kit does not export the type. */
type StatDelta = {
  value: string
  direction: ChangeDirection
  caption?: string
  tone?: Tone
}

type UsageSummaryProps = {
  totals: UsageTotals
  /** Totals for the immediately preceding window of the same length. */
  previousTotals: UsageTotals | undefined
  quotaPerUnit: number
  /** Reads as "vs previous 7 days". */
  comparisonCaption: string
  isFetching: boolean
}

/**
 * A change against the preceding window of the same length, computed here from
 * two real queries. Undefined while the baseline is still loading, and whenever
 * the baseline window recorded nothing at all.
 */
function toDelta(
  current: number,
  previous: number | undefined,
  caption: string,
): StatDelta | undefined {
  if (previous === undefined) return undefined
  const change = percentChange(current, previous)
  if (change === null) return undefined

  const shown = displayedChange(change)
  return {
    value: `${shown > 0 ? '+' : ''}${formatPercent(shown, 1)}`,
    direction: changeDirection(change),
    caption,
    // Neutral on purpose: more requests, more tokens and more spend are facts,
    // not good or bad news, so the console does not colour them as either.
    tone: 'info',
  }
}

export function UsageSummarySkeleton() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {['requests', 'tokens', 'spend'].map((slot, index) => (
        <Panel className="flex flex-col gap-4 p-6" key={slot}>
          <Skeleton width="45%" />
          <Skeleton
            height={40}
            label={index === 0 ? t('Loading your usage totals') : undefined}
            variant="block"
            width="60%"
          />
          <Skeleton width="35%" />
        </Panel>
      ))}
    </div>
  )
}

export function UsageSummary(props: UsageSummaryProps) {
  const { t } = useTranslation()
  const { totals, previousTotals, comparisonCaption } = props

  const spend = splitCurrency(quotaToCurrency(totals.quota, props.quotaPerUnit))

  return (
    <div aria-busy={props.isFetching} className="grid gap-4 md:grid-cols-3">
      <StatCard
        delta={toDelta(totals.requests, previousTotals?.requests, comparisonCaption)}
        icon={<ActivityIcon />}
        iconTone="primary"
        label={t('Total requests')}
        value={formatCompactNumber(totals.requests)}
      />
      <StatCard
        delta={toDelta(totals.tokens, previousTotals?.tokens, comparisonCaption)}
        icon={<LayersIcon />}
        iconTone="secondary"
        label={t('Total tokens')}
        value={formatTokens(totals.tokens)}
      />
      <StatCard
        delta={toDelta(totals.quota, previousTotals?.quota, comparisonCaption)}
        icon={<CoinsIcon />}
        iconTone="success"
        label={t('Total spend')}
        unit={spend.fraction}
        value={spend.whole}
      />
    </div>
  )
}
