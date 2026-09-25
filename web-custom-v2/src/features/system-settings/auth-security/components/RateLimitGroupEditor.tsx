import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ActionsCell, DataTable, useDataTable, type DataTableColumns, type DataTableRowAction } from '@/components/data'
import { Input, NumberInput, Textarea } from '@/components/form'
import { Dialog } from '@/components/overlay'
import { Alert, Button, SegmentedControl } from '@/components/ui'
import {
  MAX_RATE_LIMIT_VALUE,
  parseRateLimitGroups,
  removeRateLimitEntry,
  serializeRateLimitGroups,
  upsertRateLimitEntry,
  validateRateLimitEntry,
  type RateLimitEntryErrorCode,
  type RateLimitGroupEntry,
} from '@/features/system-settings/auth-security/rate-limit-groups'

type RateLimitGroupEditorProps = {
  /** The raw `ModelRequestRateLimitGroup` string from the section's draft. */
  value: string
  /** Called with the next raw string. The section owns dirty tracking and saving. */
  onChange: (next: string) => void
  disabled: boolean
  /** The section's validation message for this key, if any. */
  error?: string
}

type EditorMode = 'table' | 'json'

type EntryDraftState = {
  /** The name this row had before the edit; absent when adding. */
  originalGroup?: string
  group: string
  total: string
  success: string
}

const EMPTY_DRAFT: EntryDraftState = { group: '', success: '1000', total: '0' }

/** One shared empty list, so an unsupported value does not change identity every render. */
const NO_ENTRIES: RateLimitGroupEntry[] = []

/**
 * The per-group override editor for `ModelRequestRateLimitGroup`.
 *
 * The legacy console offered a table with an add/edit dialog and a raw JSON box behind a
 * toggle, and defaulted to the table. This is the same two-mode arrangement with two
 * behaviour fixes:
 *
 * 1. THE TABLE NEVER SILENTLY DROPS A ROW. The legacy visual editor filtered entries it
 *    could not represent out of its list and then wrote the filtered list back, so opening
 *    the section and saving anything erased them. Here a value the table cannot represent
 *    exactly forces JSON mode and says why, and the table option stays disabled until the
 *    value parses.
 *
 * 2. AN EMPTY BOX IS NOT AN EMPTY STRING. `json.Unmarshal("")` fails server-side, so
 *    clearing the JSON box and saving used to come back as "unexpected end of JSON input"
 *    (verified live). Rows are serialised to `{}` when there are none.
 *
 * Removing a row edits the section's DRAFT and nothing else — the change is not written
 * until Save, and Discard puts it back — so it does not go through a ConfirmDialog. The
 * confirmation for this data is the section's own Save button.
 */
export function RateLimitGroupEditor(props: RateLimitGroupEditorProps) {
  const { t } = useTranslation()

  const parsed = useMemo(() => parseRateLimitGroups(props.value), [props.value])
  const tableUnavailable = parsed.kind === 'unsupported'

  const [mode, setMode] = useState<EditorMode>('table')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<EntryDraftState>(EMPTY_DRAFT)
  const [showErrors, setShowErrors] = useState(false)

  // A value the table cannot represent must never be edited through the table, so the
  // mode follows the value rather than the operator's last click.
  useEffect(() => {
    if (tableUnavailable) setMode('json')
  }, [tableUnavailable])

  const entries = useMemo(
    () => (parsed.kind === 'entries' ? parsed.entries : NO_ENTRIES),
    [parsed],
  )

  /**
   * The section rebuilds its `onChange` every render, so the row actions read the latest
   * one through a ref. That keeps `commitEntries` — and with it the column definitions —
   * stable, instead of rebuilding the table on every keystroke elsewhere in the section.
   */
  const onChange = props.onChange
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const commitEntries = useCallback((next: RateLimitGroupEntry[]) => {
    onChangeRef.current(serializeRateLimitGroups(next))
  }, [])

  const openAdd = () => {
    setDraft(EMPTY_DRAFT)
    setShowErrors(false)
    setDialogOpen(true)
  }

  const openEdit = useCallback((entry: RateLimitGroupEntry) => {
    setDraft({
      group: entry.group,
      originalGroup: entry.group,
      success: String(entry.success),
      total: String(entry.total),
    })
    setShowErrors(false)
    setDialogOpen(true)
  }, [])

  const numericDraft = {
    group: draft.group,
    success: draft.success.trim() === '' ? Number.NaN : Number(draft.success),
    total: draft.total.trim() === '' ? Number.NaN : Number(draft.total),
  }

  const otherGroups = entries
    .map((entry) => entry.group)
    .filter((group) => group !== draft.originalGroup)

  const entryErrors = validateRateLimitEntry(numericDraft, otherGroups)

  const entryMessages: Record<RateLimitEntryErrorCode, string> = {
    'group-duplicate': t('There is already a limit for this group.'),
    'group-required': t('Enter the group name.'),
    'success-range': t('Enter a whole number between 1 and 2147483647.'),
    'total-range': t('Enter a whole number between 0 and 2147483647.'),
  }

  const errorFor = (field: 'group' | 'total' | 'success'): string | undefined => {
    if (!showErrors) return undefined
    const code = entryErrors[field]
    return code === undefined ? undefined : entryMessages[code]
  }

  const submitEntry = () => {
    setShowErrors(true)
    if (Object.keys(entryErrors).length > 0) return

    commitEntries(
      upsertRateLimitEntry(
        entries,
        { group: draft.group.trim(), success: numericDraft.success, total: numericDraft.total },
        draft.originalGroup,
      ),
    )
    setDialogOpen(false)
  }

  const columns = useMemo<DataTableColumns<RateLimitGroupEntry>>(
    () => [
      {
        accessorKey: 'group',
        cell: ({ row }) => <span className="mono text-sm text-foreground">{row.original.group}</span>,
        header: t('Group'),
      },
      {
        accessorKey: 'total',
        cell: ({ row }) => (
          <span className="mono text-sm text-foreground">
            {row.original.total === 0 ? t('Not counted') : row.original.total}
          </span>
        ),
        header: t('Total requests per window'),
      },
      {
        accessorKey: 'success',
        cell: ({ row }) => <span className="mono text-sm text-foreground">{row.original.success}</span>,
        header: t('Successful requests per window'),
      },
      {
        cell: ({ row }) => {
          const actions: DataTableRowAction[] = [
            {
              disabled: props.disabled,
              icon: <PencilIcon aria-hidden="true" />,
              id: 'edit',
              label: t('Edit the limit for {{group}}', { group: row.original.group }),
              onClick: () => openEdit(row.original),
            },
            {
              disabled: props.disabled,
              icon: <Trash2Icon aria-hidden="true" />,
              id: 'remove',
              label: t('Remove the limit for {{group}}', { group: row.original.group }),
              onClick: () => commitEntries(removeRateLimitEntry(entries, row.original.group)),
              tone: 'danger',
            },
          ]
          return (
            <ActionsCell
              actions={actions}
              label={t('Actions for {{group}}', { group: row.original.group })}
            />
          )
        },
        id: 'actions',
        meta: { align: 'right' },
      },
    ],
    // Every dependency here is stable across an unrelated re-render: `entries` follows the
    // parsed value, and both callbacks are pinned.
    [commitEntries, entries, openEdit, props.disabled, t],
  )

  const { table } = useDataTable({
    columns,
    data: entries,
    getRowId: (row) => row.group,
    manualSorting: false,
  })

  const unsupportedSentence = ((): string => {
    if (parsed.kind !== 'unsupported') return ''
    if (parsed.reason === 'invalid-json') return t('This is not valid JSON, so it cannot be shown as a table. Fix it here, or replace it with {} to clear every override.')
    if (parsed.reason === 'not-an-object') return t('The stored value is not a JSON object keyed by group name, so it cannot be shown as a table.')
    return t('At least one entry is not a pair of whole numbers, so it cannot be shown as a table. Editing it here keeps every entry; the table would not.')
  })()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t('Per-group overrides')}</p>
          <p className="text-xs leading-5 text-muted">
            {t('A group listed here replaces both numbers above for its members, in the same window.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            label={t('Override editor mode')}
            onChange={setMode}
            options={[
              { disabled: tableUnavailable, id: 'table', label: t('Table') },
              { id: 'json', label: t('JSON') },
            ]}
            size="sm"
            value={mode}
          />
          {mode === 'table' ? (
            <Button disabled={props.disabled} onClick={openAdd} size="sm" variant="outline">
              <PlusIcon aria-hidden="true" />
              {t('Add a group')}
            </Button>
          ) : null}
        </div>
      </div>

      {tableUnavailable ? (
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} live="status" title={t('This value can only be edited as JSON')} tone="warning">
          {unsupportedSentence}
        </Alert>
      ) : null}

      {mode === 'table' ? (
        <DataTable
          columns={columns}
          emptyDescription={t('Every account is held to the two numbers above. Add a group to give its members a different allowance.')}
          emptyTitle={t('No per-group overrides')}
          label={t('Per-group rate limits')}
          minWidthClassName="min-w-[520px]"
          table={table}
        />
      ) : (
        <Textarea
          description={t('A JSON object of group name to [total requests, successful requests] — for example {"vip": [0, 5000]}. Leave it as {} for none.')}
          disabled={props.disabled}
          error={props.error}
          invalid={props.error !== undefined}
          label={t('Per-group overrides (JSON)')}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={'{"vip": [0, 5000]}'}
          rows={6}
          value={props.value}
        />
      )}

      {mode === 'table' && props.error !== undefined ? (
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} live="status" title={t('This value will not be accepted')} tone="destructive">
          {props.error}
        </Alert>
      ) : null}

      <Dialog
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button onClick={() => setDialogOpen(false)} variant="outline">
              {t('Cancel')}
            </Button>
            <Button onClick={submitEntry}>{t('Apply')}</Button>
          </div>
        }
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        size="sm"
        title={draft.originalGroup === undefined ? t('Add a group limit') : t('Edit a group limit')}
      >
        <div className="flex flex-col gap-4">
          <Input
            description={t('The group name exactly as it appears on a user, for example vip.')}
            error={errorFor('group')}
            invalid={errorFor('group') !== undefined}
            label={t('Group')}
            onChange={(event) => setDraft((previous) => ({ ...previous, group: event.target.value }))}
            value={draft.group}
          />
          <NumberInput
            description={t('Every request including the ones that failed. 0 turns this second limit off for the group.')}
            error={errorFor('total')}
            invalid={errorFor('total') !== undefined}
            label={t('Total requests per window')}
            max={MAX_RATE_LIMIT_VALUE}
            min={0}
            onChange={(event) => setDraft((previous) => ({ ...previous, total: event.target.value }))}
            step={1}
            value={draft.total}
          />
          <NumberInput
            description={t('Requests that returned a result. Always enforced — 0 is not accepted.')}
            error={errorFor('success')}
            invalid={errorFor('success') !== undefined}
            label={t('Successful requests per window')}
            max={MAX_RATE_LIMIT_VALUE}
            min={1}
            onChange={(event) => setDraft((previous) => ({ ...previous, success: event.target.value }))}
            step={1}
            value={draft.success}
          />
        </div>
      </Dialog>
    </div>
  )
}
