import { useMutation, useQuery } from '@tanstack/react-query'
import CalculatorIcon from 'lucide-react/dist/esm/icons/calculator'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NumberInput } from '@/components/form'
import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, Skeleton } from '@/components/ui'
import {
  buildPricePayload,
  deploymentDetailQuery,
  extendDeployment,
  type DeploymentDetail,
} from '@/features/deployments/api'
import {
  PriceEstimateSummary,
  usePriceEstimate,
} from '@/features/deployments/components/PriceEstimate'
import { formatRemainingMinutes } from '@/features/deployments/deployment-presentation'
import { formatNumber } from '@/lib/format'

/** The shortest extension io.net accepts: `duration_hours` is validated as ≥ 1. */
const MIN_EXTEND_HOURS = 1

type ExtendDeploymentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  deploymentId: string | undefined
  onExtended: () => void
}

/**
 * Reads back the four inputs the price route needs from `GET /api/deployments/:id`.
 * `Client.GetPriceEstimation` refuses outright when `location_ids` is empty, `hardware_id`
 * is 0 or `replica_count` < 1, so an estimate is simply not requestable for a deployment
 * whose detail is missing any of them — and without an estimate this dialog will not spend.
 */
function pricingInputs(detail: DeploymentDetail | undefined) {
  if (detail === undefined) return undefined
  const locationIds = (detail.locations ?? [])
    .map((location) => location.id)
    .filter((id) => Number.isInteger(id) && id > 0)

  if (
    detail.hardware_id <= 0
    || detail.gpus_per_container <= 0
    || detail.total_containers <= 0
    || locationIds.length === 0
  ) {
    return undefined
  }

  return {
    gpusPerContainer: detail.gpus_per_container,
    hardwareId: detail.hardware_id,
    locationIds,
    replicaCount: detail.total_containers,
  }
}

/**
 * `POST /api/deployments/:id/extend` — THIS SPENDS MONEY: it buys more compute on a live
 * cluster.
 *
 * The confirming button is disabled until an estimate exists that was calculated for the
 * exact number of hours currently in the field. Changing the field invalidates the
 * estimate rather than leaving a stale number under the button.
 */
export function ExtendDeploymentDialog(props: ExtendDeploymentDialogProps) {
  const { t } = useTranslation()
  const [hours, setHours] = useState(MIN_EXTEND_HOURS)
  const [estimatedForHours, setEstimatedForHours] = useState<number | undefined>(undefined)

  const detailQuery = useQuery({
    ...deploymentDetailQuery(props.deploymentId),
    enabled: props.open && props.deploymentId !== undefined,
  })
  const detail = detailQuery.data
  const inputs = pricingInputs(detail)

  const estimate = usePriceEstimate()
  const estimateReset = estimate.reset

  useEffect(() => {
    if (props.open) {
      setHours(MIN_EXTEND_HOURS)
      setEstimatedForHours(undefined)
      estimateReset()
    }
  }, [estimateReset, props.open, props.deploymentId])

  const runEstimate = () => {
    if (inputs === undefined) return
    const forHours = hours
    estimate.mutate(buildPricePayload({ ...inputs, durationHours: forHours }), {
      onSuccess: () => setEstimatedForHours(forHours),
      onError: () => setEstimatedForHours(undefined),
    })
  }

  const extendMutation = useMutation({
    mutationFn: (input: { id: string; hours: number }) => extendDeployment(input.id, input.hours),
    onSuccess: (deployment) => {
      toast.success(t('Extended. io.net reports “{{status}}” and {{remaining}} left.', {
        remaining: formatRemainingMinutes(deployment.compute_minutes_remaining) ?? deployment.time_remaining,
        status: deployment.status,
      }))
      props.onExtended()
      props.onOpenChange(false)
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const hoursValid = Number.isInteger(hours) && hours >= MIN_EXTEND_HOURS
  const estimateIsForCurrentHours = estimatedForHours === hours && estimate.data !== undefined

  const blockReason = ((): string | undefined => {
    if (props.deploymentId === undefined) return t('No deployment is selected.')
    if (detailQuery.isLoading) return t('The deployment is still loading.')
    if (detailQuery.isError) return t('The deployment could not be read, so nothing can be priced.')
    if (!hoursValid) {
      return t('Enter a whole number of hours, at least {{min}}.', { min: MIN_EXTEND_HOURS })
    }
    if (inputs === undefined) {
      return t('io.net did not return a hardware id, a container count and at least one location for this deployment, so its price cannot be estimated.')
    }
    if (estimate.isPending) return t('The estimate is still being calculated.')
    if (!estimateIsForCurrentHours) {
      return estimatedForHours === undefined
        ? t('Calculate the cost before extending.')
        : t('The estimate was calculated for {{estimated}} h. Recalculate it for {{current}} h.', {
          current: formatNumber(hours),
          estimated: formatNumber(estimatedForHours),
        })
    }
    return undefined
  })()

  const remaining = detail === undefined
    ? undefined
    : formatRemainingMinutes(detail.compute_minutes_remaining)

  return (
    <Dialog
      description={t('Extending buys more compute time on a cluster that is already running. It is charged by io.net as soon as it is accepted.')}
      footer={(
        <>
          <Button
            disabled={extendMutation.isPending}
            onClick={() => props.onOpenChange(false)}
            variant="quiet"
          >
            {t('Cancel')}
          </Button>
          <Button
            aria-busy={extendMutation.isPending}
            disabled={extendMutation.isPending || blockReason !== undefined}
            onClick={() => {
              if (props.deploymentId !== undefined) {
                extendMutation.mutate({ hours, id: props.deploymentId })
              }
            }}
            title={blockReason}
            variant="primary"
          >
            {t('Extend and pay')}
          </Button>
        </>
      )}
      onOpenChange={(open) => {
        if (!open && extendMutation.isPending) return
        props.onOpenChange(open)
      }}
      open={props.open}
      size="md"
      title={t('Extend this deployment')}
    >
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="eyebrow">{t('Deployment')}</dt>
            <dd className="mono mt-1 break-all text-sm text-foreground">
              {props.deploymentId ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">{t('Time remaining')}</dt>
            <dd className="mono mt-1 text-sm text-foreground">{remaining ?? '—'}</dd>
          </div>
        </dl>

        {detailQuery.isLoading ? (
          <div aria-busy="true" role="status">
            <span className="sr-only">{t('Loading the deployment')}</span>
            <Skeleton lines={2} variant="text" />
          </div>
        ) : null}

        {detailQuery.isError ? (
          <Alert
            action={
              <Button
                aria-busy={detailQuery.isFetching}
                disabled={detailQuery.isFetching}
                onClick={() => void detailQuery.refetch()}
                size="sm"
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('Could not load this deployment')}
            tone="destructive"
          >
            {toErrorMessage(detailQuery.error)}
          </Alert>
        ) : null}

        <NumberInput
          description={t('Whole hours. io.net rejects anything below {{min}}.', { min: MIN_EXTEND_HOURS })}
          label={t('Hours to add')}
          min={MIN_EXTEND_HOURS}
          onValueChange={(value) => {
            setHours(value === null ? 0 : value)
            setEstimatedForHours(undefined)
          }}
          required
          step={1}
          value={hours}
        />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="eyebrow">{t('Estimated cost')}</h3>
            <Button
              aria-busy={estimate.isPending}
              disabled={estimate.isPending || inputs === undefined || !hoursValid}
              onClick={runEstimate}
              size="sm"
              title={inputs === undefined ? t('This deployment cannot be priced.') : undefined}
              variant="outline"
            >
              <CalculatorIcon aria-hidden="true" />
              {estimate.data === undefined ? t('Calculate the cost') : t('Recalculate')}
            </Button>
          </div>
          <PriceEstimateSummary
            blockedReason={
              inputs === undefined && !detailQuery.isLoading && !detailQuery.isError
                ? t('io.net did not return a hardware id, a container count and at least one location for this deployment, so its price cannot be estimated.')
                : undefined
            }
            error={estimate.error}
            estimate={estimateIsForCurrentHours ? estimate.data : undefined}
            isPending={estimate.isPending}
            onRetry={runEstimate}
          />
          {blockReason === undefined ? null : (
            <p className="text-xs leading-5 text-muted">{blockReason}</p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
