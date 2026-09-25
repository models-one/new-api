import type { UseQueryResult } from '@tanstack/react-query'
import CircleCheckIcon from 'lucide-react/dist/esm/icons/circle-check'
import DownloadCloudIcon from 'lucide-react/dist/esm/icons/download-cloud'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, Panel, Skeleton } from '@/components/ui'
import { formatNumber } from '@/lib/format'

type MissingModelsPanelProps = {
  query: UseQueryResult<string[], unknown>
  /** Opens the editor with the name filled in. */
  onDefine: (modelName: string) => void
  onSync: () => void
}

/** How many chips are shown before the list is collapsed behind a control. */
const VISIBLE_LIMIT = 24

/**
 * `GET /api/models/missing` — the model names an enabled channel serves that have no row
 * in this registry. They still relay; they simply carry no description, vendor, tags or
 * match rule anywhere the catalogue is shown. Closing this list is what the page is for.
 */
export function MissingModelsPanel(props: MissingModelsPanelProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  if (props.query.isLoading) {
    return (
      <Panel aria-busy="true" role="status">
        <Panel.Body>
          <span className="sr-only">{t('Checking which served models have no definition')}</span>
          <Skeleton className="h-5 w-64" />
          <Skeleton className="mt-3 h-8 w-full" />
        </Panel.Body>
      </Panel>
    )
  }

  if (props.query.isError) {
    return (
      <Alert
        action={
          <Button
            aria-busy={props.query.isFetching}
            disabled={props.query.isFetching}
            onClick={() => void props.query.refetch()}
            variant="outline"
          >
            {t('Try again')}
          </Button>
        }
        icon={<TriangleAlertIcon aria-hidden="true" />}
        title={t('Could not check for undefined models')}
        tone="destructive"
      >
        {toErrorMessage(props.query.error)}
      </Alert>
    )
  }

  const missing = props.query.data ?? []

  if (missing.length === 0) {
    return (
      <Alert
        icon={<CircleCheckIcon aria-hidden="true" />}
        title={t('Every served model has a definition')}
        tone="success"
      >
        {t('No enabled channel serves a model name this registry does not define.')}
      </Alert>
    )
  }

  const shown = expanded ? missing : missing.slice(0, VISIBLE_LIMIT)
  const hidden = missing.length - shown.length

  return (
    <Panel aria-label={t('Models with no definition')} as="section">
      <Panel.Header
        actions={
          <Button onClick={props.onSync} variant="outline">
            <DownloadCloudIcon aria-hidden="true" />
            {t('Sync from upstream')}
          </Button>
        }
        description={t('{{count}} model names are served by an enabled channel but have no row here. They still relay — they just carry no description, vendor, tags or match rule anywhere the catalogue is shown.', { count: missing.length })}
        headingLevel={2}
        icon={<TriangleAlertIcon aria-hidden="true" className="size-4 text-warning" />}
        title={t('Served without a definition')}
      />
      <Panel.Body>
        <ul aria-label={t('Undefined model names')} className="flex flex-wrap gap-1.5">
          {shown.map((name) => (
            <li key={name}>
              <Button
                aria-label={t('Define {{name}}', { name })}
                onClick={() => props.onDefine(name)}
                size="sm"
                title={t('Define {{name}}', { name })}
                variant="outline"
              >
                <PlusIcon aria-hidden="true" />
                <span className="mono">{name}</span>
              </Button>
            </li>
          ))}
        </ul>
        {hidden > 0 || expanded ? (
          <div className="mt-3">
            <Button onClick={() => setExpanded(!expanded)} size="sm" variant="quiet">
              {expanded
                ? t('Show fewer')
                : t('Show {{count}} more', { count: formatNumber(hidden) })}
            </Button>
          </div>
        ) : null}
      </Panel.Body>
    </Panel>
  )
}
