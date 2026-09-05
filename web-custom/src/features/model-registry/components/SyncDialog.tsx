import { useMutation, useQuery } from '@tanstack/react-query'
import CheckIcon from 'lucide-react/dist/esm/icons/check'
import CircleSlashIcon from 'lucide-react/dist/esm/icons/circle-slash'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox, NativeSelect, type NativeSelectOption } from '@/components/form'
import { Dialog, toErrorMessage } from '@/components/overlay'
import { Alert, Badge, Button, Skeleton, StatusBadge } from '@/components/ui'
import {
  applySyncUpstream,
  fetchSyncPreview,
  missingModelsQuery,
  registryTotalQuery,
  type SyncConflict,
  type SyncResult,
} from '@/features/model-registry/api'
import {
  buildOverwritePayload,
  buildSyncPlan,
  conflictFieldLabel,
  conflictValueText,
  isCodedConflictValue,
  isSyncLocale,
  nameRuleLabel,
  overwriteKey,
  untouchedCount,
  type SyncLocale,
} from '@/features/model-registry/model-registry-presentation'
import { formatNumber } from '@/lib/format'

type SyncDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplied: () => void
}

type Stage = 'choose' | 'review' | 'confirm' | 'done'

export function SyncDialog(props: SyncDialogProps) {
  const { t } = useTranslation()

  const [locale, setLocale] = useState<SyncLocale>('')
  const [previewLocale, setPreviewLocale] = useState<SyncLocale | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

  useEffect(() => {
    if (props.open) return
    setLocale('')
    setPreviewLocale(null)
    setSelected(new Set())
    setConfirming(false)
    setResult(null)
    setApplyError(null)
  }, [props.open])

  const previewQuery = useQuery({
    queryKey: ['model-registry', 'sync-preview', previewLocale] as const,
    queryFn: () => fetchSyncPreview(previewLocale ?? ''),
    enabled: props.open && previewLocale !== null,
    gcTime: 0,
    staleTime: 0,
  })

  const missingQuery = useQuery({ ...missingModelsQuery(), enabled: props.open })
  const totalQuery = useQuery({ ...registryTotalQuery(), enabled: props.open })

  const preview = previewQuery.data
  const plan = useMemo(
    () => buildSyncPlan(preview?.missing ?? null, preview?.conflicts ?? null, missingQuery.data),
    [missingQuery.data, preview],
  )

  const overwrite = useMemo(
    () => buildOverwritePayload(plan.conflicts, selected),
    [plan.conflicts, selected],
  )
  const selectedFieldCount = overwrite.reduce((sum, entry) => sum + entry.fields.length, 0)

  const applyMutation = useMutation({
    mutationFn: () => applySyncUpstream({ locale: previewLocale ?? '', overwrite }),
    onSuccess: (data) => {
      setResult(data)
      setApplyError(null)
      props.onApplied()
    },
    onError: (error: unknown) => setApplyError(toErrorMessage(error)),
  })

  const stage: Stage = ((): Stage => {
    if (result !== null) return 'done'
    if (previewLocale === null) return 'choose'
    return confirming ? 'confirm' : 'review'
  })()

  const localeOptions: NativeSelectOption[] = [
    { label: t('Upstream default'), value: '' },
    { label: t('English'), value: 'en' },
    { label: t('Japanese'), value: 'ja' },
  ]

  const toggleField = (modelName: string, field: string, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous)
      const key = overwriteKey(modelName, field)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleModel = (conflict: SyncConflict, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous)
      for (const entry of conflict.fields) {
        const key = overwriteKey(conflict.model_name, entry.field)
        if (checked) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  const nothingToDo = plan.create.length === 0 && selectedFieldCount === 0

  const body = ((): ReactNode => {
    if (stage === 'done' && result !== null) return <SyncOutcome result={result} />

    if (stage === 'choose') {
      return (
        <div className="flex flex-col gap-5">
          <p className="text-sm leading-6 text-muted">
            {t('The gateway keeps its model metadata in a public repository. Reading it is a separate call from writing it, so nothing is changed until the diff below has been reviewed and applied.')}
          </p>
          <NativeSelect
            className="max-w-sm"
            description={t('Only these three change the files that are read. The server lower-cases the value before matching it, so its two Chinese options can never match and fall back to the default — the address actually used is shown with every preview.')}
            label={t('Metadata language')}
            onChange={(event) => {
              const next = event.target.value
              if (isSyncLocale(next)) setLocale(next)
            }}
            options={localeOptions}
            value={locale}
          />
          {missingQuery.isError ? (
            <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
              {t('The list of undefined models could not be read, so the preview cannot say which of them upstream has no definition for.')}
            </Alert>
          ) : null}
        </div>
      )
    }

    if (previewQuery.isLoading) {
      return (
        <div aria-busy="true" className="flex flex-col gap-3" role="status">
          <span className="sr-only">{t('Reading the upstream metadata')}</span>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )
    }

    if (previewQuery.isError) {
      return (
        <Alert
          action={
            <Button
              aria-busy={previewQuery.isFetching}
              disabled={previewQuery.isFetching}
              onClick={() => void previewQuery.refetch()}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('The upstream metadata could not be read')}
          tone="destructive"
        >
          {toErrorMessage(previewQuery.error)}
        </Alert>
      )
    }

    if (preview === undefined) return null

    if (stage === 'confirm') {
      return (
        <div className="flex flex-col gap-5">
          <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('This writes to the registry')} tone="warning">
            {t('Confirm the diff you reviewed. Nothing outside this summary is touched.')}
          </Alert>

          {applyError === null ? null : (
            <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('The sync failed')} tone="destructive">
              {applyError}
            </Alert>
          )}

          <ConfirmLine
            count={plan.create.length}
            label={t('definitions created')}
            names={plan.create}
            tone="success"
          />
          <ConfirmLine
            count={selectedFieldCount}
            label={t('fields overwritten on existing definitions')}
            names={overwrite.map((entry) => `${entry.model_name} · ${entry.fields.join(', ')}`)}
            tone="warning"
          />
          <ConfirmLine
            count={plan.skip.length}
            label={t('undefined models left undefined, because upstream has none')}
            names={plan.skip}
            tone="muted"
          />

          <p className="text-xs leading-5 text-muted">
            {t('Read from {{url}}', { url: preview.source.models_url })}
          </p>
        </div>
      )
    }

    const untouched = untouchedCount(totalQuery.data, plan.conflicts.length)

    return (
      <div className="flex flex-col gap-6">
        <div className="panel px-4 py-3">
          <p className="eyebrow">{t('Source')}</p>
          <p className="mono mt-1 break-all text-xs text-foreground">{preview.source.models_url}</p>
          <p className="mono mt-1 break-all text-xs text-muted">{preview.source.vendors_url}</p>
        </div>

        <DiffSection
          count={plan.create.length}
          emptyText={t('Every model your channels serve already has a definition.')}
          icon={<PlusIcon aria-hidden="true" className="size-4" />}
          note={t('Applying creates all of them. The sync endpoint takes no list of which to create, so this part is all-or-nothing.')}
          title={t('Added')}
          tone="success"
        >
          <NameList names={plan.create} />
        </DiffSection>

        <DiffSection
          count={plan.conflicts.length}
          emptyText={t('No existing definition differs from upstream.')}
          icon={<RefreshCwIcon aria-hidden="true" className="size-4" />}
          note={t('Nothing here changes unless you tick it. Definitions with the official upstream turned off never appear.')}
          title={t('Changed')}
          tone="warning"
        >
          <ul className="flex flex-col gap-3">
            {plan.conflicts.map((conflict) => {
              const allChecked = conflict.fields.every((entry) =>
                selected.has(overwriteKey(conflict.model_name, entry.field)))
              return (
                <li className="panel px-4 py-3" key={conflict.model_name}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="mono text-sm font-semibold text-foreground">
                      {conflict.model_name}
                    </span>
                    <Checkbox
                      ariaLabel={t('Overwrite every field of {{name}}', { name: conflict.model_name })}
                      checked={allChecked}
                      label={t('Select all')}
                      onCheckedChange={(checked) => toggleModel(conflict, checked)}
                    />
                  </div>
                  <ul className="mt-3 flex flex-col gap-3">
                    {conflict.fields.map((entry) => (
                      <li className="flex items-start gap-3" key={entry.field}>
                        <Checkbox
                          ariaLabel={t('Overwrite {{field}} of {{name}}', {
                            field: t(conflictFieldLabel(entry.field) || entry.field),
                            name: conflict.model_name,
                          })}
                          checked={selected.has(overwriteKey(conflict.model_name, entry.field))}
                          hideLabel
                          label={t('Overwrite {{field}} of {{name}}', {
                            field: t(conflictFieldLabel(entry.field) || entry.field),
                            name: conflict.model_name,
                          })}
                          onCheckedChange={(checked) => toggleField(conflict.model_name, entry.field, checked)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="eyebrow">
                            {t(conflictFieldLabel(entry.field) || entry.field)}
                          </p>
                          <div className="mt-1 grid gap-1 sm:grid-cols-2">
                            <ValueBox
                              caption={t('In the registry')}
                              field={entry.field}
                              value={entry.local}
                            />
                            <ValueBox
                              caption={t('Upstream')}
                              field={entry.field}
                              value={entry.upstream}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        </DiffSection>

        <DiffSection
          count={plan.skip.length}
          emptyText={t('Upstream defines every model that is missing one.')}
          icon={<CircleSlashIcon aria-hidden="true" className="size-4" />}
          note={t('Worked out in the browser: the models with no definition, minus the ones this preview offers to create. The sync reports the same set back as skipped.')}
          title={t('Skipped')}
          tone="muted"
        >
          <NameList names={plan.skip} />
        </DiffSection>

        <div className="panel px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckIcon aria-hidden="true" className="size-4" />
            {t('Left alone')}
            <Badge className="mono" size="sm" tone="muted">
              {totalQuery.data === undefined ? '—' : formatNumber(untouched)}
            </Badge>
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {totalQuery.data === undefined
              ? t('The registry total could not be read, so this count is unavailable.')
              : t('Worked out in the browser: REGISTRY_TOTAL ({{total}}) − definitions that differ ({{changed}}). It counts rows that already match upstream, rows upstream does not publish, and rows with the official upstream turned off.', {
                changed: formatNumber(plan.conflicts.length),
                total: formatNumber(totalQuery.data),
              })}
          </p>
        </div>
      </div>
    )
  })()

  const footer = ((): ReactNode => {
    if (stage === 'done') {
      return (
        <Button onClick={() => props.onOpenChange(false)} variant="primary">
          {t('Close')}
        </Button>
      )
    }

    if (stage === 'choose') {
      return (
        <>
          <Button onClick={() => props.onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => {
              setSelected(new Set())
              setPreviewLocale(locale)
            }}
            variant="primary"
          >
            {t('Preview changes')}
          </Button>
        </>
      )
    }

    if (stage === 'confirm') {
      return (
        <>
          <Button
            disabled={applyMutation.isPending}
            onClick={() => setConfirming(false)}
            variant="quiet"
          >
            {t('Back to the diff')}
          </Button>
          <Button
            aria-busy={applyMutation.isPending}
            disabled={applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
            variant="primary"
          >
            {t('Apply these changes')}
          </Button>
        </>
      )
    }

    return (
      <>
        <Button
          onClick={() => {
            setSelected(new Set())
            setPreviewLocale(null)
          }}
          variant="quiet"
        >
          {t('Back')}
        </Button>
        <Button
          disabled={previewQuery.data === undefined || nothingToDo}
          onClick={() => setConfirming(true)}
          title={nothingToDo ? t('There is nothing to create and no field is ticked.') : undefined}
          variant="primary"
        >
          {t('Review and apply')}
        </Button>
      </>
    )
  })()

  return (
    <Dialog
      description={
        stage === 'done'
          ? t('What the sync actually wrote.')
          : t('Preview first, apply second. The preview reads the upstream files and changes nothing.')
      }
      footer={footer}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="lg"
      title={t('Sync from upstream')}
    >
      {body}
    </Dialog>
  )
}

type DiffSectionProps = {
  title: string
  count: number
  tone: 'success' | 'warning' | 'muted'
  icon: ReactNode
  note: string
  emptyText: string
  children: ReactNode
}

function DiffSection(props: DiffSectionProps) {
  return (
    <section aria-label={props.title} className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {props.icon}
        {props.title}
        <Badge className="mono" size="sm" tone={props.tone}>{formatNumber(props.count)}</Badge>
      </h3>
      <p className="text-xs leading-5 text-muted">{props.note}</p>
      {props.count === 0 ? (
        <p className="text-xs leading-5 text-muted">{props.emptyText}</p>
      ) : (
        props.children
      )}
    </section>
  )
}

function NameList(props: { names: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {props.names.map((name) => (
        <li key={name}>
          <Badge className="mono" size="sm" tone="muted">{name}</Badge>
        </li>
      ))}
    </ul>
  )
}

/**
 * One side of a conflict. `name_rule` and `status` arrive as raw integers, so they are
 * translated rather than printed; an empty string is shown as an explicit "empty".
 */
function ValueBox(props: { caption: string; field: string; value: unknown }) {
  const { t } = useTranslation()

  const text = ((): string => {
    if (isCodedConflictValue(props.field, props.value)) {
      if (props.field === 'name_rule') {
        const label = nameRuleLabel(props.value)
        return label === '' ? String(props.value) : t(label)
      }
      return props.value === 1 ? t('Enabled') : t('Disabled')
    }
    return conflictValueText(props.field, props.value)
  })()

  return (
    <div className="rounded-[4px] border border-border px-2 py-1.5">
      <p className="eyebrow">{props.caption}</p>
      <p className="mono mt-0.5 break-words text-xs text-foreground">
        {text === '' ? <span className="text-muted">{t('empty')}</span> : text}
      </p>
    </div>
  )
}

function ConfirmLine(props: {
  count: number
  label: string
  names: string[]
  tone: 'success' | 'warning' | 'muted'
}) {
  return (
    <div className="panel px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-foreground">
        <Badge className="mono" size="sm" tone={props.tone}>{formatNumber(props.count)}</Badge>
        {props.label}
      </p>
      {props.names.length === 0 ? null : (
        <ul className="mt-2 flex flex-col gap-1">
          {props.names.map((name) => (
            <li className="mono break-words text-xs text-muted" key={name}>{name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SyncOutcome(props: { result: SyncResult }) {
  const { t } = useTranslation()
  const { result } = props

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={result.created_models > 0 ? 'success' : 'muted'}>
          {t('{{count}} created', { count: result.created_models })}
        </StatusBadge>
        <StatusBadge tone={result.updated_models > 0 ? 'warning' : 'muted'}>
          {t('{{count}} updated', { count: result.updated_models })}
        </StatusBadge>
        <StatusBadge tone={result.created_vendors > 0 ? 'info' : 'muted'}>
          {t('{{count}} vendors created', { count: result.created_vendors })}
        </StatusBadge>
        <StatusBadge tone="muted">
          {t('{{count}} skipped', { count: result.skipped_models.length })}
        </StatusBadge>
      </div>

      {result.created_list.length === 0 ? null : (
        <section aria-label={t('Created')} className="flex flex-col gap-2">
          <h3 className="eyebrow">{t('Created')}</h3>
          <NameList names={result.created_list} />
        </section>
      )}

      {result.updated_list.length === 0 ? null : (
        <section aria-label={t('Updated')} className="flex flex-col gap-2">
          <h3 className="eyebrow">{t('Updated')}</h3>
          <NameList names={result.updated_list} />
        </section>
      )}

      {result.skipped_models.length === 0 ? null : (
        <section aria-label={t('Skipped')} className="flex flex-col gap-2">
          <h3 className="eyebrow">{t('Skipped')}</h3>
          <NameList names={result.skipped_models} />
        </section>
      )}

      {result.created_models === 0 ? null : (
        <Alert tone="info">
          {t('A definition the sync creates is stored with the official upstream turned off, so a later sync will not offer to update it. Turn it back on in the editor to follow upstream again.')}
        </Alert>
      )}
    </div>
  )
}
