import { Link } from '@tanstack/react-router'
import CheckIcon from 'lucide-react/dist/esm/icons/check'
import CircleIcon from 'lucide-react/dist/esm/icons/circle'
import PlugZapIcon from 'lucide-react/dist/esm/icons/plug-zap'
import SettingsIcon from 'lucide-react/dist/esm/icons/settings'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import XIcon from 'lucide-react/dist/esm/icons/x'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Badge, Button, Panel, Spinner } from '@/components/ui'
import type { DeploymentIntegration } from '@/features/deployments/integration'

/** Where the two switches this page depends on are edited. */
const SETTINGS_PARAMS = { group: 'models', section: 'model-deployment' } as const

type StepStatus = 'pass' | 'fail' | 'pending' | 'running' | 'blocked'

type Step = {
  id: string
  title: string
  detail: string
  status: StepStatus
}

function StepMark(props: { status: StepStatus }) {
  if (props.status === 'running') return <Spinner decorative size="sm" />
  if (props.status === 'pass') {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-success/15 text-success">
        <CheckIcon aria-hidden="true" className="size-3.5" />
      </span>
    )
  }
  if (props.status === 'fail') {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <XIcon aria-hidden="true" className="size-3.5" />
      </span>
    )
  }
  return (
    <span className="flex size-5 items-center justify-center text-muted">
      <CircleIcon aria-hidden="true" className="size-3" />
    </span>
  )
}

type IntegrationGuardProps = {
  state: Exclude<DeploymentIntegration, { kind: 'ready' }>
  isRechecking: boolean
  onRecheck: () => void
}

/**
 * The whole page when either gate is shut. It never shows a bare "unavailable": it names
 * WHICH of the two gates failed, quotes what the server said, and points at the one screen
 * where it is fixed.
 */
export function IntegrationGuard(props: IntegrationGuardProps) {
  const { t } = useTranslation()
  const { state } = props

  const flagStatus = ((): StepStatus => {
    switch (state.kind) {
      case 'checking':
        return state.step === 'settings' ? 'running' : 'pass'
      case 'settings-error':
        return 'pending'
      case 'disabled':
        return 'fail'
      case 'unconfigured':
        return 'fail'
      case 'unreachable':
        return 'pass'
    }
  })()

  const connectionStatus = ((): StepStatus => {
    switch (state.kind) {
      case 'checking':
        return state.step === 'connection' ? 'running' : 'pending'
      case 'settings-error':
        return 'pending'
      case 'disabled':
      case 'unconfigured':
        return 'blocked'
      case 'unreachable':
        return 'fail'
    }
  })()

  const flagDetail = ((): string => {
    switch (state.kind) {
      case 'disabled':
        return t('model_deployment.ionet.enabled is off. Nothing on this page can be requested until an administrator switches the provider on.')
      case 'unconfigured':
        return t('The provider is switched on, but no io.net API key is stored. The server refuses every deployment route while the key is empty.')
      case 'settings-error':
        return t('The settings route did not answer, so neither switch could be read.')
      default:
        return t('model_deployment.ionet.enabled is on and an API key is stored. The key itself is never returned by the server.')
    }
  })()

  const connectionDetail = ((): string => {
    switch (state.kind) {
      case 'disabled':
      case 'unconfigured':
        return t('Not attempted: the connection is only tested once the provider is switched on and a key is stored.')
      case 'settings-error':
        return t('Not attempted: the switches could not be read.')
      case 'unreachable':
        return t('io.net rejected the stored key, or could not be reached. The server sends its own words back verbatim.')
      default:
        return t('The stored key is being sent to io.net to list the hardware this account may rent.')
    }
  })()

  const steps: Step[] = [
    {
      detail: flagDetail,
      id: 'flag',
      status: flagStatus,
      title: t('Step 1 — the integration is switched on and holds a key'),
    },
    {
      detail: connectionDetail,
      id: 'connection',
      status: connectionStatus,
      title: t('Step 2 — io.net answers with that key'),
    },
  ]

  const heading = ((): string => {
    switch (state.kind) {
      case 'checking':
        return t('Checking the io.net integration')
      case 'settings-error':
        return t('The io.net integration could not be checked')
      case 'disabled':
        return t('The io.net integration is switched off')
      case 'unconfigured':
        return t('The io.net integration has no API key')
      case 'unreachable':
        return t('io.net did not accept the stored key')
    }
  })()

  const serverMessage = ((): string | undefined => {
    if (state.kind === 'settings-error' || state.kind === 'unreachable') {
      return toErrorMessage(state.error)
    }
    return undefined
  })()

  const busy = state.kind === 'checking'

  return (
    <Panel aria-busy={busy} as="section">
      <Panel.Header
        description={t('GPU capacity is rented from io.net. This console will not offer a control it cannot actually reach, so the manager stays hidden until both checks below pass.')}
        icon={<PlugZapIcon aria-hidden="true" />}
        title={heading}
      />
      <Panel.Body>
        <ol aria-label={t('io.net readiness checks')} className="flex flex-col gap-4">
          {steps.map((step) => (
            <li className="flex items-start gap-3" key={step.id}>
              <span className="mt-0.5 shrink-0">
                <StepMark status={step.status} />
                <span className="sr-only">
                  {step.status === 'pass' ? t('Passed') : null}
                  {step.status === 'fail' ? t('Failed') : null}
                  {step.status === 'running' ? t('Checking') : null}
                  {step.status === 'pending' ? t('Not checked') : null}
                  {step.status === 'blocked' ? t('Skipped') : null}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{step.title}</span>
                  {step.status === 'fail' ? (
                    <Badge size="sm" tone="destructive">{t('Failed')}</Badge>
                  ) : null}
                  {step.status === 'blocked' ? (
                    <Badge size="sm" tone="muted">{t('Skipped')}</Badge>
                  ) : null}
                </span>
                <span className="text-xs leading-5 text-muted">{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>

        {serverMessage === undefined ? null : (
          <Alert
            className="mt-5"
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('What the server said')}
            tone="destructive"
          >
            <span className="mono block break-words text-xs leading-5">{serverMessage}</span>
          </Alert>
        )}
      </Panel.Body>
      <Panel.Footer align="between">
        <p className="text-xs leading-5 text-muted">
          {t('Both switches live in System settings → Models → Model deployment. The API key is write-only: it can be replaced, never read back.')}
        </p>
        <span className="flex flex-wrap items-center gap-2">
          <Button
            aria-busy={props.isRechecking}
            disabled={props.isRechecking}
            onClick={props.onRecheck}
            variant="outline"
          >
            <PlugZapIcon aria-hidden="true" />
            {t('Check again')}
          </Button>
          <Button
            render={<Link params={SETTINGS_PARAMS} to="/system-settings/$group/$section" />}
            variant="primary"
          >
            <SettingsIcon aria-hidden="true" />
            {t('Open model deployment settings')}
          </Button>
        </span>
      </Panel.Footer>
    </Panel>
  )
}
