import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import ArrowLeftIcon from 'lucide-react/dist/esm/icons/arrow-left'
import BoxesIcon from 'lucide-react/dist/esm/icons/boxes'
import GlobeIcon from 'lucide-react/dist/esm/icons/globe'
import ListChecksIcon from 'lucide-react/dist/esm/icons/list-checks'
import PlugIcon from 'lucide-react/dist/esm/icons/plug'
import UsersIcon from 'lucide-react/dist/esm/icons/users'

import { Checkbox, Input, RadioGroup, Switch, Textarea } from '@/components/form'
import { Dialog } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import type { TaskPluginOption } from '@/features/channels/task-plugin-binding'
import { PluginConfigForm } from '@/features/task-plugins/components/PluginConfigForm'
import { PluginIcon } from '@/features/task-plugins/components/PluginIcon'
import {
  fromRequestPluginConfigDraft,
  REQUEST_PLUGIN_STAGE_LABELS,
  requestPluginConfigDefaults,
  toRequestPluginConfigDraft,
} from '@/features/task-plugins/lib/request-plugins'
import { localizedText } from '@/features/task-plugins/presentation'
import type { RequestPluginInstance } from '@/features/task-plugins/types'

import { TryPanel } from './TryPanel'

const FORM_ID = 'request-plugin-instance-form'

type InstanceEditorProps = {
  open: boolean
  /** Null adds a new instance, starting with the choice of plugin. */
  instance: RequestPluginInstance | null
  plugins: TaskPluginOption[]
  /** How many instances each plugin already has, by plugin key. */
  instanceCounts: Record<string, number>
  groups: string[]
  /** Model names offered as suggestions; other names can be typed in. */
  models: string[]
  saving: boolean
  /** The gateway's validation message for the last save. */
  error?: string
  onOpenChange: (open: boolean) => void
  onSave: (instance: RequestPluginInstance) => void
}

/** Which requests an instance processes besides the channels that add it. */
type InstanceScope = 'all' | 'groups' | 'channels'
/** Whether an instance runs for every model or only for the ones picked. */
type ModelScope = 'all' | 'chosen'

/** When a request processing plugin runs, and what a failure of it does. */
export function PluginRunLine(props: { plugin: TaskPluginOption }) {
  const { t } = useTranslation()
  const hooks = props.plugin.transform_hooks ?? []
  // Only the request stages can refuse a request: a reply check that fails stops the
  // answer, and a report holds nothing up. A plugin without its stages listed is taken to
  // change requests.
  const checksRequest = hooks.length === 0 || hooks.some((hook) => hook !== 'reply' && hook !== 'report')
  const checksReply = hooks.includes('reply')
  let failure = ''
  if (checksRequest || checksReply) {
    if (props.plugin.optional) failure = t('Skipped when it fails')
    else if (checksRequest) failure = t('Refuses the request when it fails')
    else failure = t('Stops the reply when it fails')
  }
  const parts = [...hooks.map((hook) => t(REQUEST_PLUGIN_STAGE_LABELS[hook] ?? hook)), failure].filter(Boolean)
  return <span className="text-xs text-muted">{parts.join(' · ')}</span>
}

export function InstanceEditor(props: InstanceEditorProps) {
  // Each opening starts afresh, so edits left in a closed editor are gone.
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(props.open)
  if (props.open !== wasOpen) {
    setWasOpen(props.open)
    if (props.open) setSession((current) => current + 1)
  }
  return <InstanceEditorDialog key={session} {...props} />
}

function InstanceEditorDialog(props: InstanceEditorProps) {
  const { i18n, t } = useTranslation()
  const [pluginKey, setPluginKey] = useState(props.instance?.plugin ?? '')
  const [name, setName] = useState(props.instance?.name ?? '')
  const [enabled, setEnabled] = useState(props.instance?.enabled ?? true)
  const [scope, setScope] = useState<InstanceScope>(() => {
    if (!props.instance || props.instance.global) return 'all'
    return props.instance.groups.length > 0 ? 'groups' : 'channels'
  })
  const [groups, setGroups] = useState(props.instance?.groups ?? [])
  // Servers before the model filter send no list.
  const [modelsText, setModelsText] = useState((props.instance?.models ?? []).join(', '))
  const [modelScope, setModelScope] = useState<ModelScope>((props.instance?.models ?? []).length > 0 ? 'chosen' : 'all')
  const plugin = props.plugins.find((item) => item.key === pluginKey)
  const schema = plugin?.configSchema ?? undefined
  const [draft, setDraft] = useState(() =>
    toRequestPluginConfigDraft(schema, props.instance?.config ?? requestPluginConfigDefaults(schema)),
  )
  // Problems show as the admin edits; the rest show once a save is tried.
  const [showAllErrors, setShowAllErrors] = useState(false)
  // An instance whose plugin is gone keeps its saved settings untouched.
  const pluginMissing = pluginKey !== '' && plugin === undefined
  const parsed = useMemo(() => fromRequestPluginConfigDraft(schema, draft), [schema, draft])
  const models = [...new Set(modelsText.split(/[,\n]/).map((model) => model.trim()).filter(Boolean))]
  const groupsMissing = scope === 'groups' && groups.length === 0
  const modelsMissing = modelScope === 'chosen' && models.length === 0
  const pluginName = plugin?.name ?? pluginKey

  function pick(key: string) {
    const next = props.plugins.find((item) => item.key === key)
    const nextSchema = next?.configSchema ?? undefined
    setPluginKey(key)
    setName(next?.name ?? key)
    setDraft(toRequestPluginConfigDraft(nextSchema, requestPluginConfigDefaults(nextSchema)))
    setShowAllErrors(false)
  }

  function buildInstance(config: Record<string, unknown>): RequestPluginInstance {
    return {
      config,
      enabled,
      global: scope === 'all',
      groups: scope === 'groups' ? groups : [],
      id: props.instance?.id ?? '',
      models: modelScope === 'chosen' ? models : [],
      name: name.trim() || pluginName,
      plugin: pluginKey,
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    let config = props.instance?.config ?? {}
    if (!pluginMissing) {
      if (Object.keys(parsed.errors).length > 0) {
        setShowAllErrors(true)
        return
      }
      config = parsed.config
    }
    if (groupsMissing || modelsMissing) {
      setShowAllErrors(true)
      return
    }
    props.onSave(buildInstance(config))
  }

  if (pluginKey === '') {
    return (
      <Dialog
        description={t('Pick a plugin to start. You can change its settings at any time.')}
        onOpenChange={props.onOpenChange}
        open={props.open}
        scrollBody
        size="md"
        title={t('Add request processing')}
      >
        {props.plugins.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{t('No request processing plugins installed')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {props.plugins.map((option) => {
              const count = props.instanceCounts[option.key] ?? 0
              return (
                <li key={option.key}>
                  <button
                    className="flex h-full w-full items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-surface-high"
                    onClick={() => pick(option.key)}
                    type="button"
                  >
                    <PluginIcon hasIcon={option.hasIcon} icon={option.icon} name={option.name} pluginKey={option.key} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                        {option.name}
                        {count > 0 ? <span className="text-xs font-normal text-muted">{t('{{count}} added', { count })}</span> : null}
                      </span>
                      <span className="line-clamp-2 text-sm text-muted">{localizedText(option.description, i18n.language)}</span>
                      <PluginRunLine plugin={option} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Dialog>
    )
  }

  return (
    <Dialog
      description={plugin ? localizedText(plugin.description, i18n.language) || undefined : undefined}
      footer={
        <>
          {props.instance ? null : (
            <Button className="mr-auto" disabled={props.saving} onClick={() => setPluginKey('')} variant="quiet">
              <ArrowLeftIcon aria-hidden="true" />
              {t('Other plugins')}
            </Button>
          )}
          <Button disabled={props.saving} onClick={() => props.onOpenChange(false)} variant="outline">
            {t('Cancel')}
          </Button>
          <Button aria-busy={props.saving} disabled={props.saving} form={FORM_ID} type="submit" variant="primary">
            {props.saving ? t('Saving…') : t('Save')}
          </Button>
        </>
      }
      onOpenChange={(open) => (props.saving ? undefined : props.onOpenChange(open))}
      open={props.open}
      scrollBody
      size={plugin ? 'xl' : 'md'}
      title={props.instance ? t('Edit {{name}}', { name: props.instance.name }) : t('Add {{name}}', { name: pluginName })}
    >
      <div className={plugin ? 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]' : undefined}>
        <form className="flex min-w-0 flex-col gap-6" id={FORM_ID} noValidate onSubmit={submit}>
          <div className="flex items-start gap-3">
            <PluginIcon hasIcon={plugin?.hasIcon} icon={plugin?.icon} name={pluginName} pluginKey={pluginKey} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Input disabled={props.saving} label={t('Name')} maxLength={64} onChange={(event) => setName(event.target.value)} placeholder={pluginName} value={name} />
              {plugin ? <PluginRunLine plugin={plugin} /> : null}
            </div>
          </div>
          <Switch
            checked={enabled}
            description={t('A disabled instance is kept but processes no request.')}
            disabled={props.saving}
            label={t('Enabled')}
            onCheckedChange={setEnabled}
          />

          <section className="flex flex-col gap-2.5">
            <h3 className="eyebrow">{t('Settings')}</h3>
            {plugin ? (
              <PluginConfigForm
                disabled={props.saving}
                draft={draft}
                errors={parsed.errors}
                idPrefix="request-plugin-config"
                onChange={setDraft}
                schema={schema}
                showAllErrors={showAllErrors}
              />
            ) : (
              <Alert tone="warning">
                {t('This plugin is disabled or not installed, so the instance does not run. It keeps its settings.')}
              </Alert>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <RadioGroup<InstanceScope>
              disabled={props.saving}
              label={t('Where it runs')}
              onValueChange={setScope}
              options={[
                { description: t('Whatever the group or channel'), icon: <GlobeIcon aria-hidden="true" />, label: t('All requests'), value: 'all' },
                {
                  description: t('Only requests from the groups you pick'),
                  icon: <UsersIcon aria-hidden="true" />,
                  label: t('Chosen groups'),
                  value: 'groups',
                },
                {
                  description: t('Runs once a channel adds it in its settings'),
                  icon: <PlugIcon aria-hidden="true" />,
                  label: t('Channels that add it'),
                  value: 'channels',
                },
              ]}
              orientation="horizontal"
              value={scope}
              variant="card"
            />
            {scope === 'groups' ? (
              <fieldset className="flex flex-wrap gap-x-6 gap-y-3">
                <legend className="sr-only">{t('Select groups')}</legend>
                {/* A group removed from the settings stays listed while the instance names it. */}
                {[...new Set([...props.groups, ...groups])].map((group) => (
                  <Checkbox
                    checked={groups.includes(group)}
                    disabled={props.saving}
                    key={group}
                    label={group}
                    onCheckedChange={(checked) => setGroups(checked ? [...new Set([...groups, group])] : groups.filter((item) => item !== group))}
                  />
                ))}
              </fieldset>
            ) : null}
            {showAllErrors && groupsMissing ? <p className="text-sm text-destructive">{t('Pick at least one group')}</p> : null}

            <RadioGroup<ModelScope>
              disabled={props.saving}
              label={t('Models')}
              onValueChange={setModelScope}
              options={[
                {
                  description: t('Whatever model the request asks for'),
                  icon: <BoxesIcon aria-hidden="true" />,
                  label: t('All models'),
                  value: 'all',
                },
                {
                  description: t('Only requests for the models you pick'),
                  icon: <ListChecksIcon aria-hidden="true" />,
                  label: t('Chosen models'),
                  value: 'chosen',
                },
              ]}
              orientation="horizontal"
              value={modelScope}
              variant="card"
            />
            {modelScope === 'chosen' ? (
              <Textarea
                description={t('Comma-separated model names, as clients ask for them. Enabled models include: {{models}}', {
                  models: props.models.slice(0, 8).join(', ') || '—',
                })}
                disabled={props.saving}
                error={showAllErrors && modelsMissing ? t('Pick at least one model') : undefined}
                label={t('Chosen models')}
                onChange={(event) => setModelsText(event.target.value)}
                rows={2}
                spellCheck={false}
                textareaClassName="font-mono text-xs"
                value={modelsText}
              />
            ) : null}
          </section>

          {props.error ? <Alert tone="destructive">{props.error}</Alert> : null}
        </form>
        {plugin ? <TryPanel instance={Object.keys(parsed.errors).length === 0 ? buildInstance(parsed.config) : null} plugin={plugin} /> : null}
      </div>
    </Dialog>
  )
}
