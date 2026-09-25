import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog, toast } from '@/components/overlay'
import { Alert, Badge, Button, DescriptionList, Panel } from '@/components/ui'
import { useServerStatus } from '@/hooks/use-server-status'
import { formatDateTime } from '@/lib/format'

/**
 * `/system-settings/operations/update-checker`
 *
 * NOT AN OPTION SECTION. It reads nothing from `/api/option/` and writes nothing. The two
 * facts it shows come from `GET /api/status`, which the dev server answers with
 * `"version":"v0.0.0"` and `"start_time":1788051051` — a UNIX SECONDS value, like every
 * other timestamp in this API.
 *
 * The release check calls the PUBLIC GitHub releases API directly from the browser. There
 * is no server endpoint for it: nothing under `/api` proxies GitHub. That has consequences
 * this section is honest about — it is an unauthenticated cross-origin request that a
 * corporate proxy, an ad blocker or GitHub's own rate limit can refuse, and a failure means
 * "could not ask", never "you are up to date".
 *
 * `version` is `v0.0.0` on a development build, which is not a real release tag and can
 * never match one. That case is called out rather than reported as "an update is available".
 */

const RELEASES_ENDPOINT = 'https://api.github.com/repos/Calcium-Ion/new-api/releases/latest'
const DEVELOPMENT_VERSION = 'v0.0.0'

type ReleaseInfo = {
  tag_name: string
  html_url?: string
  published_at?: string
  body?: string
}

function readRelease(payload: unknown): ReleaseInfo | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const record = payload as Record<string, unknown>
  if (typeof record.tag_name !== 'string' || record.tag_name === '') return undefined

  return {
    body: typeof record.body === 'string' ? record.body : undefined,
    html_url: typeof record.html_url === 'string' ? record.html_url : undefined,
    published_at: typeof record.published_at === 'string' ? record.published_at : undefined,
    tag_name: record.tag_name,
  }
}

export function UpdateCheckerSection() {
  const { t } = useTranslation()
  const statusQuery = useServerStatus()

  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | undefined>(undefined)
  const [release, setRelease] = useState<ReleaseInfo | undefined>(undefined)
  const [dialogOpen, setDialogOpen] = useState(false)

  const version = statusQuery.data?.version ?? ''
  const startedAt = statusQuery.data?.start_time
  const isDevelopmentBuild = version === DEVELOPMENT_VERSION || version === ''

  const checkForUpdates = async () => {
    setChecking(true)
    setCheckError(undefined)
    try {
      const response = await fetch(RELEASES_ENDPOINT, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (!response.ok) {
        throw new Error(
          t('GitHub answered {{status}}. This check is unauthenticated, so it is rate limited per IP address.', { status: response.status }),
        )
      }

      const parsed = readRelease(await response.json())
      if (parsed === undefined) throw new Error(t('GitHub returned a release without a version tag.'))

      setRelease(parsed)
      if (parsed.tag_name === version) {
        toast.success(t('This deployment is on the latest release ({{version}}).', { version }))
        return
      }
      setDialogOpen(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('The release check failed.')
      setCheckError(message)
      toast.error(message)
    } finally {
      setChecking(false)
    }
  }

  /**
   * Loading, failed and loaded as three branches rather than one nested expression: the
   * version is the whole point of this panel, so "we could not read it" must never be
   * rendered as a blank or as a plausible-looking dash.
   */
  const deploymentFacts = ((): ReactNode => {
    if (statusQuery.isPending) {
      return (
        <p className="text-xs text-muted" role="status">
          {t('Reading the server status…')}
        </p>
      )
    }

    if (statusQuery.isError) {
      return (
        <Alert
          action={
            <Button
              aria-busy={statusQuery.isFetching}
              disabled={statusQuery.isFetching}
              onClick={() => void statusQuery.refetch()}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('The server status could not be read')}
          tone="destructive"
        >
          {t('The running version and start time both come from the status endpoint, which did not answer.')}
        </Alert>
      )
    }

    return (
      <DescriptionList
        items={[
          {
            description: (
              <span className="flex items-center justify-end gap-2">
                <span className="mono">{version === '' ? t('Unknown') : version}</span>
                {isDevelopmentBuild ? (
                  <Badge size="sm" tone="warning">
                    {t('Development build')}
                  </Badge>
                ) : null}
              </span>
            ),
            term: t('Running version'),
          },
          {
            description:
              typeof startedAt === 'number' && startedAt > 0
                ? formatDateTime(startedAt)
                : t('Unknown'),
            term: t('Running since'),
          },
        ]}
        label={t('Deployment')}
      />
    )
  })()

  const openRelease = () => {
    if (release?.html_url === undefined) return
    window.open(release.html_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <Panel as="section">
        <Panel.Header
          description={t('What this deployment is running, and how to compare it against the published releases.')}
          title={t('System maintenance')}
        />

        <Panel.Body className="flex flex-col gap-5">
          {deploymentFacts}

          {isDevelopmentBuild && !statusQuery.isPending && !statusQuery.isError ? (
            <Alert title={t('This build reports no release version')} tone="info">
              {t('It was compiled without a version tag, so it can never match a published release. The check below will always report the newest release as newer.')}
            </Alert>
          ) : null}

          {checkError !== undefined ? (
            <Alert
              icon={<TriangleAlertIcon aria-hidden="true" />}
              title={t('The release check did not complete')}
              tone="warning"
            >
              {t('{{reason}} This says nothing about whether an update exists — the request never got an answer.', { reason: checkError })}
            </Alert>
          ) : null}

          <p className="text-xs leading-5 text-muted">
            {t('The check asks the public GitHub releases API from your browser, not from the server. A network policy, an extension or GitHub’s rate limit can block it.')}
          </p>
        </Panel.Body>

        <Panel.Footer align="end">
          {release?.html_url !== undefined ? (
            <Button onClick={() => setDialogOpen(true)} size="sm" variant="outline">
              {t('Show the latest release')}
            </Button>
          ) : null}
          <Button
            aria-busy={checking}
            disabled={checking}
            onClick={() => void checkForUpdates()}
            size="sm"
          >
            <RefreshCwIcon aria-hidden="true" />
            {checking ? t('Checking…') : t('Check for a newer release')}
          </Button>
        </Panel.Footer>
      </Panel>

      <Dialog
        description={
          release?.published_at === undefined
            ? undefined
            : t('Published {{date}}', {
                date: formatDateTime(Math.floor(new Date(release.published_at).getTime() / 1000)),
              })
        }
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)} variant="quiet">
              {t('Close')}
            </Button>
            {release?.html_url === undefined ? null : (
              <Button onClick={openRelease}>
                <ExternalLinkIcon aria-hidden="true" />
                {t('Open the release on GitHub')}
              </Button>
            )}
          </>
        }
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        size="md"
        title={
          release === undefined
            ? t('Release details')
            : t('Latest release: {{version}}', { version: release.tag_name })
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-6 text-muted">
            {t('This deployment reports {{current}}. Upgrading is done outside this console.', {
              current: version === '' ? t('Unknown') : version,
            })}
          </p>
          {release?.body === undefined || release.body.trim() === '' ? (
            <p className="text-sm text-muted">{t('GitHub returned no notes for this release.')}</p>
          ) : (
            <pre className="mono max-h-80 overflow-auto whitespace-pre-wrap rounded-[4px] border border-border bg-surface-high p-3 text-xs leading-5">
              {release.body}
            </pre>
          )}
        </div>
      </Dialog>
    </>
  )
}
