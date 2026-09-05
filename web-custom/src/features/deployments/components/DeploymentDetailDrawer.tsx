import { useQuery } from '@tanstack/react-query'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs } from '@/components/disclosure'
import { NativeSelect, type NativeSelectOption } from '@/components/form'
import { Drawer, toErrorMessage } from '@/components/overlay'
import { Alert, Badge, Button, CopyButton, ProgressBar, Skeleton, StatusBadge } from '@/components/ui'
import { EmptyState } from '@/components/system/EmptyState'
import {
  deploymentContainersQuery,
  deploymentDetailQuery,
  deploymentLogsQuery,
} from '@/features/deployments/api'
import {
  COMPLETED_PERCENT_MAX,
  deploymentStatusText,
  deploymentStatusTone,
  formatIoNetAmount,
  formatRemainingMinutes,
  hardwareSummary,
  remainingPercent,
} from '@/features/deployments/deployment-presentation'
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format'

/** `controller.GetDeploymentLogs` clamps `limit` to this ceiling server-side. */
const MAX_LOG_LINES = 1000
const DEFAULT_LOG_LINES = 500

type DeploymentDetailDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  deploymentId: string | undefined
  /** The name from the list row; the detail route does not return one. */
  deploymentName: string | undefined
}

/**
 * Read-only view of one deployment: `GET /api/deployments/:id`,
 * `GET /api/deployments/:id/containers` and `GET /api/deployments/:id/logs`.
 *
 * The detail route's `deployment_name` is the id assigned a second time, and `model_name`,
 * `model_version`, `description` and `resource_config.cpu/.memory` are hard-coded to ""
 * by the handler, so none of them appear here. The name shown is the one the LIST route
 * carried, which is io.net's real cluster name.
 */
export function DeploymentDetailDrawer(props: DeploymentDetailDrawerProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('overview')
  const [containerId, setContainerId] = useState('')
  const [stream, setStream] = useState('')

  const detailQuery = useQuery({
    ...deploymentDetailQuery(props.deploymentId),
    enabled: props.open && props.deploymentId !== undefined,
  })
  const detail = detailQuery.data

  const containersQuery = useQuery(
    deploymentContainersQuery(props.deploymentId, props.open),
  )
  const containers = containersQuery.data?.containers ?? []
  const firstContainerId = containers[0]?.container_id

  useEffect(() => {
    if (!props.open) {
      setTab('overview')
      setContainerId('')
      setStream('')
    }
  }, [props.open])

  /** Selects the first worker once io.net reports one, so the log tab is never blank. */
  useEffect(() => {
    if (containerId !== '' || firstContainerId === undefined) return
    setContainerId(firstContainerId)
  }, [containerId, firstContainerId])

  const logsQuery = useQuery(
    deploymentLogsQuery(
      props.deploymentId,
      { container_id: containerId, limit: DEFAULT_LOG_LINES, stream },
      props.open && tab === 'logs',
    ),
  )

  const containerOptions: NativeSelectOption[] = containers.map((container) => ({
    label: container.container_id,
    value: container.container_id,
  }))

  const streamOptions: NativeSelectOption[] = [
    { label: t('Both streams'), value: '' },
    { label: t('Standard output'), value: 'stdout' },
    { label: t('Standard error'), value: 'stderr' },
  ]

  const logText = logsQuery.data ?? ''
  const logLines = logText === '' ? [] : logText.replaceAll(/\r\n?/g, '\n').split('\n')

  const consumed = detail === undefined ? null : detail.completed_percent
  const left = consumed === null ? null : remainingPercent(consumed)

  return (
    <Drawer
      description={t('Everything io.net reports about this cluster, its containers and their output.')}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="xl"
      title={props.deploymentName ?? t('Deployment')}
    >
      <div className="flex flex-col gap-5">
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="eyebrow">{t('ID')}</span>
          <span className="mono break-all text-foreground">{props.deploymentId ?? '—'}</span>
          {props.deploymentId === undefined ? null : (
            <CopyButton label={t('Copy the deployment id')} size="sm" value={props.deploymentId} />
          )}
        </p>

        <Tabs onValueChange={setTab} value={tab}>
          <Tabs.List label={t('Deployment views')}>
            <Tabs.Tab value="overview">{t('Overview')}</Tabs.Tab>
            <Tabs.Tab value="containers">
              {t('Containers')}
              {containersQuery.data === undefined ? null : (
                <Badge className="ml-2" size="sm" tone="muted">
                  {formatNumber(containersQuery.data.total)}
                </Badge>
              )}
            </Tabs.Tab>
            <Tabs.Tab value="logs">{t('Logs')}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel className="pt-4" value="overview">
            {detailQuery.isLoading ? (
              <div aria-busy="true" role="status">
                <span className="sr-only">{t('Loading the deployment')}</span>
                <Skeleton lines={6} variant="text" />
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
                <span className="mono block break-words text-xs leading-5">
                  {toErrorMessage(detailQuery.error)}
                </span>
              </Alert>
            ) : null}

            {detail === undefined ? null : (
              <div className="flex flex-col gap-5">
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="eyebrow">{t('Status')}</dt>
                    <dd className="mt-1">
                      <StatusBadge tone={deploymentStatusTone(detail.status)}>
                        {deploymentStatusText(detail.status, t)}
                      </StatusBadge>
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">{t('Hardware')}</dt>
                    <dd className="mono mt-1 text-sm text-foreground">
                      {hardwareSummary(detail.brand_name, detail.hardware_name, detail.total_gpus) || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">{t('Hardware id')}</dt>
                    <dd className="mono mt-1 text-sm text-foreground">
                      {formatNumber(detail.hardware_id)}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">{t('Containers')}</dt>
                    <dd className="mono mt-1 text-sm text-foreground">
                      {formatNumber(detail.total_containers)}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">{t('GPUs per container')}</dt>
                    <dd className="mono mt-1 text-sm text-foreground">
                      {formatNumber(detail.gpus_per_container)}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">{t('Total GPUs')}</dt>
                    <dd className="mono mt-1 text-sm text-foreground">
                      {formatNumber(detail.total_gpus)}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">{t('Amount paid')}</dt>
                    <dd className="mono mt-1 text-sm text-foreground">
                      {formatIoNetAmount(detail.amount_paid, '')}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">{t('Created')}</dt>
                    <dd className="mono mt-1 text-sm text-foreground">
                      {formatDateTime(detail.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">{t('Compute served')}</dt>
                    <dd className="mono mt-1 text-sm text-foreground">
                      {formatRemainingMinutes(detail.compute_minutes_served) ?? '—'}
                    </dd>
                  </div>
                </dl>

                {left === null ? null : (
                  <div>
                    <ProgressBar
                      label={t('Share of the paid compute window still unspent')}
                      showValue
                      tone="primary"
                      value={left}
                      valueText={formatPercent(left, 0)}
                    />
                    <p className="mt-2 text-xs leading-5 text-muted">
                      {t('Derived here: remaining % = {{max}} − completed_percent ({{consumed}} reported by io.net). {{remaining}} of compute time is left.', {
                        consumed: formatPercent(consumed ?? 0, 0),
                        max: COMPLETED_PERCENT_MAX,
                        remaining: formatRemainingMinutes(detail.compute_minutes_remaining) ?? '—',
                      })}
                    </p>
                  </div>
                )}

                <p className="text-xs leading-5 text-muted">
                  {t('io.net sends amount_paid as a bare number with no currency beside it, so none is shown here. The currency only appears on a price estimate, which reports its own.')}
                </p>

                <div>
                  <h3 className="eyebrow">{t('Locations')}</h3>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(detail.locations ?? []).length === 0 ? (
                      <span className="text-xs text-muted">{t('None reported.')}</span>
                    ) : (
                      (detail.locations ?? []).map((location) => (
                        <Badge key={location.id} size="sm" tone="muted">
                          {location.iso2 === '' ? location.name : `${location.name} (${location.iso2})`}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="eyebrow">{t('Container configuration')}</h3>
                  <dl className="mt-2 flex flex-col gap-3">
                    <div>
                      <dt className="text-xs text-muted">{t('Image URL')}</dt>
                      <dd className="mono break-all text-sm text-foreground">
                        {detail.container_config.image_url === '' ? '—' : detail.container_config.image_url}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('Traffic port')}</dt>
                      <dd className="mono text-sm text-foreground">
                        {detail.container_config.traffic_port > 0
                          ? formatNumber(detail.container_config.traffic_port)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('Entrypoint')}</dt>
                      <dd className="mono break-all text-sm text-foreground">
                        {(detail.container_config.entrypoint ?? []).join(' ') || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('Environment variables')}</dt>
                      <dd className="mono text-sm text-foreground">
                        {t('{{count}} keys', {
                          count: Object.keys(detail.container_config.env_variables ?? {}).length,
                        })}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {t('Environment values are shown as a count, not printed: io.net returns plain env_variables here and a deployment often carries a token in one of them. Secret environment variables and registry credentials are never returned at all.')}
                  </p>
                </div>
              </div>
            )}
          </Tabs.Panel>

          <Tabs.Panel className="pt-4" value="containers">
            {containersQuery.isLoading ? (
              <div aria-busy="true" role="status">
                <span className="sr-only">{t('Loading the containers')}</span>
                <Skeleton lines={4} variant="text" />
              </div>
            ) : null}

            {containersQuery.isError ? (
              <Alert
                action={
                  <Button
                    aria-busy={containersQuery.isFetching}
                    disabled={containersQuery.isFetching}
                    onClick={() => void containersQuery.refetch()}
                    size="sm"
                    variant="outline"
                  >
                    {t('Try again')}
                  </Button>
                }
                icon={<TriangleAlertIcon aria-hidden="true" />}
                title={t('Could not load the containers')}
                tone="destructive"
              >
                <span className="mono block break-words text-xs leading-5">
                  {toErrorMessage(containersQuery.error)}
                </span>
              </Alert>
            ) : null}

            {containersQuery.data !== undefined && containers.length === 0 ? (
              <EmptyState
                description={t('io.net has not reported a worker for this deployment. A cluster that is still being provisioned has none yet.')}
                headingLevel={3}
                title={t('No containers')}
              />
            ) : null}

            <ul className="flex flex-col gap-3">
              {containers.map((container) => (
                <li className="panel p-4" key={container.container_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="mono break-all text-sm font-semibold text-foreground">
                        {container.container_id}
                      </p>
                      <p className="mono mt-1 break-all text-xs text-muted">{container.device_id}</p>
                    </div>
                    <StatusBadge tone={deploymentStatusTone(container.status)}>
                      {deploymentStatusText(container.status, t)}
                    </StatusBadge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <dt className="eyebrow">{t('Hardware')}</dt>
                      <dd className="mono mt-1 text-xs text-foreground">
                        {hardwareSummary(container.brand_name, container.hardware, container.gpus_per_container) || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="eyebrow">{t('Uptime')}</dt>
                      <dd className="mono mt-1 text-xs text-foreground">
                        {formatPercent(container.uptime_percent, 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="eyebrow">{t('Created')}</dt>
                      <dd className="mono mt-1 text-xs text-foreground">
                        {formatDateTime(container.created_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="eyebrow">{t('Public URL')}</dt>
                      <dd className="mono mt-1 break-all text-xs text-foreground">
                        {container.public_url === '' ? '—' : container.public_url}
                      </dd>
                    </div>
                  </dl>
                  {container.events.length === 0 ? null : (
                    <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
                      {container.events.map((event) => (
                        <li className="flex flex-wrap gap-2 text-xs" key={`${event.time}-${event.message}`}>
                          <span className="mono shrink-0 text-muted">{formatDateTime(event.time)}</span>
                          <span className="min-w-0 break-words text-foreground">{event.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Tabs.Panel>

          <Tabs.Panel className="pt-4" value="logs">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <NativeSelect
                  className="w-full sm:w-72"
                  disabled={containerOptions.length === 0}
                  label={t('Container')}
                  onChange={(event) => setContainerId(event.target.value)}
                  options={containerOptions}
                  placeholder={containerOptions.length === 0 ? t('No containers') : undefined}
                  selectClassName="mono"
                  size="sm"
                  value={containerId}
                />
                <NativeSelect
                  className="w-full sm:w-48"
                  label={t('Stream')}
                  onChange={(event) => setStream(event.target.value)}
                  options={streamOptions}
                  size="sm"
                  value={stream}
                />
                <Button
                  aria-busy={logsQuery.isFetching}
                  disabled={logsQuery.isFetching || containerId === ''}
                  onClick={() => void logsQuery.refetch()}
                  size="sm"
                  title={containerId === '' ? t('Pick a container first.') : undefined}
                  variant="outline"
                >
                  <RefreshCwIcon aria-hidden="true" />
                  {t('Refresh')}
                </Button>
              </div>

              <p className="text-xs leading-5 text-muted">
                {t('A container must be named: the server refuses the log route without container_id. It returns io.net’s response body as one block of text — at most {{limit}} lines are requested and the server caps any request at {{max}}.', {
                  limit: DEFAULT_LOG_LINES,
                  max: MAX_LOG_LINES,
                })}
              </p>

              {containerId === '' ? (
                <EmptyState
                  description={t('Pick a container above to read its output.')}
                  headingLevel={3}
                  title={t('No container selected')}
                />
              ) : null}

              {logsQuery.isLoading ? (
                <div aria-busy="true" role="status">
                  <span className="sr-only">{t('Loading the logs')}</span>
                  <Skeleton lines={8} variant="text" />
                </div>
              ) : null}

              {logsQuery.isError ? (
                <Alert
                  action={
                    <Button onClick={() => void logsQuery.refetch()} size="sm" variant="outline">
                      {t('Try again')}
                    </Button>
                  }
                  icon={<TriangleAlertIcon aria-hidden="true" />}
                  title={t('Could not load the logs')}
                  tone="destructive"
                >
                  <span className="mono block break-words text-xs leading-5">
                    {toErrorMessage(logsQuery.error)}
                  </span>
                </Alert>
              ) : null}

              {logsQuery.data !== undefined && logLines.length === 0 ? (
                <EmptyState
                  description={t('io.net returned an empty body for this container and stream.')}
                  headingLevel={3}
                  title={t('No output')}
                />
              ) : null}

              {logLines.length === 0 ? null : (
                <pre
                  aria-label={t('Container output')}
                  className="mono max-h-96 overflow-auto rounded-[4px] border border-border bg-surface px-3 py-2 text-xs leading-5 text-foreground"
                  tabIndex={0}
                >
                  {logText}
                </pre>
              )}
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </Drawer>
  )
}
