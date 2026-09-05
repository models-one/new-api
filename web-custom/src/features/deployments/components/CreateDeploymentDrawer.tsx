import { useMutation, useQuery } from '@tanstack/react-query'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Collapsible } from '@/components/disclosure'
import {
  Checkbox,
  Input,
  NativeSelect,
  NumberInput,
  PasswordInput,
  Textarea,
  type NativeSelectOption,
} from '@/components/form'
import { Dialog, Drawer, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Skeleton } from '@/components/ui'
import {
  availableReplicasQuery,
  buildPricePayload,
  clusterNameCheckQuery,
  createDeployment,
  deploymentLocationsQuery,
  hardwareTypesQuery,
  type CreateDeploymentPayload,
} from '@/features/deployments/api'
import {
  PriceEstimateSummary,
  usePriceEstimate,
} from '@/features/deployments/components/PriceEstimate'
import {
  isBlankName,
  parseEnvObject,
  splitCommandTokens,
} from '@/features/deployments/deployment-presentation'
import { formatNumber } from '@/lib/format'

/**
 * The image and port the legacy console offered as its starting point. They are editable
 * defaults, not a capability: io.net accepts any registry image.
 */
const DEFAULT_IMAGE = 'ollama/ollama:latest'
const DEFAULT_TRAFFIC_PORT = 11_434
const MIN_PORT = 1
const MAX_PORT = 65_535
/** `DeployContainer` refuses anything below 1 for each of these before it calls io.net. */
const MIN_HOURS = 1
const MIN_GPUS = 1
const MIN_REPLICAS = 1

type FormState = {
  name: string
  image_url: string
  traffic_port: string
  hardware_id: string
  gpus_per_container: number
  location_ids: number[]
  replica_count: number
  duration_hours: number
  entrypoint: string
  args: string
  env_json: string
  secret_env_json: string
  registry_username: string
  registry_secret: string
}

const EMPTY_FORM: FormState = {
  args: '',
  duration_hours: MIN_HOURS,
  entrypoint: '',
  env_json: '',
  gpus_per_container: MIN_GPUS,
  hardware_id: '',
  image_url: DEFAULT_IMAGE,
  location_ids: [],
  name: '',
  registry_secret: '',
  registry_username: '',
  replica_count: MIN_REPLICAS,
  secret_env_json: '',
  traffic_port: String(DEFAULT_TRAFFIC_PORT),
}

type CreateDeploymentDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

/**
 * `POST /api/deployments/` — THIS SPENDS MONEY: it provisions paid GPU capacity at io.net.
 *
 * Nothing is created from this drawer directly. "Review cost" freezes the current values,
 * asks `POST /api/deployments/price-estimation` for a FRESH estimate of exactly those
 * values, and only then offers a confirm — which stays disabled until that estimate has
 * arrived, so a price is never inferred from an earlier set of inputs.
 */
export function CreateDeploymentDrawer(props: CreateDeploymentDrawerProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [pending, setPending] = useState<CreateDeploymentPayload | null>(null)

  useEffect(() => {
    if (props.open) {
      setForm(EMPTY_FORM)
      setAdvancedOpen(false)
      setPending(null)
    }
  }, [props.open])

  const update = (patch: Partial<FormState>) => setForm((previous) => ({ ...previous, ...patch }))

  const hardwareQuery = useQuery(hardwareTypesQuery(props.open))
  const hardwareTypes = hardwareQuery.data?.hardware_types ?? []
  const selectedHardware = hardwareTypes.find((item) => String(item.id) === form.hardware_id)

  const locationsQuery = useQuery(deploymentLocationsQuery(props.open))
  const isoByLocationId = useMemo(() => {
    const map = new Map<number, string>()
    for (const location of locationsQuery.data?.locations ?? []) {
      if (location.iso2 !== undefined && location.iso2 !== '') map.set(location.id, location.iso2)
    }
    return map
  }, [locationsQuery.data])

  const hardwareId = selectedHardware === undefined ? undefined : selectedHardware.id
  const replicasQuery = useQuery(
    availableReplicasQuery(hardwareId, form.gpus_per_container, props.open),
  )
  const replicas = replicasQuery.data?.replicas ?? []

  /** io.net's ceiling for this hardware type; the field is clamped rather than refused. */
  const maxGpus = selectedHardware === undefined ? undefined : selectedHardware.max_gpus
  useEffect(() => {
    if (maxGpus === undefined || maxGpus < MIN_GPUS) return
    setForm((previous) =>
      previous.gpus_per_container > maxGpus ? { ...previous, gpus_per_container: maxGpus } : previous,
    )
  }, [maxGpus])

  /** Locations only exist per hardware+GPU pair, so a change to either drops the choice. */
  useEffect(() => {
    setForm((previous) => (previous.location_ids.length === 0 ? previous : { ...previous, location_ids: [] }))
  }, [hardwareId, form.gpus_per_container])

  const nameCheck = useQuery(clusterNameCheckQuery(form.name, props.open && !isBlankName(form.name)))
  const nameTaken = nameCheck.data !== undefined && !nameCheck.data.available

  const envParsed = parseEnvObject(form.env_json)
  const secretEnvParsed = parseEnvObject(form.secret_env_json)
  const port = form.traffic_port.trim() === '' ? undefined : Number(form.traffic_port)
  const portValid = port === undefined
    || (Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT)

  /**
   * Client-side capacity check only: the sum of `available_count` over the selected
   * locations, as io.net reported it for this hardware and GPU count. io.net decides
   * whether a deployment fits; this is a warning, never a block.
   */
  const selectedCapacity = replicas
    .filter((replica) => form.location_ids.includes(replica.location_id))
    .reduce((total, replica) => total + replica.available_count, 0)
  const overCapacity = form.location_ids.length > 0 && form.replica_count > selectedCapacity

  const blockReason = ((): string | undefined => {
    if (isBlankName(form.name)) return t('A deployment name is required.')
    if (nameCheck.isFetching) return t('The name is still being checked.')
    if (nameTaken) return t('io.net already has a cluster with that name.')
    if (form.image_url.trim() === '') return t('An image URL is required.')
    if (selectedHardware === undefined) return t('Pick a hardware type.')
    if (form.gpus_per_container < MIN_GPUS) return t('At least one GPU per container is required.')
    if (form.location_ids.length === 0) return t('Pick at least one location.')
    if (form.replica_count < MIN_REPLICAS) return t('At least one replica is required.')
    if (form.duration_hours < MIN_HOURS) return t('At least one hour is required.')
    if (!portValid) {
      return t('A port is a whole number between {{min}} and {{max}}.', { max: MAX_PORT, min: MIN_PORT })
    }
    if (!envParsed.ok || !secretEnvParsed.ok) {
      return t('The environment JSON is not a valid object.')
    }
    return undefined
  })()

  const buildPayload = (): CreateDeploymentPayload | null => {
    if (blockReason !== undefined || selectedHardware === undefined) return null
    const entrypoint = splitCommandTokens(form.entrypoint)
    const args = splitCommandTokens(form.args)

    return {
      container_config: {
        replica_count: form.replica_count,
        ...(args.length > 0 ? { args } : {}),
        ...(entrypoint.length > 0 ? { entrypoint } : {}),
        ...(envParsed.ok && envParsed.value !== undefined ? { env_variables: envParsed.value } : {}),
        ...(secretEnvParsed.ok && secretEnvParsed.value !== undefined
          ? { secret_env_variables: secretEnvParsed.value }
          : {}),
        ...(port === undefined ? {} : { traffic_port: port }),
      },
      duration_hours: form.duration_hours,
      gpus_per_container: form.gpus_per_container,
      hardware_id: selectedHardware.id,
      location_ids: form.location_ids,
      registry_config: {
        image_url: form.image_url.trim(),
        ...(form.registry_secret === '' ? {} : { registry_secret: form.registry_secret }),
        ...(form.registry_username.trim() === ''
          ? {}
          : { registry_username: form.registry_username.trim() }),
      },
      resource_private_name: form.name.trim(),
    }
  }

  const estimate = usePriceEstimate()
  const estimateMutate = estimate.mutate

  const review = () => {
    const payload = buildPayload()
    if (payload === null) return
    setPending(payload)
    estimateMutate(
      buildPricePayload({
        durationHours: payload.duration_hours,
        gpusPerContainer: payload.gpus_per_container,
        hardwareId: payload.hardware_id,
        locationIds: payload.location_ids,
        replicaCount: payload.container_config.replica_count,
      }),
    )
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateDeploymentPayload) => createDeployment(payload),
    onSuccess: (result) => {
      toast.success(t('Deployment {{id}} requested. io.net reports “{{status}}”.', {
        id: result.deployment_id,
        status: result.status,
      }))
      setPending(null)
      props.onCreated()
      props.onOpenChange(false)
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const hardwareOptions: NativeSelectOption[] = hardwareTypes.map((item) => {
    const brand = item.brand_name ?? ''
    const label = brand === '' ? item.name : `${brand} ${item.name}`
    const free = item.available_count ?? 0
    return {
      disabled: !item.available,
      label: t('{{label}} — up to {{max}} GPUs, {{free}} free', {
        free: formatNumber(free),
        label,
        max: formatNumber(item.max_gpus),
      }),
      value: String(item.id),
    }
  })

  const nameDescription = ((): string => {
    if (isBlankName(form.name)) return t('Unique across the io.net account.')
    if (nameCheck.isFetching) return t('Checking availability…')
    if (nameCheck.data?.available === true) return t('Available.')
    return t('Unique across the io.net account.')
  })()

  return (
    <>
      <Drawer
        description={t('Rents GPU capacity from io.net. Nothing is bought until the cost has been shown and confirmed.')}
        footer={(
          <>
            <Button
              disabled={createMutation.isPending}
              onClick={() => props.onOpenChange(false)}
              variant="quiet"
            >
              {t('Cancel')}
            </Button>
            <Button
              disabled={blockReason !== undefined}
              onClick={review}
              title={blockReason}
              variant="primary"
            >
              {t('Review the cost')}
            </Button>
          </>
        )}
        onOpenChange={(open) => {
          if (!open && createMutation.isPending) return
          props.onOpenChange(open)
        }}
        open={props.open}
        size="xl"
        title={t('New GPU deployment')}
      >
        <div className="flex flex-col gap-6">
          <Drawer.Section
            description={t('The cluster name io.net will show, and the container image it runs.')}
            title={t('Identity and image')}
          >
            <div className="flex flex-col gap-4">
              <Input
                description={nameDescription}
                error={nameTaken ? t('io.net already has a cluster with that name.') : undefined}
                inputClassName="mono"
                label={t('Deployment name')}
                onChange={(event) => update({ name: event.target.value })}
                required
                value={form.name}
              />
              <Input
                description={t('Any registry image. Private registries need the credentials below.')}
                inputClassName="mono"
                label={t('Image URL')}
                onChange={(event) => update({ image_url: event.target.value })}
                required
                value={form.image_url}
              />
              <NumberInput
                description={t('The port io.net exposes for this container.')}
                error={portValid ? undefined : t('A port is a whole number between {{min}} and {{max}}.', { max: MAX_PORT, min: MIN_PORT })}
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
            description={t('Hardware, GPU count and locations are read live from io.net; only what it offers can be picked.')}
            title={t('Capacity')}
          >
            <div className="flex flex-col gap-4">
              {hardwareQuery.isLoading ? (
                <div aria-busy="true" role="status">
                  <span className="sr-only">{t('Loading the hardware types')}</span>
                  <Skeleton lines={2} variant="text" />
                </div>
              ) : null}

              {hardwareQuery.isError ? (
                <Alert
                  action={
                    <Button
                      aria-busy={hardwareQuery.isFetching}
                      disabled={hardwareQuery.isFetching}
                      onClick={() => void hardwareQuery.refetch()}
                      size="sm"
                      variant="outline"
                    >
                      {t('Try again')}
                    </Button>
                  }
                  icon={<TriangleAlertIcon aria-hidden="true" />}
                  title={t('Could not load the hardware types')}
                  tone="destructive"
                >
                  <span className="mono block break-words text-xs leading-5">
                    {toErrorMessage(hardwareQuery.error)}
                  </span>
                </Alert>
              ) : null}

              <NativeSelect
                description={t('io.net reports only the name, the brand, the GPU ceiling and how many units are free — no memory, CPU or price, so none is shown.')}
                disabled={hardwareOptions.length === 0}
                label={t('Hardware type')}
                onChange={(event) => update({ hardware_id: event.target.value })}
                options={hardwareOptions}
                placeholder={hardwareOptions.length === 0 ? t('No hardware available') : t('Pick a hardware type')}
                required
                value={form.hardware_id}
              />

              <NumberInput
                description={
                  maxGpus === undefined
                    ? t('Pick a hardware type first.')
                    : t('At most {{max}} for this hardware type.', { max: formatNumber(maxGpus) })
                }
                disabled={selectedHardware === undefined}
                label={t('GPUs per container')}
                max={maxGpus}
                min={MIN_GPUS}
                onValueChange={(value) => update({ gpus_per_container: value ?? MIN_GPUS })}
                required
                step={1}
                value={form.gpus_per_container}
              />

              <fieldset className="flex flex-col gap-2">
                <legend className="eyebrow mb-2">{t('Locations')}</legend>
                {selectedHardware === undefined ? (
                  <p className="text-xs leading-5 text-muted">
                    {t('Pick a hardware type and a GPU count to see where it is free.')}
                  </p>
                ) : null}
                {replicasQuery.isLoading ? (
                  <div aria-busy="true" role="status">
                    <span className="sr-only">{t('Loading the locations')}</span>
                    <Skeleton lines={3} variant="text" />
                  </div>
                ) : null}
                {replicasQuery.isError ? (
                  <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="destructive">
                    <span className="mono block break-words text-xs leading-5">
                      {toErrorMessage(replicasQuery.error)}
                    </span>
                  </Alert>
                ) : null}
                {replicasQuery.data !== undefined && replicas.length === 0 ? (
                  <p className="text-xs leading-5 text-muted">
                    {t('io.net reports no location with this hardware free at this GPU count.')}
                  </p>
                ) : null}
                {replicas.map((replica) => {
                  const iso = isoByLocationId.get(replica.location_id)
                  return (
                    <Checkbox
                      checked={form.location_ids.includes(replica.location_id)}
                      description={t('{{count}} replicas free', { count: replica.available_count })}
                      key={replica.location_id}
                      label={iso === undefined
                        ? replica.location_name
                        : `${replica.location_name} (${iso})`}
                      onCheckedChange={(checked) =>
                        update({
                          location_ids: checked
                            ? [...form.location_ids, replica.location_id]
                            : form.location_ids.filter((id) => id !== replica.location_id),
                        })}
                    />
                  )
                })}
              </fieldset>

              <NumberInput
                description={t('How many containers to run across the selected locations.')}
                label={t('Replicas')}
                min={MIN_REPLICAS}
                onValueChange={(value) => update({ replica_count: value ?? MIN_REPLICAS })}
                required
                step={1}
                value={form.replica_count}
              />

              {overCapacity ? (
                <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
                  {t('Checked here, not by the server: {{replicas}} replicas is more than the {{capacity}} io.net currently reports free across the selected locations (the sum of available_count). io.net decides whether this fits.', {
                    capacity: formatNumber(selectedCapacity),
                    replicas: formatNumber(form.replica_count),
                  })}
                </Alert>
              ) : null}

              <NumberInput
                description={t('Whole hours of compute to buy up front. It can be extended later.')}
                label={t('Duration (hours)')}
                min={MIN_HOURS}
                onValueChange={(value) => update({ duration_hours: value ?? MIN_HOURS })}
                required
                step={1}
                value={form.duration_hours}
              />
            </div>
          </Drawer.Section>

          <Collapsible onOpenChange={setAdvancedOpen} open={advancedOpen}>
            <Collapsible.Trigger render={<Button size="sm" variant="outline" />}>
              {advancedOpen ? t('Hide the advanced options') : t('Show the advanced options')}
            </Collapsible.Trigger>
            <Collapsible.Panel>
              <div className="flex flex-col gap-4 pt-4">
                <Input
                  description={t('Whitespace-separated; each token is one array element. No shell quoting.')}
                  inputClassName="mono"
                  label={t('Entrypoint')}
                  onChange={(event) => update({ entrypoint: event.target.value })}
                  value={form.entrypoint}
                />
                <Input
                  inputClassName="mono"
                  label={t('Arguments')}
                  onChange={(event) => update({ args: event.target.value })}
                  value={form.args}
                />
                <Textarea
                  description={t('A JSON object of key/value pairs. Non-string values are stringified.')}
                  error={envParsed.ok ? undefined : t('The environment JSON is not a valid object.')}
                  label={t('Environment variables (JSON)')}
                  onChange={(event) => update({ env_json: event.target.value })}
                  rows={4}
                  textareaClassName="mono"
                  value={form.env_json}
                />
                <Textarea
                  description={t('Write-only upstream: these are never returned, so this field always starts empty.')}
                  error={secretEnvParsed.ok ? undefined : t('The environment JSON is not a valid object.')}
                  label={t('Secret environment variables (JSON)')}
                  onChange={(event) => update({ secret_env_json: event.target.value })}
                  rows={3}
                  textareaClassName="mono"
                  value={form.secret_env_json}
                />
                <Input
                  description={t('Only needed for a private registry.')}
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
            </Collapsible.Panel>
          </Collapsible>

          {blockReason === undefined ? null : (
            <p className="text-xs leading-5 text-muted">{blockReason}</p>
          )}
        </div>
      </Drawer>

      <Dialog
        description={t('This rents GPU capacity from io.net and is charged as soon as io.net accepts it.')}
        footer={(
          <>
            <Button
              disabled={createMutation.isPending}
              onClick={() => setPending(null)}
              variant="quiet"
            >
              {t('Back to the form')}
            </Button>
            <Button
              aria-busy={createMutation.isPending}
              disabled={createMutation.isPending || estimate.data === undefined}
              onClick={() => {
                if (pending !== null) createMutation.mutate(pending)
              }}
              title={
                estimate.data === undefined
                  ? t('The deployment cannot be confirmed until io.net has priced these exact values.')
                  : undefined
              }
              variant="primary"
            >
              {t('Create and pay')}
            </Button>
          </>
        )}
        onOpenChange={(open) => {
          if (!open && !createMutation.isPending) setPending(null)
        }}
        open={pending !== null}
        size="md"
        title={t('Create this deployment?')}
      >
        {pending === null ? null : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="eyebrow">{t('Name')}</dt>
                <dd className="mono mt-1 break-all text-sm text-foreground">
                  {pending.resource_private_name}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t('Image URL')}</dt>
                <dd className="mono mt-1 break-all text-sm text-foreground">
                  {pending.registry_config.image_url}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t('GPUs per container')}</dt>
                <dd className="mono mt-1 text-sm text-foreground">
                  {formatNumber(pending.gpus_per_container)}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t('Replicas')}</dt>
                <dd className="mono mt-1 text-sm text-foreground">
                  {formatNumber(pending.container_config.replica_count)}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t('Duration (hours)')}</dt>
                <dd className="mono mt-1 text-sm text-foreground">
                  {formatNumber(pending.duration_hours)}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t('Locations')}</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {pending.location_ids.map((id) => (
                    <Badge className="mono" key={id} size="sm" tone="muted">{id}</Badge>
                  ))}
                </dd>
              </div>
            </dl>

            <PriceEstimateSummary
              error={estimate.error}
              estimate={estimate.data}
              isPending={estimate.isPending}
              onRetry={review}
            />

            {estimate.data === undefined ? (
              <p className="text-xs leading-5 text-muted">
                {t('The deployment cannot be confirmed until io.net has priced these exact values.')}
              </p>
            ) : null}
          </div>
        )}
      </Dialog>
    </>
  )
}
