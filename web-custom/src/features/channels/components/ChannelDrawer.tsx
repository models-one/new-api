import { useMutation, useQuery } from '@tanstack/react-query'
import DownloadCloudIcon from 'lucide-react/dist/esm/icons/download-cloud'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs } from '@/components/disclosure'
import {
  Checkbox,
  Input,
  NativeSelect,
  PasswordInput,
  RadioGroup,
  Switch,
  Textarea,
  type NativeSelectOption,
  type RadioOption,
} from '@/components/form'
import { Drawer, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Skeleton } from '@/components/ui'
import {
  channelGroupNamesQuery,
  createChannel,
  enabledModelNamesQuery,
  fetchChannel,
  fetchUpstreamModels,
  fetchUpstreamModelsForDraft,
  updateChannel,
  type Channel,
} from '@/features/channels/api'
import {
  applyTypeDefaults,
  buildCreatePayload,
  buildUpdatePayload,
  channelToForm,
  channelTypeOptions,
  channelTypeSpec,
  CREATE_BLOCKED_TYPES,
  defaultBaseUrl,
  emptyChannelForm,
  splitList,
  SUPPORTS_MODEL_FETCH_TYPES,
  validateChannelForm,
  type ChannelExtraField,
  type ChannelFormError,
  type ChannelFormErrors,
  type ChannelFormValues,
} from '@/features/channels/channel-presentation'

type ChannelDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present in edit mode; omitted when the drawer creates a channel. */
  channelId?: number
  /** True when the signed-in admin holds `channel:sensitive_write`. */
  canWriteSensitive: boolean
  /** True when the signed-in admin holds `channel:write`. */
  canWrite: boolean
  /** True when the signed-in admin holds `channel:operate` (upstream model fetch). */
  canOperate: boolean
  onChanged: () => void
}

const FORM_ID = 'channel-drawer-form'

export function ChannelDrawer(props: ChannelDrawerProps) {
  const { t } = useTranslation()
  const isEdit = props.channelId !== undefined

  const [values, setValues] = useState<ChannelFormValues>(() => emptyChannelForm())
  const [errors, setErrors] = useState<ChannelFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [tab, setTab] = useState('basics')

  const currentQuery = useQuery({
    queryKey: ['channels', 'detail', props.channelId],
    queryFn: () => fetchChannel(props.channelId as number),
    enabled: props.open && props.channelId !== undefined,
    gcTime: 0,
    staleTime: 0,
  })
  const current: Channel | undefined = currentQuery.data

  const groupsQuery = useQuery({ ...channelGroupNamesQuery(), enabled: props.open })
  const modelsQuery = useQuery({ ...enabledModelNamesQuery(), enabled: props.open })

  useEffect(() => {
    if (!props.open) return
    setErrors({})
    setSubmitError(null)
    setTab('basics')
    if (!isEdit) setValues(emptyChannelForm())
  }, [isEdit, props.open])

  useEffect(() => {
    if (current === undefined) return
    setValues(channelToForm(current))
  }, [current])

  const spec = channelTypeSpec(values.type)
  // A sensitive edit is refused by the server for a `channel:write`-only admin, so the
  // credential controls are shown disabled rather than hidden — a control that vanishes
  // reads as "this channel has none".
  const sensitiveLocked = isEdit ? !props.canWriteSensitive : false
  const canSubmit = isEdit ? props.canWrite || props.canWriteSensitive : props.canWriteSensitive

  const update = (patch: Partial<ChannelFormValues>) => {
    setValues((previous) => ({ ...previous, ...patch }))
  }

  const fetchModelsMutation = useMutation({
    mutationFn: () => {
      if (isEdit && props.channelId !== undefined) return fetchUpstreamModels(props.channelId)
      return fetchUpstreamModelsForDraft({
        base_url: values.base_url.trim(),
        key: values.key.trim(),
        type: values.type,
      })
    },
    onSuccess: (list) => {
      const merged = Array.from(new Set([...splitList(values.models), ...list]))
      update({ models: merged.join(',') })
      toast.success(t('{{count}} models returned by the upstream', { count: list.length }))
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const mutation = useMutation({
    mutationFn: async (form: ChannelFormValues) => {
      if (isEdit && current !== undefined) return updateChannel(buildUpdatePayload(form, current))
      return createChannel(buildCreatePayload(form))
    },
    onSuccess: () => {
      toast.success(isEdit ? t('Channel updated') : t('Channel created'))
      props.onChanged()
      props.onOpenChange(false)
    },
    onError: (error: unknown) => setSubmitError(toErrorMessage(error)),
  })

  const handleSubmit = () => {
    setSubmitError(null)
    const nextErrors = validateChannelForm(values, { isEdit })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setSubmitError(t('Some fields still need attention. The highlighted ones were not sent.'))
      return
    }
    mutation.mutate(values)
  }

  /** Turns a validator code into the sentence the field shows. */
  const resolveError = (error: ChannelFormError | undefined): string | undefined => {
    if (error === undefined) return undefined
    switch (error.code) {
      case 'name-required':
        return t('A channel name is required.')
      case 'key-required':
        return t('A key is required when the channel is created.')
      case 'models-required':
        return t('List at least one model this channel serves.')
      case 'groups-required':
        return t('Pick at least one group that may route to this channel.')
      case 'base-url-required':
        return t('This provider has no built-in address, so a base URL is required.')
      case 'other-required':
        return t('This provider requires this field.')
      case 'vertex-region-shape':
        return t('The region map must be a JSON object containing a "default" entry.')
      case 'codex-key-shape':
        return t('A Codex credential must be JSON carrying access_token and account_id.')
      case 'json-invalid':
        return t('Not valid JSON: {{detail}}', { detail: error.detail ?? '' })
      case 'priority-invalid':
        return t('Enter a whole number.')
      case 'weight-invalid':
        return t('Enter a whole number.')
      case 'shards-invalid':
        return t('Enter a whole number from 1 to 8.')
      case 'shards-with-http1':
        return t('HTTP/1.1 allows only a single connection shard.')
      default:
        return undefined
    }
  }

  const typeOptions: NativeSelectOption[] = channelTypeOptions()
    .filter((option) => isEdit || !CREATE_BLOCKED_TYPES.has(option.value))
    .map((option) => ({ label: option.label, value: String(option.value) }))

  const groupNames = groupsQuery.data ?? []
  // A group can be removed from the setting while channels still route to it; keeping it
  // in the list stops a save from silently dropping it.
  const groupChoices = Array.from(new Set([...groupNames, ...values.groups]))

  const modeOptions: RadioOption<ChannelFormValues['mode']>[] = [
    {
      description: t('One channel from one key.'),
      label: t('Single key'),
      value: 'single',
    },
    {
      description: t('One channel per key, split on newlines.'),
      label: t('Batch — one channel per key'),
      value: 'batch',
    },
    {
      description: t('One channel holding every key, rotated on each request.'),
      label: t('Multi-key — one channel, many keys'),
      value: 'multi_to_single',
    },
  ]

  const keyIsMultiline = spec.keyIsJson === true || (!isEdit && values.mode !== 'single')
  const canFetchModels = SUPPORTS_MODEL_FETCH_TYPES.has(values.type)
    && props.canOperate
    && (isEdit ? true : props.canWriteSensitive && values.key.trim() !== '')

  const keyDescription = (() => {
    if (isEdit) {
      return t('Leave blank to keep the stored key. The server never returns a key, so this field starts empty on every edit — typing one replaces the stored value outright.')
    }
    if (values.mode === 'single') return spec.keyHint === undefined ? undefined : t(spec.keyHint)
    return t('One key per line. {{hint}}', { hint: spec.keyHint === undefined ? '' : t(spec.keyHint) })
  })()

  const keyField = keyIsMultiline
    ? (
        <Textarea
          autoComplete="off"
          description={keyDescription}
          disabled={sensitiveLocked}
          error={resolveError(errors.key)}
          label={isEdit ? t('Replacement key') : t('Key')}
          onChange={(event) => update({ key: event.target.value })}
          required={!isEdit}
          rows={5}
          spellCheck={false}
          textareaClassName="mono"
          value={values.key}
        />
      )
    : (
        <PasswordInput
          autoComplete="off"
          description={keyDescription}
          disabled={sensitiveLocked}
          error={resolveError(errors.key)}
          label={isEdit ? t('Replacement key') : t('Key')}
          onChange={(event) => update({ key: event.target.value })}
          required={!isEdit}
          value={values.key}
        />
      )

  const body = (() => {
    if (isEdit && currentQuery.isPending) {
      return (
        <div aria-busy="true" className="flex flex-col gap-4" role="status">
          <span className="sr-only">{t('Loading the channel')}</span>
          <Skeleton height={40} variant="block" />
          <Skeleton height={64} variant="block" />
          <Skeleton height={64} variant="block" />
          <Skeleton height={140} variant="block" />
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
          title={t('Could not load this channel')}
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
          handleSubmit()
        }}
      >
        {submitError === null ? null : (
          <Alert
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('This was not saved')}
            tone="destructive"
          >
            {submitError}
          </Alert>
        )}

        {sensitiveLocked ? (
          <Alert
            icon={<KeyRoundIcon aria-hidden="true" />}
            title={t('Credential fields are read-only for your account')}
            tone="warning"
          >
            {t('Changing the key, base URL, provider type or override rules needs the channel:sensitive_write grant. Models, groups, priority and notes can still be saved.')}
          </Alert>
        ) : null}

        <Tabs onValueChange={setTab} value={tab}>
          <Tabs.List label={t('Channel editor sections')}>
            <Tabs.Tab value="basics">{t('Basics')}</Tabs.Tab>
            <Tabs.Tab value="credentials">{t('Credentials')}</Tabs.Tab>
            <Tabs.Tab value="models">{t('Models')}</Tabs.Tab>
            <Tabs.Tab value="advanced">{t('Advanced')}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel className="flex flex-col gap-6 pt-2" keepMounted value="basics">
            <Input
              description={t('Shown in the channel table and in request logs.')}
              error={resolveError(errors.name)}
              label={t('Name')}
              maxLength={255}
              onChange={(event) => update({ name: event.target.value })}
              required
              value={values.name}
            />

            <NativeSelect
              description={
                isEdit
                  ? t('Changing the provider type rewrites how every request to this channel is built.')
                  : t('Decides which fields this form offers and how requests are built.')
              }
              disabled={sensitiveLocked}
              label={t('Provider type')}
              onChange={(event) => setValues(applyTypeDefaults(values, Number(event.target.value)))}
              options={typeOptions}
              value={String(values.type)}
            />

            {isEdit ? null : (
              <p className="text-xs leading-5 text-muted">
                {t('Advanced Custom channels need a route table this console does not edit, so that type is only offered when an existing one is opened.')}
              </p>
            )}

            <Input
              description={t('Groups channels for the tag batch operations in the legacy console. Optional.')}
              label={t('Tag')}
              maxLength={255}
              onChange={(event) => update({ tag: event.target.value })}
              value={values.tag}
            />

            <Textarea
              description={t('Private to administrators. Up to 255 characters.')}
              label={t('Admin note')}
              maxLength={255}
              onChange={(event) => update({ remark: event.target.value })}
              rows={2}
              value={values.remark}
            />

            {isEdit ? (
              <p className="text-xs leading-5 text-muted">
                {t('Enabling and disabling happens from the row menu: the update endpoint refuses any request that carries a status.')}
              </p>
            ) : null}
          </Tabs.Panel>

          <Tabs.Panel className="flex flex-col gap-6 pt-2" keepMounted value="credentials">
            {spec.warning === undefined ? null : (
              <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
                {t(spec.warning)}
              </Alert>
            )}

            {isEdit ? null : (
              <RadioGroup<ChannelFormValues['mode']>
                description={t('How the keys below become channels.')}
                disabled={sensitiveLocked}
                label={t('Creation mode')}
                onValueChange={(mode) => update({ mode })}
                options={modeOptions}
                value={values.mode}
              />
            )}

            {!isEdit && values.mode === 'multi_to_single' ? (
              <NativeSelect
                description={t('How the channel picks a key for each request.')}
                label={t('Key rotation')}
                onChange={(event) =>
                  update({ multi_key_mode: event.target.value === 'polling' ? 'polling' : 'random' })}
                options={[
                  { label: t('Random'), value: 'random' },
                  { label: t('Round robin'), value: 'polling' },
                ]}
                value={values.multi_key_mode}
              />
            ) : null}

            {!isEdit && values.mode === 'batch' ? (
              <Checkbox
                checked={values.batch_add_set_key_prefix_2_name}
                description={t('Appends the first 8 characters of each key to the channel name so the rows stay apart.')}
                label={t('Append a key prefix to each channel name')}
                onCheckedChange={(checked) => update({ batch_add_set_key_prefix_2_name: checked })}
              />
            ) : null}

            {keyField}

            {isEdit && current !== undefined && current.channel_info.is_multi_key ? (
              <Alert tone="info">
                {t('This channel holds {{count}} keys. Saving a replacement key here overwrites the whole set; the legacy console owns per-key management.', {
                  count: current.channel_info.multi_key_size,
                })}
              </Alert>
            ) : null}

            <Input
              description={
                spec.baseUrl === undefined
                  ? t('Only needed for a proxy or a private deployment. Leave blank to use {{url}}. Do not add /v1 or a trailing slash.', {
                    url: defaultBaseUrl(values.type) === '' ? t('the provider default') : defaultBaseUrl(values.type),
                  })
                  : t(spec.baseUrl.description)
              }
              disabled={sensitiveLocked}
              error={resolveError(errors.base_url)}
              inputClassName="mono"
              label={spec.baseUrl === undefined ? t('Base URL') : t(spec.baseUrl.label)}
              onChange={(event) => update({ base_url: event.target.value })}
              placeholder={spec.baseUrl === undefined ? defaultBaseUrl(values.type) : spec.baseUrl.placeholder}
              required={spec.baseUrl?.required === true}
              value={values.base_url}
            />

            {spec.other === undefined ? null : (
              <OtherField
                disabled={sensitiveLocked}
                error={resolveError(errors.other)}
                onChange={(next) => update({ other: next })}
                spec={spec.other}
                value={values.other}
              />
            )}

            {spec.showOrganization === true ? (
              <Input
                description={t('Sent as the OpenAI-Organization header. Optional.')}
                disabled={sensitiveLocked}
                inputClassName="mono"
                label={t('OpenAI organisation')}
                onChange={(event) => update({ openai_organization: event.target.value })}
                placeholder="org-..."
                value={values.openai_organization}
              />
            ) : null}

            {(spec.extras ?? []).includes('azure_responses_version') ? (
              <Input
                description={t('Used for the Responses API only. Falls back to the default API version when blank.')}
                disabled={sensitiveLocked}
                inputClassName="mono"
                label={t('Responses API version')}
                onChange={(event) => update({ azure_responses_version: event.target.value })}
                placeholder="preview"
                value={values.azure_responses_version}
              />
            ) : null}

            {(spec.extras ?? []).includes('aws_key_type') ? (
              <NativeSelect
                description={
                  values.aws_key_type === 'api_key'
                    ? t('Key format: APIKey|Region')
                    : t('Key format: AccessKey|SecretAccessKey|Region')
                }
                disabled={sensitiveLocked}
                label={t('AWS key format')}
                onChange={(event) =>
                  update({ aws_key_type: event.target.value === 'api_key' ? 'api_key' : 'ak_sk' })}
                options={[
                  { label: t('Access key and secret'), value: 'ak_sk' },
                  { label: t('API key'), value: 'api_key' },
                ]}
                value={values.aws_key_type}
              />
            ) : null}

            {(spec.extras ?? []).includes('vertex_key_type') ? (
              <NativeSelect
                description={
                  values.vertex_key_type === 'api_key'
                    ? t('The key field takes a plain Vertex AI API key.')
                    : t('The key field takes the service account JSON, pasted whole.')
                }
                disabled={sensitiveLocked}
                label={t('Vertex AI key format')}
                onChange={(event) =>
                  update({ vertex_key_type: event.target.value === 'api_key' ? 'api_key' : 'json' })}
                options={[
                  { label: t('Service account JSON'), value: 'json' },
                  { label: t('API key'), value: 'api_key' },
                ]}
                value={values.vertex_key_type}
              />
            ) : null}

            {(spec.extras ?? []).includes('openrouter_enterprise') ? (
              <Switch
                checked={values.openrouter_enterprise}
                description={t('Enterprise accounts return a different response envelope.')}
                disabled={sensitiveLocked}
                label={t('OpenRouter enterprise account')}
                onCheckedChange={(checked) => update({ openrouter_enterprise: checked })}
              />
            ) : null}
          </Tabs.Panel>

          <Tabs.Panel className="flex flex-col gap-6 pt-2" keepMounted value="models">
            <div className="flex flex-col gap-2">
              <Textarea
                description={t('Comma-separated. These are the names callers request; {{count}} listed.', {
                  count: splitList(values.models).length,
                })}
                error={resolveError(errors.models)}
                label={t('Models')}
                onChange={(event) => update({ models: event.target.value })}
                required
                rows={4}
                textareaClassName="mono"
                value={values.models}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  aria-busy={fetchModelsMutation.isPending}
                  disabled={!canFetchModels || fetchModelsMutation.isPending}
                  onClick={() => fetchModelsMutation.mutate()}
                  size="sm"
                  variant="outline"
                >
                  <DownloadCloudIcon aria-hidden="true" />
                  {t('Fetch from upstream')}
                </Button>
                <span className="text-xs leading-5 text-muted">
                  {canFetchModels
                    ? t('Asks the provider which models it serves and merges them into the list.')
                    : t('Only offered for providers that publish a model list, and only once a key is present.')}
                </span>
              </div>
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="eyebrow mb-1">{t('Groups')}</legend>
              <p className="text-xs leading-5 text-muted">
                {t('Only these user groups can route to this channel. At least one is required.')}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {groupChoices.length === 0 ? (
                  <p className="text-xs leading-5 text-muted">{t('No groups are configured yet.')}</p>
                ) : null}
                {groupChoices.map((group) => (
                  <Checkbox
                    checked={values.groups.includes(group)}
                    key={group}
                    label={group}
                    onCheckedChange={(checked) =>
                      update({
                        groups: checked
                          ? Array.from(new Set([...values.groups, group]))
                          : values.groups.filter((entry) => entry !== group),
                      })}
                  />
                ))}
              </div>
              {errors.groups === undefined ? null : (
                <p className="text-xs leading-5 text-destructive">{resolveError(errors.groups)}</p>
              )}
            </fieldset>

            <Textarea
              description={t('Maps a requested model name onto the name this provider knows, as a JSON object. Leave blank for none.')}
              error={resolveError(errors.model_mapping)}
              label={t('Model mapping')}
              onChange={(event) => update({ model_mapping: event.target.value })}
              placeholder={'{"gpt-4o": "gpt-4o-2024-11-20"}'}
              rows={4}
              spellCheck={false}
              textareaClassName="mono"
              value={values.model_mapping}
            />

            <Input
              description={t('Used by the Test action when no other model is chosen. Leave blank to let the server pick the first model.')}
              inputClassName="mono"
              label={t('Test model')}
              list="channel-drawer-models"
              onChange={(event) => update({ test_model: event.target.value })}
              value={values.test_model}
            />
            <datalist id="channel-drawer-models">
              {(modelsQuery.data ?? []).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Tabs.Panel>

          <Tabs.Panel className="flex flex-col gap-6 pt-2" keepMounted value="advanced">
            <div className="grid gap-6 sm:grid-cols-2">
              <Input
                description={t('Higher wins. Channels are tried in priority order.')}
                error={resolveError(errors.priority)}
                inputClassName="mono"
                inputMode="numeric"
                label={t('Priority')}
                onChange={(event) => update({ priority: event.target.value })}
                value={values.priority}
              />
              <Input
                description={t('Splits traffic between channels of equal priority.')}
                error={resolveError(errors.weight)}
                inputClassName="mono"
                inputMode="numeric"
                label={t('Weight')}
                onChange={(event) => update({ weight: event.target.value })}
                value={values.weight}
              />
            </div>

            <Switch
              checked={values.auto_ban}
              description={t('Lets the gateway disable this channel by itself after repeated upstream failures.')}
              label={t('Auto-disable on repeated failures')}
              onCheckedChange={(checked) => update({ auto_ban: checked })}
            />

            <Textarea
              description={t('Rewrites upstream HTTP status codes, as a JSON object. Leave blank for none.')}
              error={resolveError(errors.status_code_mapping)}
              label={t('Status code mapping')}
              onChange={(event) => update({ status_code_mapping: event.target.value })}
              placeholder={'{"400": "500"}'}
              rows={3}
              spellCheck={false}
              textareaClassName="mono"
              value={values.status_code_mapping}
            />

            <Textarea
              description={t('Merged into every request body, as a JSON object. Requires the sensitive-write grant.')}
              disabled={sensitiveLocked}
              error={resolveError(errors.param_override)}
              label={t('Parameter override')}
              onChange={(event) => update({ param_override: event.target.value })}
              placeholder={'{"temperature": 0.7}'}
              rows={3}
              spellCheck={false}
              textareaClassName="mono"
              value={values.param_override}
            />

            <Textarea
              description={t('Merged into every outbound header set, as a JSON object. Requires the sensitive-write grant.')}
              disabled={sensitiveLocked}
              error={resolveError(errors.header_override)}
              label={t('Header override')}
              onChange={(event) => update({ header_override: event.target.value })}
              placeholder={'{"X-Example": "value"}'}
              rows={3}
              spellCheck={false}
              textareaClassName="mono"
              value={values.header_override}
            />

            <Input
              description={t('HTTP, HTTPS, SOCKS5 or SOCKS5H. Leave blank to go direct.')}
              disabled={sensitiveLocked}
              inputClassName="mono"
              label={t('Outbound proxy')}
              onChange={(event) => update({ proxy: event.target.value })}
              placeholder="socks5://127.0.0.1:1080"
              value={values.proxy}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <NativeSelect
                description={t('Forces HTTP/1.1 for upstreams that mishandle HTTP/2.')}
                disabled={sensitiveLocked}
                label={t('HTTP protocol')}
                onChange={(event) => update({ http_protocol: event.target.value })}
                options={[
                  { label: t('Automatic'), value: '' },
                  { label: t('HTTP/1.1'), value: 'http1' },
                ]}
                value={values.http_protocol === 'auto' ? '' : values.http_protocol}
              />
              <Input
                description={t('Spreads HTTP/2 traffic across 1 to 8 transports. Blank means one.')}
                disabled={sensitiveLocked}
                error={resolveError(errors.http2_connection_shards)}
                inputClassName="mono"
                inputMode="numeric"
                label={t('HTTP/2 connection shards')}
                onChange={(event) => update({ http2_connection_shards: event.target.value })}
                value={values.http2_connection_shards}
              />
            </div>

            <Textarea
              description={t('Prepended to every conversation on this channel.')}
              disabled={sensitiveLocked}
              label={t('System prompt')}
              onChange={(event) => update({ system_prompt: event.target.value })}
              rows={3}
              value={values.system_prompt}
            />

            <div className="flex flex-col">
              <ToggleRow
                checked={values.system_prompt_override}
                description={t('Replaces a caller-supplied system prompt instead of prepending to it.')}
                disabled={sensitiveLocked}
                label={t('Override the caller system prompt')}
                onChange={(checked) => update({ system_prompt_override: checked })}
              />
              <ToggleRow
                checked={values.force_format}
                description={t('Normalises the upstream response into the OpenAI shape.')}
                disabled={sensitiveLocked}
                label={t('Force response format')}
                onChange={(checked) => update({ force_format: checked })}
              />
              <ToggleRow
                checked={values.thinking_to_content}
                description={t('Folds reasoning output into the message content.')}
                disabled={sensitiveLocked}
                label={t('Move reasoning into content')}
                onChange={(checked) => update({ thinking_to_content: checked })}
              />
              <ToggleRow
                checked={values.pass_through_body_enabled}
                description={t('Sends the caller body through untouched instead of rebuilding it.')}
                disabled={sensitiveLocked}
                label={t('Pass the request body through')}
                onChange={(checked) => update({ pass_through_body_enabled: checked })}
              />
            </div>

            {(spec.extras ?? []).some((extra) => PASSTHROUGH_EXTRAS.has(extra)) ? (
              <section className="flex flex-col gap-2">
                <h3 className="eyebrow">{t('Field passthrough')}</h3>
                <p className="text-xs leading-5 text-muted">
                  {t('These request fields are filtered out by default because they can change what the upstream charges or where it runs.')}
                </p>
                <div className="flex flex-col">
                  {PASSTHROUGH_ROWS.filter((row) => (spec.extras ?? []).includes(row.key)).map((row) => (
                    <ToggleRow
                      checked={values[row.key]}
                      description={t(row.description)}
                      disabled={sensitiveLocked}
                      key={row.key}
                      label={t(row.label)}
                      onChange={(checked) => update({ [row.key]: checked })}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </Tabs.Panel>
        </Tabs>
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
        disabled={mutation.isPending || !canSubmit || (isEdit && current === undefined)}
        form={FORM_ID}
        type="submit"
        variant="primary"
      >
        {isEdit ? t('Save changes') : t('Create channel')}
      </Button>
    </>
  )

  return (
    <Drawer
      description={
        isEdit
          ? t('Credentials, routing and the per-provider fields this type needs.')
          : t('A provider type decides which fields this form asks for. The key is written once and never read back.')
      }
      footer={footer}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="xl"
      title={isEdit ? t('Edit channel') : t('New channel')}
    >
      <div className="flex flex-col gap-6">
        {canSubmit ? null : (
          <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
            {isEdit
              ? t('Your account cannot save changes to a channel.')
              : t('Creating a channel needs the channel:sensitive_write grant, which your account does not hold.')}
          </Alert>
        )}
        {isEdit && current !== undefined ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge className="mono" size="sm" tone="muted">{`#${current.id}`}</Badge>
            <span>{t('Created {{date}}', { date: new Date(current.created_time * 1000).toLocaleString() })}</span>
          </p>
        ) : null}
        {body}
      </div>
    </Drawer>
  )
}

const PASSTHROUGH_ROWS = [
  {
    description: 'Lets a caller select a paid service tier on this provider.',
    key: 'allow_service_tier' as const,
    label: 'Allow service_tier',
  },
  {
    description: 'Lets a caller pin the inference region, which affects data residency.',
    key: 'allow_inference_geo' as const,
    label: 'Allow inference_geo',
  },
  {
    description: 'Lets a caller switch the reasoning speed mode.',
    key: 'allow_speed' as const,
    label: 'Allow speed',
  },
  {
    description: 'Lets a caller send an end-user identifier upstream.',
    key: 'allow_safety_identifier' as const,
    label: 'Allow safety_identifier',
  },
  {
    description: 'Stops store from being forwarded. Codex clients may break without it.',
    key: 'disable_store' as const,
    label: 'Block store',
  },
  {
    description: 'Lets a caller turn off stream obfuscation padding.',
    key: 'allow_include_obfuscation' as const,
    label: 'Allow stream_options.include_obfuscation',
  },
  {
    description: 'Appends ?beta=true to every Anthropic request.',
    key: 'claude_beta_query' as const,
    label: 'Request the Anthropic beta endpoint',
  },
]

const PASSTHROUGH_EXTRAS: Set<ChannelExtraField> = new Set(PASSTHROUGH_ROWS.map((row) => row.key))

type ToggleRowProps = {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow(props: ToggleRowProps) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.label}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{props.description}</p>
      </div>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        hideLabel
        label={props.label}
        onCheckedChange={props.onChange}
      />
    </div>
  )
}

type OtherFieldProps = {
  spec: NonNullable<ReturnType<typeof channelTypeSpec>['other']>
  value: string
  disabled: boolean
  error: string | undefined
  onChange: (value: string) => void
}

/** The `other` column: one scalar whose meaning is decided entirely by the type. */
function OtherField(props: OtherFieldProps) {
  const { t } = useTranslation()
  const shared = {
    description: t(props.spec.description),
    disabled: props.disabled,
    error: props.error,
    label: t(props.spec.label),
    placeholder: props.spec.placeholder,
    required: props.spec.required === true,
    value: props.value,
  }

  if (props.spec.multiline === true) {
    return (
      <Textarea
        {...shared}
        onChange={(event) => props.onChange(event.target.value)}
        rows={3}
        spellCheck={false}
        textareaClassName="mono"
      />
    )
  }

  return (
    <Input
      {...shared}
      inputClassName="mono"
      onChange={(event) => props.onChange(event.target.value)}
    />
  )
}
