import { useMutation, useQuery } from '@tanstack/react-query'
import InfoIcon from 'lucide-react/dist/esm/icons/info'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NumberInput, PasswordInput, Textarea } from '@/components/form'
import { Drawer, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, Skeleton } from '@/components/ui'
import {
  deploymentDetailQuery,
  updateDeployment,
  type UpdateDeploymentPayload,
} from '@/features/deployments/api'
import {
  parseEnvObject,
  splitCommandTokens,
  type EnvParseResult,
} from '@/features/deployments/deployment-presentation'

/** TCP port range; io.net's `traffic_port` is a plain port number. */
const MIN_PORT = 1
const MAX_PORT = 65_535

type FormState = {
  image_url: string
  traffic_port: string
  entrypoint: string
  args: string
  command: string
  registry_username: string
  registry_secret: string
  env_json: string
  secret_env_json: string
}

const EMPTY_FORM: FormState = {
  args: '',
  command: '',
  entrypoint: '',
  env_json: '',
  image_url: '',
  registry_secret: '',
  registry_username: '',
  secret_env_json: '',
  traffic_port: '',
}

/** Turns a parse failure into copy, without a nested ternary at the call site. */
function envErrorMessage(
  result: EnvParseResult,
  t: (key: string) => string,
): string | undefined {
  if (result.ok) return undefined
  if (result.reason === 'invalid-json') return t('That is not valid JSON.')
  return t('Provide a JSON object of key/value pairs.')
}

type UpdateConfigDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  deploymentId: string | undefined
  onUpdated: () => void
}

/**
 * `PUT /api/deployments/:id` (`ionet.UpdateDeploymentRequest`).
 *
 * EVERY field on that struct is `omitempty`, so an absent key means "leave this alone"
 * upstream — there is no way to CLEAR a value through this route. Emptying a field here
 * therefore does not erase anything; the drawer says so rather than implying otherwise.
 *
 * Only four values come back from `GET /api/deployments/:id` to prefill with
 * (`container_config`: image_url, traffic_port, entrypoint, env_variables). Secret
 * environment variables and registry credentials are write-only upstream and are never
 * returned, so their fields start blank.
 */
export function UpdateConfigDrawer(props: UpdateConfigDrawerProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const detailQuery = useQuery({
    ...deploymentDetailQuery(props.deploymentId),
    enabled: props.open && props.deploymentId !== undefined,
  })
  const detail = detailQuery.data

  useEffect(() => {
    if (!props.open) return
    if (detail === undefined) {
      setForm(EMPTY_FORM)
      return
    }
    const config = detail.container_config
    const env = config.env_variables ?? {}
    setForm({
      ...EMPTY_FORM,
      entrypoint: (config.entrypoint ?? []).join(' '),
      env_json: Object.keys(env).length === 0 ? '' : JSON.stringify(env, null, 2),
      image_url: config.image_url,
      traffic_port: config.traffic_port > 0 ? String(config.traffic_port) : '',
    })
  }, [detail, props.open])

  const update = (patch: Partial<FormState>) => setForm((previous) => ({ ...previous, ...patch }))

  const envParsed = parseEnvObject(form.env_json)
  const secretEnvParsed = parseEnvObject(form.secret_env_json)

  const envError = envErrorMessage(envParsed, t)
  const secretEnvError = envErrorMessage(secretEnvParsed, t)

  const port = form.traffic_port.trim() === '' ? undefined : Number(form.traffic_port)
  const portOutOfRange = port !== undefined
    && (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT)
  const portError = portOutOfRange
    ? t('A port is a whole number between {{min}} and {{max}}.', { max: MAX_PORT, min: MIN_PORT })
    : undefined

  const payload = ((): UpdateDeploymentPayload => {
    const next: UpdateDeploymentPayload = {}
    if (form.image_url.trim() !== '') next.image_url = form.image_url.trim()
    if (port !== undefined && portError === undefined) next.traffic_port = port
    const entrypoint = splitCommandTokens(form.entrypoint)
    if (entrypoint.length > 0) next.entrypoint = entrypoint
    const args = splitCommandTokens(form.args)
    if (args.length > 0) next.args = args
    if (form.command.trim() !== '') next.command = form.command.trim()
    if (form.registry_username.trim() !== '') next.registry_username = form.registry_username.trim()
    if (form.registry_secret !== '') next.registry_secret = form.registry_secret
    if (envParsed.ok && envParsed.value !== undefined) next.env_variables = envParsed.value
    if (secretEnvParsed.ok && secretEnvParsed.value !== undefined) {
      next.secret_env_variables = secretEnvParsed.value
    }
    return next
  })()

  const fieldCount = Object.keys(payload).length

  const mutation = useMutation({
    mutationFn: (body: UpdateDeploymentPayload) => updateDeployment(props.deploymentId ?? '', body),
    onSuccess: (result) => {
      toast.success(t('io.net accepted the change and reports “{{status}}”.', { status: result.status }))
      props.onUpdated()
      props.onOpenChange(false)
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const blockReason = ((): string | undefined => {
    if (props.deploymentId === undefined) return t('No deployment is selected.')
    if (detailQuery.isLoading) return t('The deployment is still loading.')
    if (envError !== undefined || secretEnvError !== undefined || portError !== undefined) {
      return t('Fix the highlighted fields first.')
    }
    if (fieldCount === 0) return t('Nothing has been filled in, so there is nothing to send.')
    return undefined
  })()

  return (
    <Drawer
      description={t('Changes the container configuration of a running deployment at io.net. It does not buy any additional compute.')}
      footer={(
        <>
          <Button disabled={mutation.isPending} onClick={() => props.onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button
            aria-busy={mutation.isPending}
            disabled={mutation.isPending || blockReason !== undefined}
            onClick={() => mutation.mutate(payload)}
            title={blockReason}
            variant="primary"
          >
            {t('Send {{count}} fields', { count: fieldCount })}
          </Button>
        </>
      )}
      onOpenChange={(open) => {
        if (!open && mutation.isPending) return
        props.onOpenChange(open)
      }}
      open={props.open}
      size="lg"
      title={t('Update configuration')}
    >
      <div className="flex flex-col gap-6">
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="eyebrow">{t('Deployment')}</span>
          <span className="mono break-all text-foreground">{props.deploymentId ?? '—'}</span>
        </p>

        <Alert icon={<InfoIcon aria-hidden="true" />} tone="info">
          {t('Only the fields you fill in are sent. An empty field is omitted from the request, which io.net reads as “leave this as it is” — clearing a field here does not clear it upstream.')}
        </Alert>

        {detailQuery.isLoading ? (
          <div aria-busy="true" role="status">
            <span className="sr-only">{t('Loading the current configuration')}</span>
            <Skeleton lines={5} variant="text" />
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
            title={t('Could not read the current configuration')}
            tone="destructive"
          >
            {t('The form starts empty. Anything you fill in is still sent, but nothing is prefilled.')}
          </Alert>
        ) : null}

        <Drawer.Section
          description={t('Prefilled from container_config on the deployment detail.')}
          title={t('Image and port')}
        >
          <div className="flex flex-col gap-4">
            <Input
              inputClassName="mono"
              label={t('Image URL')}
              onChange={(event) => update({ image_url: event.target.value })}
              placeholder="ollama/ollama:latest"
              value={form.image_url}
            />
            <NumberInput
              error={portError}
              label={t('Traffic port')}
              max={MAX_PORT}
              min={MIN_PORT}
              onChange={(event) => update({ traffic_port: event.target.value })}
              step={1}
              value={form.traffic_port}
            />
          </div>
        </Drawer.Section>

        <Drawer.Section
          description={t('Whitespace-separated; each token is one array element. No shell quoting.')}
          title={t('Entrypoint and arguments')}
        >
          <div className="flex flex-col gap-4">
            <Input
              inputClassName="mono"
              label={t('Entrypoint')}
              onChange={(event) => update({ entrypoint: event.target.value })}
              value={form.entrypoint}
            />
            <Input
              description={t('Not returned by the detail route, so it always starts empty.')}
              inputClassName="mono"
              label={t('Arguments')}
              onChange={(event) => update({ args: event.target.value })}
              value={form.args}
            />
            <Input
              description={t('A single command string, sent as io.net’s command field.')}
              inputClassName="mono"
              label={t('Command')}
              onChange={(event) => update({ command: event.target.value })}
              value={form.command}
            />
          </div>
        </Drawer.Section>

        <Drawer.Section
          description={t('A JSON object of key/value pairs. Non-string values are stringified.')}
          title={t('Environment')}
        >
          <div className="flex flex-col gap-4">
            <Textarea
              error={envError}
              label={t('Environment variables (JSON)')}
              onChange={(event) => update({ env_json: event.target.value })}
              rows={5}
              textareaClassName="mono"
              value={form.env_json}
            />
            <Textarea
              description={t('Write-only upstream: these are never returned, so this field always starts empty.')}
              error={secretEnvError}
              label={t('Secret environment variables (JSON)')}
              onChange={(event) => update({ secret_env_json: event.target.value })}
              rows={4}
              textareaClassName="mono"
              value={form.secret_env_json}
            />
          </div>
        </Drawer.Section>

        <Drawer.Section
          description={t('Only needed for a private registry.')}
          title={t('Registry credentials')}
        >
          <div className="flex flex-col gap-4">
            <Input
              inputClassName="mono"
              label={t('Registry username')}
              onChange={(event) => update({ registry_username: event.target.value })}
              value={form.registry_username}
            />
            <PasswordInput
              label={t('Registry secret')}
              onChange={(event) => update({ registry_secret: event.target.value })}
              value={form.registry_secret}
            />
          </div>
        </Drawer.Section>

        {blockReason === undefined ? null : (
          <p className="text-xs leading-5 text-muted">{blockReason}</p>
        )}
      </div>
    </Drawer>
  )
}
