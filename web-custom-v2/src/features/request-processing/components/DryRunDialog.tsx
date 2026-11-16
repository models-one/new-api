import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import PlayIcon from 'lucide-react/dist/esm/icons/play'

import { Input, NativeSelect, Textarea } from '@/components/form'
import { Dialog, toErrorMessage } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import type { TaskPluginOption } from '@/features/channels/task-plugin-binding'
import {
  REQUEST_PLUGIN_DRY_RUN_FORMATS,
  requestPluginDryRunExample,
  requestPluginDryRunPath,
} from '@/features/task-plugins/lib/request-plugins'
import type { RequestPluginInstance } from '@/features/task-plugins/types'

import { dryRunRequestPlugins } from '../api'
import { DryRunResultView } from './DryRunResultView'

type DryRunDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  instances: RequestPluginInstance[]
  plugins: TaskPluginOption[]
  groups: string[]
}

const DEFAULT_FORMAT = REQUEST_PLUGIN_DRY_RUN_FORMATS[0]

/** Parses a pasted request body; only a JSON object is a request. */
export function parseRequestBody(text: string): Record<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return parsed as Record<string, unknown>
}

/** Runs the saved instances on a sample request; nothing is sent upstream or charged. */
export function DryRunDialog(props: DryRunDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      description={t('Runs the saved instances on a sample request.')}
      onOpenChange={props.onOpenChange}
      open={props.open}
      scrollBody
      size="lg"
      title={t('Dry run')}
    >
      {props.open ? <DryRunForm {...props} /> : null}
    </Dialog>
  )
}

function DryRunForm(props: DryRunDialogProps) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<string>(DEFAULT_FORMAT.value)
  const [model, setModel] = useState<string>(DEFAULT_FORMAT.model)
  const [group, setGroup] = useState('')
  const [channelId, setChannelId] = useState('')
  const [body, setBody] = useState(() => JSON.stringify(requestPluginDryRunExample(DEFAULT_FORMAT.value, DEFAULT_FORMAT.model), null, 2))
  const [bodyError, setBodyError] = useState('')
  const [channelError, setChannelError] = useState('')
  const [sent, setSent] = useState<unknown>(null)
  const mutation = useMutation({ mutationFn: dryRunRequestPlugins })
  const result = mutation.data

  function run() {
    const parsed = parseRequestBody(body)
    const channel = channelId.trim() === '' ? undefined : Number(channelId)
    const channelInvalid = channel !== undefined && !(Number.isInteger(channel) && channel > 0)
    setBodyError(parsed === null ? t('Request body must be a JSON object.') : '')
    setChannelError(channelInvalid ? t('Enter a valid channel ID.') : '')
    if (parsed === null || channelInvalid) return
    setSent(parsed)
    mutation.mutate({
      body: parsed,
      channel_id: channel,
      format,
      group: group.trim() || undefined,
      model: model.trim(),
      path: requestPluginDryRunPath(format, model.trim()),
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <NativeSelect
          label={t('Format')}
          onChange={(event) => {
            const next = REQUEST_PLUGIN_DRY_RUN_FORMATS.find((item) => item.value === event.target.value)
            if (!next) return
            setFormat(next.value)
            setModel(next.model)
            setBody(JSON.stringify(requestPluginDryRunExample(next.value, next.model), null, 2))
          }}
          options={REQUEST_PLUGIN_DRY_RUN_FORMATS.map((item) => ({ label: item.label, value: item.value }))}
          value={format}
        />
        <Input label={t('Model')} onChange={(event) => setModel(event.target.value)} placeholder={DEFAULT_FORMAT.model} value={model} />
        <NativeSelect
          description={t('Also runs the instances for this group.')}
          label={t('Group')}
          onChange={(event) => setGroup(event.target.value)}
          options={[{ label: t('Any group'), value: '' }, ...props.groups.map((item) => ({ label: item, value: item }))]}
          value={group}
        />
        <Input
          description={t('Also runs the instances this channel adds.')}
          error={channelError || undefined}
          inputMode="numeric"
          label={t('Channel ID')}
          onChange={(event) => setChannelId(event.target.value)}
          placeholder={t('Optional, for example: 12')}
          value={channelId}
        />
      </div>
      <Textarea
        error={bodyError || undefined}
        label={t('Request body')}
        onChange={(event) => setBody(event.target.value)}
        rows={10}
        spellCheck={false}
        textareaClassName="font-mono text-xs"
        value={body}
      />
      <div className="flex justify-end">
        <Button aria-busy={mutation.isPending} disabled={mutation.isPending || model.trim() === ''} onClick={run} variant="primary">
          <PlayIcon aria-hidden="true" />
          {t('Run')}
        </Button>
      </div>
      {mutation.isError ? <Alert tone="destructive">{toErrorMessage(mutation.error)}</Alert> : null}
      {result ? (
        <DryRunResultView
          instanceName={(id) =>
            props.instances.find((instance) => instance.id === id)?.name || result.steps?.find((step) => step.instance === id)?.name || id
          }
          pluginName={(key) => props.plugins.find((item) => item.key === key)?.name ?? key}
          result={result}
          sent={sent}
          showSteps
        />
      ) : null}
    </div>
  )
}
