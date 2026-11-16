import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PlayIcon from 'lucide-react/dist/esm/icons/play'

import { NativeSelect, Textarea } from '@/components/form'
import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, SegmentedControl } from '@/components/ui'
import type { TaskPluginOption } from '@/features/channels/task-plugin-binding'
import {
  REQUEST_PLUGIN_DRY_RUN_FORMATS,
  requestPluginDryRunExample,
  requestPluginDryRunPath,
} from '@/features/task-plugins/lib/request-plugins'
import { localizedText } from '@/features/task-plugins/presentation'
import type { RequestPluginInstance, RequestPluginSample } from '@/features/task-plugins/types'

import { dryRunRequestPlugins } from '../api'
import { drawSampleImage } from '../lib/sample-image'
import {
  REQUEST_PLUGIN_SAMPLE_IMAGE,
  requestPluginSampleBody,
  requestPluginSampleHasImage,
  requestPluginSamplesFor,
  requestPluginSampleTexts,
} from '../lib/samples'
import { parseRequestBody } from './DryRunDialog'
import { DryRunResultView } from './DryRunResultView'

type TryPanelProps = {
  plugin: TaskPluginOption
  /** The instance as edited; null while its settings have problems. */
  instance: RequestPluginInstance | null
}

const SAMPLE_FORMAT = REQUEST_PLUGIN_DRY_RUN_FORMATS[0]

/**
 * Runs the instance being edited on a sample or pasted request, so the administrator sees
 * what its settings do before saving them. Plugins can offer their own samples; the
 * console adds its own image to them.
 */
export function TryPanel(props: TryPanelProps) {
  const { i18n, t } = useTranslation()
  const [mode, setMode] = useState<'sample' | 'paste'>('sample')
  const [sampleIndex, setSampleIndex] = useState(0)
  const [format, setFormat] = useState<string>(SAMPLE_FORMAT.value)
  const [pasted, setPasted] = useState(() => JSON.stringify(requestPluginDryRunExample(SAMPLE_FORMAT.value, SAMPLE_FORMAT.model), null, 2))
  const [pastedReply, setPastedReply] = useState('')
  const [inputError, setInputError] = useState('')
  const [run, setRun] = useState<{ body: unknown; reply?: string; instance: string }>()
  const image = useMemo(drawSampleImage, [])
  const mutation = useMutation({ mutationFn: dryRunRequestPlugins })

  const checksReplies = props.plugin.transform_hooks?.includes('reply') === true
  const genericReply = t(
    'Yes, the soft colors and wide frame suit a phone wallpaper. I sent the full answer to alex@example.com; call +14155550123 if you would like a different crop.',
  )
  let samples = requestPluginSamplesFor(props.plugin.samples ?? [], i18n.language)
  if (samples.length === 0) {
    const genericSample: RequestPluginSample = {
      body: {
        messages: [
          {
            content: [
              {
                text: t(
                  'Would this photo work as a phone wallpaper? Email the answer to alex@example.com, or call +14155550123 if anything is unclear.',
                ),
                type: 'text',
              },
              REQUEST_PLUGIN_SAMPLE_IMAGE,
            ],
            role: 'user',
          },
        ],
        model: SAMPLE_FORMAT.model,
      },
      format: 'openai',
      name: '',
    }
    samples = [genericSample]
  }
  const chosen = Math.min(sampleIndex, samples.length - 1)
  const sample = samples[chosen]
  const sampleBody = requestPluginSampleBody(sample.body, sample.format, image)
  const sampleReply = checksReplies ? (sample.reply ?? genericReply) : undefined
  const instanceKey = props.instance ? JSON.stringify(props.instance) : ''
  const stale = Boolean(mutation.data && run && run.instance !== instanceKey)

  function forget() {
    // The result of another request would read as this one's.
    mutation.reset()
    setRun(undefined)
  }

  function start() {
    if (!props.instance) return
    let body: unknown = sampleBody
    let runFormat: string = sample.format
    let reply = sampleReply
    if (mode === 'paste') {
      body = parseRequestBody(pasted)
      if (body === null) {
        setInputError(t('Request body must be a JSON object.'))
        return
      }
      runFormat = format
      reply = checksReplies && pastedReply.trim() ? pastedReply : undefined
    }
    setInputError('')
    const bodyModel = (body as { model?: unknown }).model
    const model =
      typeof bodyModel === 'string' && bodyModel.trim()
        ? bodyModel
        : (REQUEST_PLUGIN_DRY_RUN_FORMATS.find((item) => item.value === runFormat)?.model ?? SAMPLE_FORMAT.model)
    setRun({ body, instance: instanceKey, reply })
    mutation.mutate({ body, format: runFormat, instance: props.instance, model, path: requestPluginDryRunPath(runFormat, model), reply })
  }

  return (
    <aside aria-label={t('Try it')} className="flex h-fit min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-high/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('Try it')}</h3>
        <Button aria-busy={mutation.isPending} disabled={!props.instance || mutation.isPending} onClick={start} size="sm" variant="outline">
          <PlayIcon aria-hidden="true" />
          {t('Run')}
        </Button>
      </div>
      <SegmentedControl
        label={t('Request to try')}
        onChange={(next) => {
          setMode(next)
          forget()
        }}
        options={[
          { id: 'sample' as const, label: t('Sample request') },
          { id: 'paste' as const, label: t('Paste a request') },
        ]}
        size="sm"
        value={mode}
      />
      {mode === 'paste' ? (
        <div className="flex flex-col gap-2">
          <NativeSelect
            hideLabel
            label={t('Request format')}
            onChange={(event) => setFormat(event.target.value)}
            options={REQUEST_PLUGIN_DRY_RUN_FORMATS.map((item) => ({ label: item.label, value: item.value }))}
            size="sm"
            value={format}
          />
          <Textarea
            error={inputError || undefined}
            hideLabel
            label={t('Request body')}
            onChange={(event) => setPasted(event.target.value)}
            rows={9}
            spellCheck={false}
            textareaClassName="font-mono text-xs"
            value={pasted}
          />
          {checksReplies ? (
            <Textarea
              label={t('Reply to check (optional)')}
              onChange={(event) => setPastedReply(event.target.value)}
              placeholder={genericReply}
              rows={3}
              value={pastedReply}
            />
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {samples.length > 1 ? (
            <NativeSelect
              hideLabel
              label={t('Samples')}
              onChange={(event) => {
                setSampleIndex(Number(event.target.value))
                forget()
              }}
              options={samples.map((item, position) => ({
                label: localizedText(item.name, i18n.language) || t('Sample request'),
                value: String(position),
              }))}
              size="sm"
              value={String(chosen)}
            />
          ) : null}
          {mutation.data ? null : (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
              {requestPluginSampleTexts(sampleBody).map((text, position) => (
                // A sample's texts are fixed, so their position identifies them.
                <p className="line-clamp-6 text-sm leading-6 break-words whitespace-pre-wrap" key={position}>
                  {text}
                </p>
              ))}
              {image && requestPluginSampleHasImage(sample.body) ? (
                <div className="flex items-center gap-3">
                  <img alt="" className="size-14 rounded-lg object-cover" src={image} />
                  <p className="text-xs text-muted">{t('Attached image')} · PNG</p>
                </div>
              ) : null}
              {sampleReply === undefined ? null : (
                <div className="flex flex-col gap-1 border-t border-border pt-3">
                  <p className="text-xs text-muted">{t('Sample reply')}</p>
                  <p className="line-clamp-6 text-sm leading-6 break-words whitespace-pre-wrap">{sampleReply}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {props.instance ? null : <p className="text-xs text-muted">{t('Fix the settings first, then run.')}</p>}
      {mutation.isError ? <Alert tone="destructive">{toErrorMessage(mutation.error)}</Alert> : null}
      {stale ? <p className="text-xs text-warning">{t('The settings changed since this run.')}</p> : null}
      {mutation.data && run ? (
        <DryRunResultView
          instanceName={() => props.instance?.name ?? props.plugin.name}
          optional={props.plugin.optional}
          pluginName={() => props.plugin.name}
          result={mutation.data}
          sent={run.body}
          sentReply={run.reply}
        />
      ) : (
        <p className="text-xs text-muted">{t('Uses the current settings.')}</p>
      )}
    </aside>
  )
}
