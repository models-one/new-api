import { useMutation, useQuery } from '@tanstack/react-query'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Checkbox,
  Input,
  NativeSelect,
  RadioGroup,
  SwitchRow,
  Textarea,
  type NativeSelectOption,
  type RadioOption,
} from '@/components/form'
import { Drawer, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Skeleton } from '@/components/ui'
import {
  createRegistryModel,
  fetchRegistryModel,
  updateRegistryModel,
  vendorsQuery,
  type RegistryModel,
} from '@/features/model-registry/api'
import {
  emptyRegistryForm,
  endpointOptions,
  formToPayload,
  modelToForm,
  nameRuleDescription,
  nameRuleLabel,
  NAME_RULE,
  NAME_RULES,
  parseTags,
  validateRegistryForm,
  type RegistryFormErrors,
  type RegistryFormValues,
} from '@/features/model-registry/model-registry-presentation'

type ModelDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present in edit mode; omitted when the drawer creates a definition. */
  modelId?: number
  /** Prefills the name when the drawer is opened from the undefined-models list. */
  presetName?: string
  onChanged: () => void
}

const FORM_ID = 'model-registry-drawer-form'

export function ModelDrawer(props: ModelDrawerProps) {
  const { t } = useTranslation()
  const isEdit = props.modelId !== undefined

  const [values, setValues] = useState<RegistryFormValues>(() => emptyRegistryForm())
  const [errors, setErrors] = useState<RegistryFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const currentQuery = useQuery({
    queryKey: ['model-registry', 'detail', props.modelId] as const,
    queryFn: () => fetchRegistryModel(props.modelId as number),
    enabled: props.open && props.modelId !== undefined,
    gcTime: 0,
    staleTime: 0,
  })
  const current: RegistryModel | undefined = currentQuery.data

  const vendors = useQuery({ ...vendorsQuery(), enabled: props.open })

  useEffect(() => {
    if (!props.open) return
    setErrors({})
    setSubmitError(null)
    if (!isEdit) setValues(emptyRegistryForm(props.presetName ?? ''))
  }, [isEdit, props.open, props.presetName])

  useEffect(() => {
    if (current === undefined) return
    setValues(modelToForm(current))
  }, [current])

  const update = (patch: Partial<RegistryFormValues>) => {
    setValues((previous) => ({ ...previous, ...patch }))
  }

  const mutation = useMutation({
    mutationFn: (payload: RegistryFormValues) => {
      const body = formToPayload(payload)
      if (props.modelId === undefined) return createRegistryModel(body)
      return updateRegistryModel({ ...body, id: props.modelId })
    },
    onSuccess: () => {
      toast.success(isEdit ? t('Model definition saved') : t('Model definition created'))
      props.onChanged()
      props.onOpenChange(false)
    },
    onError: (error: unknown) => setSubmitError(toErrorMessage(error)),
  })

  const submit = () => {
    const nextErrors = validateRegistryForm(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setSubmitError(null)
    mutation.mutate(values)
  }

  const vendorOptions: NativeSelectOption[] = [
    { label: t('No vendor'), value: '' },
    ...(vendors.data ?? []).map((vendor) => ({ label: vendor.name, value: String(vendor.id) })),
  ]

  const ruleOptions: RadioOption<string>[] = NAME_RULES.map((rule) => ({
    description: t(nameRuleDescription(rule)),
    label: t(nameRuleLabel(rule)),
    value: String(rule),
  }))

  const endpointChoices = endpointOptions(values.endpoints)
  const tagPreview = parseTags(values.tags)

  const body = ((): ReactNode => {
    if (isEdit && currentQuery.isLoading) {
      return (
        <div aria-busy="true" className="flex flex-col gap-4" role="status">
          <span className="sr-only">{t('Loading this model definition')}</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )
    }

    if (isEdit && currentQuery.isError) {
      return (
        <Alert
          action={
            <Button
              aria-busy={currentQuery.isFetching}
              disabled={currentQuery.isFetching}
              onClick={() => void currentQuery.refetch()}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Could not load this model definition')}
          tone="destructive"
        >
          {toErrorMessage(currentQuery.error)}
        </Alert>
      )
    }

    return (
      <form
        className="flex flex-col gap-6"
        id={FORM_ID}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {submitError === null ? null : (
          <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('The server refused this definition')} tone="destructive">
            {submitError}
          </Alert>
        )}

        <Input
          description={t('Must be unique across the registry. The server refuses a name another definition already holds.')}
          error={errors.model_name === undefined ? undefined : t(errors.model_name)}
          inputClassName="mono"
          label={t('Model name')}
          onChange={(event) => update({ model_name: event.target.value })}
          required
          spellCheck={false}
          value={values.model_name}
        />

        <RadioGroup
          description={t('Decides which published model names this one definition covers.')}
          label={t('Match rule')}
          onValueChange={(next) => update({ name_rule: Number.parseInt(next, 10) })}
          options={ruleOptions}
          value={String(values.name_rule)}
          variant="card"
        />

        <Textarea
          description={t('Shown beside the model wherever the catalogue is published.')}
          label={t('Description')}
          onChange={(event) => update({ description: event.target.value })}
          rows={3}
          value={values.description}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <NativeSelect
            description={
              vendors.isError
                ? t('The vendor list could not be loaded, so only the current value can be kept.')
                : t('Groups this model under a provider in the catalogue.')
            }
            disabled={vendors.data === undefined}
            label={t('Vendor')}
            onChange={(event) => update({ vendor_id: event.target.value })}
            options={vendorOptions}
            value={values.vendor_id}
          />
          <Input
            description={t('A @lobehub/icons identifier, e.g. OpenAI or Claude.Color. Stored as text; this console does not render it.')}
            inputClassName="mono"
            label={t('Icon name')}
            onChange={(event) => update({ icon: event.target.value })}
            spellCheck={false}
            value={values.icon}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Input
            description={t('Comma-separated, e.g. Tools,Files,Vision,128K.')}
            inputClassName="mono"
            label={t('Tags')}
            onChange={(event) => update({ tags: event.target.value })}
            spellCheck={false}
            value={values.tags}
          />
          {tagPreview.length === 0 ? null : (
            <div className="flex flex-wrap gap-1.5">
              {tagPreview.map((tag) => (
                <Badge className="mono" key={tag} size="sm" tone="muted">{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="eyebrow">{t('Supported endpoints')}</legend>
          <p className="text-xs leading-5 text-muted">
            {t('Leave every box clear to store nothing, in which case the gateway works the list out from the endpoints the serving channels advertise. The read API fills a blank column in before it answers, so this console cannot tell a stored list from a derived one — whatever is ticked here is written and from then on it is stored.')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {endpointChoices.map((endpoint) => (
              <Checkbox
                checked={values.endpoints.includes(endpoint)}
                key={endpoint}
                label={<span className="mono">{endpoint}</span>}
                ariaLabel={endpoint}
                onCheckedChange={(checked) => {
                  update({
                    endpoints: checked
                      ? [...values.endpoints, endpoint]
                      : values.endpoints.filter((entry) => entry !== endpoint),
                  })
                }}
              />
            ))}
          </div>
          <div>
            <Button
              disabled={values.endpoints.length === 0}
              onClick={() => update({ endpoints: [] })}
              size="sm"
              type="button"
              variant="outline"
            >
              {t('Clear and let the gateway derive them')}
            </Button>
          </div>
        </fieldset>

        <div className="flex flex-col">
          <SwitchRow
            checked={values.status}
            description={t('A disabled definition keeps its metadata but is marked off in the registry.')}
            label={t('Enabled')}
            onCheckedChange={(checked) => update({ status: checked })}
          />
          <SwitchRow
            checked={values.sync_official}
            description={t('When off, the upstream sync never offers to overwrite this row and its preview skips it entirely.')}
            label={t('Follow the official upstream')}
            onCheckedChange={(checked) => update({ sync_official: checked })}
          />
        </div>
      </form>
    )
  })()

  const footer = (
    <>
      <Button disabled={mutation.isPending} onClick={() => props.onOpenChange(false)} variant="quiet">
        {t('Cancel')}
      </Button>
      <Button
        aria-busy={mutation.isPending}
        disabled={mutation.isPending || (isEdit && current === undefined)}
        form={FORM_ID}
        type="submit"
        variant="primary"
      >
        {isEdit ? t('Save changes') : t('Create definition')}
      </Button>
    </>
  )

  return (
    <Drawer
      description={
        isEdit
          ? t('Every field below is written on save — the update statement forces all of them, so nothing can be left untouched.')
          : t('A definition attaches metadata to one model name, or to every name a rule matches.')
      }
      footer={footer}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="lg"
      title={isEdit ? t('Edit model definition') : t('New model definition')}
    >
      <div className="flex flex-col gap-6">
        {isEdit && current !== undefined ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge className="mono" size="sm" tone="muted">{`#${current.id}`}</Badge>
            <span>
              {t('Created {{date}}', { date: new Date(current.created_time * 1000).toLocaleString() })}
            </span>
          </p>
        ) : null}
        {!isEdit && values.name_rule !== NAME_RULE.exact ? (
          <Alert tone="info">
            {t('A rule other than Exact covers every published model whose name matches, so one definition can stand in for many.')}
          </Alert>
        ) : null}
        {body}
      </div>
    </Drawer>
  )
}
