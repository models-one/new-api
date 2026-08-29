import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { seriesTone } from '@/components/chart'
import { EmptyState } from '@/components/system/EmptyState'
import { Button, Panel, ProgressBar, Skeleton } from '@/components/ui'
import type { KeySpend } from '@/features/usage/flow'
import { formatPercent, formatQuota } from '@/lib/format'

/** Keys listed individually before the rest are folded into one remainder row. */
const KEY_ROW_LIMIT = 6

type KeySpendPanelProps = {
  keys: readonly KeySpend[]
  /**
   * Quota the flow endpoint could not attribute to any key, i.e. the window total
   * minus the sum of these rows. Zero when everything is accounted for.
   */
  unattributedQuota: number
  quotaPerUnit: number
  isPending: boolean
  isFetching: boolean
}

export function KeySpendPanel(props: KeySpendPanelProps) {
  const { t } = useTranslation()

  const listed = props.keys.slice(0, KEY_ROW_LIMIT)
  const rest = props.keys.slice(KEY_ROW_LIMIT)
  const remainder = rest.reduce(
    (total, key) => ({ quota: total.quota + key.quota, share: total.share + key.share }),
    { quota: 0, share: 0 },
  )

  // `token_name` is empty for a key that has since been deleted, and the row carries
  // no `token_id` at all when the usage was never tied to one (both seen live).
  function keyLabel(key: KeySpend): string {
    if (key.name) return key.name
    if (key.tokenId > 0) return t('Deleted key #{{id}}', { id: key.tokenId })
    return t('Not tied to a key')
  }

  return (
    <Panel className="flex flex-col p-6">
      <h2 className="text-lg font-bold">{t('Top API keys')}</h2>
      <p className="mt-1 text-sm text-muted">{t('Your spend per key for the charted window.')}</p>

      <div aria-busy={props.isFetching} className="mt-6 flex flex-col gap-5">
        {props.isPending ? (
          <div className="flex flex-col gap-5" role="status">
            <span className="sr-only">{t('Loading spend per key')}</span>
            {[0, 1, 2].map((slot) => (
              <div className="flex flex-col gap-2" key={slot}>
                <Skeleton height={12} variant="block" width="60%" />
                <Skeleton height={4} variant="block" />
              </div>
            ))}
          </div>
        ) : null}

        {!props.isPending && props.keys.length === 0 ? (
          <EmptyState
            description={t('No key recorded any spend in this window.')}
            headingLevel={3}
            title={t('No key activity')}
          />
        ) : null}

        {props.isPending
          ? null
          : listed.map((key, index) => {
              const label = keyLabel(key)
              return (
                <div key={key.id}>
                  <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
                    <span className="mono truncate" title={label}>
                      {label}
                    </span>
                    <span className="mono shrink-0 text-primary">
                      {formatQuota(key.quota, props.quotaPerUnit)}
                    </span>
                  </div>
                  <ProgressBar
                    label={t('Share of key spend for {{key}}', { key: label })}
                    max={100}
                    size="xs"
                    tone={seriesTone(index)}
                    value={key.share}
                    valueText={t('{{percent}} of the spend attributed to keys', {
                      percent: formatPercent(key.share, 1),
                    })}
                  />
                </div>
              )
            })}

        {props.isPending || rest.length === 0 ? null : (
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
            <span className="truncate">{t('Other keys ({{keys}})', { keys: rest.length })}</span>
            <span className="mono shrink-0">
              {formatQuota(remainder.quota, props.quotaPerUnit)}
            </span>
          </div>
        )}
      </div>

      {!props.isPending && props.unattributedQuota > 0 ? (
        <p className="mt-6 text-xs leading-5 text-muted">
          {t(
            'A further {{amount}} of this window carries no billing group, so the server cannot attribute it to a key.',
            { amount: formatQuota(props.unattributedQuota, props.quotaPerUnit) },
          )}
        </p>
      ) : null}

      <div className="mt-auto pt-6">
        <Button className="w-full" render={<Link to="/settings" />} variant="quiet">
          {t('View all keys')}
        </Button>
      </div>
    </Panel>
  )
}
