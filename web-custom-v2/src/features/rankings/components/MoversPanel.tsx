import TrendingDownIcon from 'lucide-react/dist/esm/icons/trending-down'
import TrendingUpIcon from 'lucide-react/dist/esm/icons/trending-up'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/system/EmptyState'
import { Badge, Panel } from '@/components/ui'
import type { RankingMover } from '@/features/rankings/api'
import { formatGrowth, formatRankDelta } from '@/features/rankings/rankings-presentation'

/**
 * The rank movers, from `rankings.top_movers` / `top_droppers`.
 *
 * The server only ever includes a model that HAS a previous rank and a non-zero delta
 * (`buildRankingMovers`), so both lists are legitimately empty whenever nothing moved — which
 * is exactly what the seeded instance returns for the `year` window.
 */
function MoverList(props: { rows: RankingMover[]; emptyTitle: string; emptyDescription: string; label: string }) {
  const { t } = useTranslation()

  if (props.rows.length === 0) {
    return (
      <EmptyState description={props.emptyDescription} headingLevel={3} title={props.emptyTitle} />
    )
  }

  return (
    <ul aria-label={props.label} className="flex flex-col divide-y divide-border">
      {props.rows.map((row) => (
        <li className="flex items-center justify-between gap-4 px-5 py-3" key={row.model_name}>
          <div className="min-w-0">
            <p className="mono truncate text-sm font-semibold text-foreground">{row.model_name}</p>
            <p className="text-xs text-muted">
              {t('{{vendor}} · now #{{rank}}', { rank: row.current_rank, vendor: row.vendor })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={row.rank_delta > 0 ? 'success' : 'destructive'}>
              <span className="mono">{t('{{delta}} places', { delta: formatRankDelta(row.rank_delta) })}</span>
            </Badge>
            <span className="mono text-xs text-muted">{formatGrowth(row.growth_pct)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function MoversPanel(props: {
  movers: RankingMover[]
  droppers: RankingMover[]
  baseline: string
}) {
  const { t } = useTranslation()

  const nothingMoved = t('Every ranked model held its place, or had no rank in {{baseline}} to move from.', {
    baseline: props.baseline,
  })

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <Panel.Header
          description={t('Biggest climbs in rank against {{baseline}}.', { baseline: props.baseline })}
          headingLevel={2}
          icon={<TrendingUpIcon aria-hidden="true" className="size-4" />}
          title={t('Climbing')}
        />
        <Panel.Body padded={false}>
          <MoverList
            emptyDescription={nothingMoved}
            emptyTitle={t('Nothing climbed')}
            label={t('Climbing')}
            rows={props.movers}
          />
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header
          description={t('Biggest falls in rank against {{baseline}}.', { baseline: props.baseline })}
          headingLevel={2}
          icon={<TrendingDownIcon aria-hidden="true" className="size-4" />}
          title={t('Falling')}
        />
        <Panel.Body padded={false}>
          <MoverList
            emptyDescription={nothingMoved}
            emptyTitle={t('Nothing fell')}
            label={t('Falling')}
            rows={props.droppers}
          />
        </Panel.Body>
      </Panel>
    </div>
  )
}
