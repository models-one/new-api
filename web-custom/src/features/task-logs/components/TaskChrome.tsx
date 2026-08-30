import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SegmentedControl, ProgressBar, Badge, CopyButton } from '@/components/ui'
import type { TaskScope } from '@/features/task-logs/api'
import { parseProgressPercent } from '@/features/task-logs/task-presentation'
import type { Tone } from '@/components/ui/tone'
import { toUnixSeconds } from '@/lib/format'

/** Windows offered by both task pages, in SECONDS. `all` sends no timestamp at all. */
export type TaskTimeRangeId = 'all' | '24h' | '7d' | '30d'

export const TASK_TIME_RANGE_SECONDS: Readonly<Record<TaskTimeRangeId, number>> = {
  all: 0,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
}

/**
 * Resolves a range to a `start_timestamp` in unix SECONDS, or 0 for "all time".
 * Read once when the range changes so the query key does not move every render.
 */
export function taskRangeStartSeconds(range: TaskTimeRangeId, now = new Date()): number {
  const windowSeconds = TASK_TIME_RANGE_SECONDS[range]
  return windowSeconds === 0 ? 0 : toUnixSeconds(now) - windowSeconds
}

/**
 * The mine/everyone switch. Rendered only for role >= 10 — a normal user has no
 * second scope to choose between, so an always-visible disabled control would be
 * noise rather than information.
 */
export function TaskScopeControl(props: {
  scope: TaskScope
  onChange: (scope: TaskScope) => void
  disabled: boolean
  label: string
}) {
  const { t } = useTranslation()

  return (
    <SegmentedControl<TaskScope>
      label={props.label}
      onChange={props.onChange}
      options={[
        { id: 'mine', label: t('My tasks'), disabled: props.disabled },
        { id: 'all', label: t('All users'), disabled: props.disabled },
      ]}
      size="sm"
      value={props.scope}
    />
  )
}

/**
 * `progress` is upstream free text. A parseable percentage becomes a real bar; a
 * value like "" or "pending" is shown verbatim, because guessing a bar position
 * from an unparseable string would be inventing data.
 */
export function TaskProgressCell(props: { progress: string; label: string; tone?: Tone }) {
  const { t } = useTranslation()
  const percent = parseProgressPercent(props.progress)

  if (percent === undefined) {
    return (
      <span className="mono block text-muted" title={props.progress}>
        {props.progress === '' ? '—' : props.progress}
      </span>
    )
  }

  return (
    <span className="flex min-w-[5.5rem] items-center gap-2">
      <ProgressBar
        className="min-w-[3rem] flex-1"
        label={props.label}
        size="xs"
        tone={props.tone ?? 'primary'}
        value={percent}
        valueText={t('{{percent}} percent complete', { percent })}
      />
      <span className="mono shrink-0 text-xs text-muted">{`${percent}%`}</span>
    </span>
  )
}

/**
 * A URL the API handed us. It is TEXT: never markup, never an `<img>` the browser
 * fetches on its own. The operator sees the address, can copy it, and can open it
 * deliberately in a new tab — `rel="noreferrer"` keeps the console's URL out of the
 * request. `http(s)` only, so a `javascript:` or `data:` value cannot become a link.
 */
export function TaskUrlValue(props: { url: string; copyLabel: string; openLabel: string }) {
  const { t } = useTranslation()
  const isWebUrl = /^https?:\/\//i.test(props.url)

  if (props.url === '') {
    return <span className="mono block text-muted">—</span>
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      {isWebUrl ? (
        <a
          className="mono min-w-0 flex-1 truncate text-primary underline-offset-2 hover:underline"
          href={props.url}
          rel="noreferrer noopener"
          target="_blank"
          title={props.openLabel}
        >
          {props.url}
        </a>
      ) : (
        <span className="mono min-w-0 flex-1 truncate text-muted" title={props.url}>
          {props.url}
        </span>
      )}
      {isWebUrl ? (
        <ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0 text-muted" />
      ) : (
        <Badge size="sm" tone="warning">
          {t('Not a web URL')}
        </Badge>
      )}
      <CopyButton label={props.copyLabel} size="icon-xs" value={props.url} />
    </span>
  )
}

/**
 * Free upstream text — a prompt or a failure message — which may contain angle
 * brackets. It goes through React as a string, so it renders as characters and
 * never as markup.
 */
export function TaskFreeText(props: { value: string; emptyLabel: string }) {
  if (props.value.trim() === '') {
    return <p className="mt-2 text-sm leading-6 text-muted">{props.emptyLabel}</p>
  }
  return (
    <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
      {props.value}
    </p>
  )
}

/** One labelled block inside an expanded row. */
export function TaskDetailSection(props: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{props.title}</p>
      {props.children}
    </div>
  )
}
