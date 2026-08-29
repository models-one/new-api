import InfoIcon from 'lucide-react/dist/esm/icons/info'
import { useTranslation } from 'react-i18next'

import { seriesTone } from '@/components/chart'
import { EmptyState } from '@/components/system/EmptyState'
import { Panel, ProgressBar, Skeleton } from '@/components/ui'
import {
  MODEL_SHARE_ROW_LIMIT,
  foldRemainingShares,
  type ModelShare,
} from '@/features/analytics/usage'
import { formatPercent, formatTokens } from '@/lib/format'

type ModelTokenPanelProps = {
  shares: readonly ModelShare[]
  isPending: boolean
  isFetching: boolean
}

type ShareRow = {
  key: string
  name: string
  share: number
  tokens: number
}

export function ModelTokenPanel(props: ModelTokenPanelProps) {
  const { t } = useTranslation()

  const remainder = foldRemainingShares(props.shares)
  const rows: ShareRow[] = props.shares.slice(0, MODEL_SHARE_ROW_LIMIT).map((entry) => ({
    key: entry.model,
    name: entry.model,
    share: entry.share,
    tokens: entry.tokens,
  }))

  if (remainder) {
    rows.push({
      key: '__remaining__',
      name: t('Other models ({{models}})', {
        models: props.shares.length - MODEL_SHARE_ROW_LIMIT,
      }),
      share: remainder.share,
      tokens: remainder.tokens,
    })
  }

  return (
    <Panel className="flex flex-col p-6">
      <h2 className="text-lg font-bold">{t('Token usage by model')}</h2>
      <p className="mt-1 text-sm text-muted">{t('Your own tokens for the selected range.')}</p>

      <div aria-busy={props.isFetching} className="mt-7 flex flex-col gap-5">
        {props.isPending
          ? [0, 1, 2, 3].map((slot) => (
              <div className="flex flex-col gap-2" key={slot}>
                <Skeleton
                  label={slot === 0 ? t('Loading model token shares') : undefined}
                  width="55%"
                />
                <Skeleton height={6} variant="block" />
              </div>
            ))
          : null}

        {!props.isPending && rows.length === 0 ? (
          <EmptyState
            description={t('No tokens were recorded for your account in this range.')}
            headingLevel={3}
            title={t('No model usage yet')}
          />
        ) : null}

        {!props.isPending
          ? rows.map((row, index) => (
              <div key={row.key}>
                <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                  <span className="mono truncate" title={row.name}>
                    {row.name}
                  </span>
                  <span className="mono shrink-0 text-muted">{formatPercent(row.share, 1)}</span>
                </div>
                <ProgressBar
                  label={t('Token share for {{model}}', { model: row.name })}
                  max={100}
                  size="sm"
                  tone={seriesTone(index)}
                  value={row.share}
                  valueText={t('{{percent}} of your tokens, {{tokens}} tokens', {
                    percent: formatPercent(row.share, 1),
                    tokens: formatTokens(row.tokens),
                  })}
                />
              </div>
            ))
          : null}
      </div>

      <div className="mt-8 flex gap-3 border-t border-border pt-5 text-sm leading-6 text-muted">
        <InfoIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
        <p>
          {t(
            'Percentages are calculated in this console: model tokens divided by your total tokens for the range.',
          )}
        </p>
      </div>
    </Panel>
  )
}
