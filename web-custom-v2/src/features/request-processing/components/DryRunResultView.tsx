import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'

import { Collapsible } from '@/components/disclosure'
import { Alert } from '@/components/ui'
import { REQUEST_PLUGIN_EFFORT_LABELS, REQUEST_PLUGIN_STAGE_LABELS } from '@/features/task-plugins/lib/request-plugins'
import { localizedText } from '@/features/task-plugins/presentation'
import type { RequestPluginDryRunResult, RequestPluginRecordEntry } from '@/features/task-plugins/types'
import { formatBytes, formatNumber } from '@/lib/format'

type DryRunResultViewProps = {
  result: RequestPluginDryRunResult
  /** The body the run was given, to tell what the plugins rewrote. */
  sent: unknown
  /** The answer the reply checks read, when the run had one. */
  sentReply?: string
  /** A failure of this plugin is skipped rather than refusing the request. */
  optional?: boolean
  instanceName: (id: string) => string
  pluginName: (key: string) => string
  /** The step table; left out where one instance runs alone. */
  showSteps?: boolean
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Whether an object holds an image as base64 data next to its MIME type. */
function holdsImage(object: Record<string, unknown>) {
  const mime = object.media_type ?? object.mimeType ?? object.mime_type
  return typeof mime === 'string' && mime.startsWith('image/') && typeof object.data === 'string'
}

type ChangedText = { path: string; before: string; after: string }

/**
 * Up to three texts the run rewrote, in document order: strings at the same place in
 * both bodies that differ. Images are left out.
 */
export function changedTexts(before: unknown, after: unknown, path = '', found: ChangedText[] = []): ChangedText[] {
  if (found.length === 3) return found
  if (typeof before === 'string' && typeof after === 'string') {
    if (before !== after && !before.startsWith('data:') && !after.startsWith('data:')) found.push({ after, before, path })
  } else if (Array.isArray(before) && Array.isArray(after)) {
    after.forEach((item, index) => changedTexts(before[index], item, `${path}/${index}`, found))
  } else if (isObject(before) && isObject(after) && !holdsImage(after)) {
    for (const [key, value] of Object.entries(after)) changedTexts(before[key], value, `${path}/${key}`, found)
  }
  return found
}

/** A body as readable JSON: inline image data is named by its size instead of printed. */
export function printableBody(value: unknown): string {
  return JSON.stringify(
    value ?? null,
    (key, member: unknown) => {
      if (typeof member !== 'string') return member
      if (member.startsWith('data:') && member.length > 200) return `${member.slice(0, member.indexOf(',') + 1)}… (${formatBytes(member.length)})`
      if (key === 'data' && member.length > 2000) return `… (${formatBytes(member.length)})`
      return member
    },
    2,
  )
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-foreground">{props.title}</h4>
      {props.children}
    </div>
  )
}

function BeforeAfter(props: { beforeLabel: string; afterLabel: string; before: string; after: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {[
        { label: props.beforeLabel, text: props.before },
        { label: props.afterLabel, text: props.after },
      ].map((side) => (
        <div className="flex flex-col gap-1 rounded-lg border border-border p-3" key={side.label}>
          <p className="text-xs text-muted">{side.label}</p>
          <p className="line-clamp-6 text-sm leading-6 break-words whitespace-pre-wrap">{side.text}</p>
        </div>
      ))}
    </div>
  )
}

/** What a dry run did: the outcome, each step, and what changed in the request and reply. */
export function DryRunResultView(props: DryRunResultViewProps) {
  const { i18n, t } = useTranslation()
  const [bodyOpen, setBodyOpen] = useState(false)
  const result = props.result
  const steps = result.steps ?? []
  const entries = (result.record ?? []).filter((item): item is RequestPluginRecordEntry => 'plugin' in item)
  const texts = result.rejected ? [] : changedTexts(props.sent, result.body)
  const media = result.rejected ? [] : entries.flatMap((entry) => entry.media ?? [])
  const headerSet = Object.entries(result.headers?.set ?? {})
  const headerRemove = result.headers?.remove ?? []
  const reply = result.reply
  const replyMasked = Boolean(reply) && props.sentReply !== undefined && reply?.text !== props.sentReply
  const duration = steps.reduce((total, step) => total + (step.duration_ms ?? 0), 0)

  // An optional plugin's failure is skipped, so only its step tells of it.
  const failedStep = steps.find((step) => step.error)
  const failure = result.failed ?? (failedStep ? { error: failedStep.error ?? '', instance: failedStep.instance } : null)
  const failedOnReply = failedStep?.stage === 'reply'
  let failedTitle = t('The plugin failed, so the request would be refused')
  if (failedOnReply && props.optional) failedTitle = t('The plugin failed, so the reply goes on without its changes')
  else if (failedOnReply) failedTitle = t('The plugin failed, so the reply would be stopped')
  else if (props.optional) failedTitle = t('The plugin failed, so the request goes on without its changes')

  const bodyChanged = printableBody(props.sent) !== printableBody(result.body)
  const changed =
    bodyChanged || replyMasked || Boolean(reply?.stopped) || headerSet.length > 0 || headerRemove.length > 0 || Boolean(result.reasoning_effort)

  let outcome: ReactNode
  if (result.rejected) {
    outcome = (
      <Alert title={t('This request would be refused')} tone="destructive">
        {t('Refused by {{name}}: {{message}} (code: {{code}})', {
          code: result.rejected.code,
          message: result.rejected.message,
          name: props.instanceName(result.rejected.instance),
        })}
      </Alert>
    )
  } else if (failure) {
    outcome = (
      <Alert title={failedTitle} tone="warning">
        {t('{{name}} failed: {{error}}', { error: failure.error, name: props.instanceName(failure.instance) })}
      </Alert>
    )
  } else if (steps.length === 0) {
    outcome = <Alert tone="info">{t('No instance ran for this request.')}</Alert>
  } else if (!changed) {
    outcome = (
      <Alert tone="info">
        {reply ? t('No changes. The request and the reply go through as they are.') : t('No changes. The request is sent as it is.')}
      </Alert>
    )
  } else {
    outcome = <Alert tone="success">{t('The request passed every instance.')}</Alert>
  }

  const effortTitle = (effort: string | undefined) => {
    if (!effort) return t('Not set')
    const label = REQUEST_PLUGIN_EFFORT_LABELS[effort]
    return label ? t(label) : effort
  }

  return (
    <section aria-label={t('Result')} className="flex flex-col gap-4">
      {outcome}

      {props.showSteps && steps.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table aria-label={t('Steps')} className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                {[t('Instance'), t('Stage'), t('Action'), t('Changes'), t('Findings'), t('Duration')].map((heading) => (
                  <th className="px-3 py-2 font-medium" key={heading} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => {
                let action = step.action
                if (step.action === 'continue') action = t('Passed')
                if (step.action === 'reject') action = t('Refused')
                if (step.action === 'unchecked') action = t('Not checked')
                return (
                  <tr className="border-t border-border align-top" key={`${step.instance}-${step.stage}`}>
                    <td className="max-w-48 px-3 py-2 break-words">
                      {step.name || props.instanceName(step.instance)}
                      <span className="block text-xs text-muted">{props.pluginName(step.plugin)}</span>
                    </td>
                    <td className="px-3 py-2">{t(REQUEST_PLUGIN_STAGE_LABELS[step.stage] ?? step.stage)}</td>
                    <td className="max-w-56 px-3 py-2 break-words">
                      {action}
                      {step.error ? <span className="block text-xs text-destructive">{step.error}</span> : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(step.effects)}</td>
                    <td className="max-w-56 px-3 py-2 break-words">
                      {step.findings?.length
                        ? step.findings
                            .map((finding) => `${finding.rule}${finding.category ? ` (${finding.category})` : ''} × ${formatNumber(finding.count)}`)
                            .join(', ')
                        : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{t('{{value}} ms', { value: formatNumber(step.duration_ms) })}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {texts.map((text) => (
        <BeforeAfter after={text.after} afterLabel={t('Sent upstream')} before={text.before} beforeLabel={t('Original text')} key={text.path} />
      ))}

      {media.length > 0 ? (
        <Section title={t('Images')}>
          <ul className="flex flex-col gap-1 text-sm">
            {media.map((change) => {
              const saved = Math.round((1 - change.to.bytes / change.from.bytes) * 100)
              return (
                <li key={change.index}>
                  {t('Image {{index}}: {{from}} → {{to}}', {
                    from: `${change.from.mime.replace('image/', '').toUpperCase()} ${formatBytes(change.from.bytes)}`,
                    index: change.index + 1,
                    to: `${change.to.mime.replace('image/', '').toUpperCase()} ${formatBytes(change.to.bytes)}`,
                  })}
                  {saved > 0 ? <span className="ml-2 font-semibold text-success tabular-nums">−{saved}%</span> : null}
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      {!result.rejected && result.reasoning_effort ? (
        <p className="text-sm">
          {t('Reasoning effort: {{effort}}', {
            effort: `${effortTitle(result.reasoning_effort_before)} → ${effortTitle(result.reasoning_effort)}`,
          })}
        </p>
      ) : null}

      {headerSet.length > 0 || headerRemove.length > 0 ? (
        <Section title={t('Header changes')}>
          <ul className="flex flex-col gap-1 font-mono text-xs break-all">
            {headerSet.map(([name, value]) => (
              <li key={`set-${name}`}>
                {t('Set')} {name}: {value}
              </li>
            ))}
            {headerRemove.map((name) => (
              <li key={`remove-${name}`}>
                {t('Remove')} {name}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {reply?.stopped ? (
        <Alert title={t('This reply would be stopped')} tone="destructive">
          {reply.stopped.message} <span className="font-mono text-xs">{reply.stopped.code}</span>
        </Alert>
      ) : null}
      {reply && !reply.stopped && replyMasked ? (
        <BeforeAfter after={reply.text} afterLabel={t('Sent to the client')} before={props.sentReply ?? ''} beforeLabel={t('Answer from the model')} />
      ) : null}

      {bodyChanged && !result.rejected ? (
        <Collapsible onOpenChange={setBodyOpen} open={bodyOpen}>
          <Collapsible.Trigger>
            <ChevronDownIcon aria-hidden="true" className={bodyOpen ? 'rotate-180' : undefined} />
            {t('Request body sent upstream')}
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-border bg-surface-high/40 p-3 font-mono text-xs break-all whitespace-pre-wrap">
              {printableBody(result.body)}
            </pre>
          </Collapsible.Panel>
        </Collapsible>
      ) : null}

      <Section title={t('What users see in their logs')}>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">{t('Nothing about this request is shown in user logs.')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {entries.map((entry) => {
              const notes: string[] = []
              const changes = (entry.changes?.length ?? 0) + (entry.more_changes ?? 0)
              if (entry.rejected) notes.push(t('Refused ({{code}})', { code: entry.rejected.code }))
              if (entry.unchecked) notes.push(t('Not checked'))
              if (changes > 0) notes.push(t('{{count}} changes', { count: changes }))
              if (entry.media?.length) notes.push(t('{{count}} images converted', { count: entry.media.length }))
              if (entry.masked) notes.push(t('{{count}} parts of the reply masked', { count: entry.masked }))
              for (const finding of entry.findings ?? []) notes.push(`${finding.category} × ${formatNumber(finding.count)}`)
              if (entry.reasoning_effort) notes.push(t('Reasoning effort: {{effort}}', { effort: effortTitle(entry.reasoning_effort) }))
              const notice = localizedText(entry.notice, i18n.language)
              if (notice !== '') notes.push(notice)
              return (
                <li key={`${entry.plugin}-${entry.stage}`}>
                  <span className="font-medium text-foreground">{localizedText(entry.name, i18n.language) || props.pluginName(entry.plugin)}</span>
                  <span className="text-muted">
                    {' · '}
                    {t(REQUEST_PLUGIN_STAGE_LABELS[entry.stage] ?? entry.stage)}
                    {notes.length > 0 ? ` · ${notes.join(' · ')}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <p className="text-xs text-muted">{t('Took {{ms}} ms', { ms: formatNumber(duration) })}</p>
    </section>
  )
}
