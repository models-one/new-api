import { useMutation } from '@tanstack/react-query'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, Skeleton } from '@/components/ui'
import {
  estimateDeploymentPrice,
  type PriceEstimation,
  type PriceEstimationPayload,
} from '@/features/deployments/api'
import { formatIoNetAmount } from '@/features/deployments/deployment-presentation'

/**
 * A price estimate that is only ever produced by a fresh `POST
 * /api/deployments/price-estimation` for the exact values being confirmed.
 *
 * Deliberately a MUTATION and not a query: a cached estimate keyed on older inputs is the
 * one failure mode that matters here, because the number sits next to a button that rents
 * GPUs. Nothing is read from a cache, and a re-open re-asks.
 */
export function usePriceEstimate() {
  return useMutation({
    mutationFn: (payload: PriceEstimationPayload) => estimateDeploymentPrice(payload),
  })
}

export type PriceEstimateState = ReturnType<typeof usePriceEstimate>

type PriceEstimateSummaryProps = {
  estimate: PriceEstimation | undefined
  isPending: boolean
  error: unknown
  /** Re-runs the estimate with the same snapshot of values. */
  onRetry: () => void
  /** Set when the estimate cannot even be requested; explains which input is missing. */
  blockedReason?: string
}

/**
 * The estimate block shown inside both money confirmations.
 *
 * Only the four numbers the server actually sends are shown. `network_cost` and
 * `storage_cost` are `omitempty` in Go and never written, so they are absent rather than
 * zero and are not displayed. The one derived figure — fees — is labelled with its
 * formula and its source fields.
 */
export function PriceEstimateSummary(props: PriceEstimateSummaryProps) {
  const { t } = useTranslation()
  const { estimate, isPending, error } = props

  if (props.blockedReason !== undefined) {
    return (
      <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('No estimate can be requested')} tone="warning">
        {props.blockedReason}
      </Alert>
    )
  }

  if (isPending) {
    return (
      <div aria-busy="true" className="panel p-4" role="status">
        <span className="sr-only">{t('Asking io.net what this costs')}</span>
        <Skeleton lines={3} variant="text" />
      </div>
    )
  }

  if (error !== null && error !== undefined) {
    return (
      <Alert
        action={
          <Button onClick={props.onRetry} size="sm" variant="outline">
            <RefreshCwIcon aria-hidden="true" />
            {t('Try the estimate again')}
          </Button>
        }
        icon={<TriangleAlertIcon aria-hidden="true" />}
        title={t('The price estimate failed')}
        tone="destructive"
      >
        <span className="mono block break-words text-xs leading-5">{toErrorMessage(error)}</span>
      </Alert>
    )
  }

  if (estimate === undefined) {
    return (
      <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
        {t('No estimate yet.')}
      </Alert>
    )
  }

  const currency = estimate.currency
  const breakdown = estimate.price_breakdown
  /** Derived in the browser: FEES = price_breakdown.total_cost − price_breakdown.compute_cost. */
  const fees = breakdown.total_cost - breakdown.compute_cost

  return (
    <div className="panel p-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="eyebrow">{t('Total')}</dt>
          <dd className="mono mt-1 text-lg font-semibold text-foreground">
            {formatIoNetAmount(estimate.estimated_cost, currency)}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{t('Hourly rate')}</dt>
          <dd className="mono mt-1 text-sm text-foreground">
            {formatIoNetAmount(breakdown.hourly_rate, currency)}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{t('Compute')}</dt>
          <dd className="mono mt-1 text-sm text-foreground">
            {formatIoNetAmount(breakdown.compute_cost, currency)}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{t('Fees')}</dt>
          <dd className="mono mt-1 text-sm text-foreground">
            {formatIoNetAmount(fees, currency)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted">
        {t('Total and hourly rate come from io.net. Fees is derived here as total_cost − compute_cost; compute_cost is what io.net reports after its own platform and conversion fees are taken off the total. Amounts are settled in the provider’s currency, not in gateway quota.')}
      </p>
    </div>
  )
}
