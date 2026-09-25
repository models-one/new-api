import BracesIcon from 'lucide-react/dist/esm/icons/braces'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ActionsCell, DataTable, useDataTable, type DataTableColumns } from '@/components/data'
import { Textarea } from '@/components/form'
import { ConfirmDialog } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import { Tabs } from '@/components/disclosure'
import { byteLength, formatJson } from '@/features/system-settings/site-content/option-json'
import { ListItemDialog } from '@/features/system-settings/site-content/list-editor/ListItemDialog'
import { describeListIssue } from '@/features/system-settings/site-content/list-editor/list-messages'
import {
  appendItem,
  blankFields,
  checkField,
  parseList,
  removeItem,
  replaceItem,
  validateList,
  type ListEditorSpec,
  type ListFields,
  type ListItem,
} from '@/features/system-settings/site-content/list-editor/list-model'

type OptionListEditorProps = {
  spec: ListEditorSpec
  /** The stored JSON string, owned by the section's form. */
  value: string
  onChange: (next: string) => void
  disabled: boolean
  /** Singular noun for the dialogs — "announcement", "API address". */
  itemNoun: string
  /** Accessible name of the table. */
  tableLabel: string
  addLabel: string
  emptyTitle: string
  emptyDescription: string
  /** One sentence under the raw JSON editor saying what it is for. */
  jsonDescription: string
}

/** What the operator is doing right now. `null` means neither dialog is open. */
type Editing =
  | { mode: 'add' }
  | { mode: 'edit'; item: ListItem }

/**
 * THE LIST EDITOR
 * ===============
 * A table with dialog CRUD over one option value that holds a JSON array, plus a raw-JSON
 * tab for everything the table cannot express.
 *
 * The value in play is always the SERIALISED STRING, never a parallel array of rows. Every
 * edit — add, edit, delete, and typing in the JSON tab — produces the next string and
 * hands it to the section form, which holds it as one dirty field and writes it with one
 * `PUT /api/option/`. That is why the two tabs can never disagree: there is nothing for
 * them to disagree about.
 *
 * The raw tab is not a power-user luxury. Four of these five blobs may hold fields this
 * editor does not model, and one bad character makes the whole list unreadable; without a
 * way to see and repair the actual text, an operator whose blob is malformed would have
 * no route back other than the previous console.
 */
export function OptionListEditor(props: OptionListEditorProps) {
  const { t } = useTranslation()
  const { spec, value } = props

  const [editing, setEditing] = useState<Editing | null>(null)
  const [removing, setRemoving] = useState<ListItem | null>(null)
  const [dialogNonce, setDialogNonce] = useState(0)

  const parsed = useMemo(() => parseList(spec, value), [spec, value])
  const items = useMemo(() => (parsed.ok ? parsed.items : []), [parsed])

  const parseIssue = parsed.ok ? undefined : parsed.issue
  const listIssue = parsed.ok ? validateList(spec, items) : undefined

  /**
   * Row-level messages for the dialog. The uniqueness rule needs the whole list, so it is
   * checked here rather than in the dialog: the row being edited is excluded from the
   * comparison so re-saving it unchanged is not a clash with itself.
   */
  const validateRow = (fields: ListFields, excludePosition: number | undefined) => {
    const errors: Record<string, string> = {}

    for (const field of spec.fields) {
      const fault = checkField(field, fields[field.name] ?? '')
      if (fault === 'required') {
        errors[field.name] = t('This is required.')
      } else if (fault === 'too-long') {
        errors[field.name] = t('At most {{bytes}} bytes; this is {{actual}}.', {
          actual: byteLength(fields[field.name] ?? ''),
          bytes: field.maxBytes ?? 0,
        })
      } else if (fault === 'invalid') {
        errors[field.name] = field.checkMessage ?? t('The server does not accept this value.')
      }
    }

    const uniqueField = spec.uniqueField
    if (uniqueField !== undefined && errors[uniqueField] === undefined) {
      const candidate = fields[uniqueField] ?? ''
      const clash = items.some(
        (item) => item.position !== excludePosition && (item.fields[uniqueField] ?? '') === candidate,
      )
      if (clash) errors[uniqueField] = t('Another entry already uses this. It has to be unique.')
    }

    return errors
  }

  const columns = useMemo<DataTableColumns<ListItem>>(() => {
    const fieldColumns = spec.fields
      .filter((field) => field.column !== undefined)
      .map((field) => ({
        accessorFn: (item: ListItem) => item.fields[field.name] ?? '',
        cell: ({ row }: { row: { original: ListItem } }) => {
          const raw = row.original.fields[field.name] ?? ''
          const shown = field.options?.find((option) => option.value === raw)?.label ?? raw
          if (shown === '') return <span className="text-muted">{t('Not set')}</span>
          return (
            <span className={field.column?.mono === true ? 'mono break-all text-xs' : 'break-words'}>
              {shown}
            </span>
          )
        },
        enableSorting: false,
        header: field.column?.header ?? field.label,
        id: field.name,
        meta: { headerClassName: field.column?.className },
      }))

    return [
      ...fieldColumns,
      {
        cell: ({ row }: { row: { original: ListItem } }) => (
          <ActionsCell
            actions={[
              {
                icon: <PencilIcon />,
                id: 'edit',
                label: t('Edit this {{noun}}', { noun: props.itemNoun }),
                onClick: () => {
                  setDialogNonce((nonce) => nonce + 1)
                  setEditing({ item: row.original, mode: 'edit' })
                },
                disabled: props.disabled,
              },
              {
                icon: <Trash2Icon />,
                id: 'remove',
                label: t('Remove this {{noun}}', { noun: props.itemNoun }),
                onClick: () => setRemoving(row.original),
                disabled: props.disabled,
                tone: 'danger' as const,
              },
            ]}
            label={t('Entry actions')}
          />
        ),
        enableSorting: false,
        header: () => <span className="sr-only">{t('Actions')}</span>,
        id: 'actions',
        meta: { align: 'right' as const, headerClassName: 'w-24' },
      },
    ]
  }, [props.disabled, props.itemNoun, spec.fields, t])

  const { table } = useDataTable<ListItem>({
    columns,
    data: items,
    getRowId: (item) => String(item.position),
    manualSorting: false,
  })

  const closeDialog = () => setEditing(null)

  const submitRow = (fields: ListFields) => {
    if (editing === null) return
    props.onChange(
      editing.mode === 'add'
        ? appendItem(spec, items, fields)
        : replaceItem(spec, items, editing.item.position, fields),
    )
    setEditing(null)
  }

  const confirmRemove = () => {
    if (removing === null) return
    props.onChange(removeItem(spec, items, removing.position))
    setRemoving(null)
  }

  const atCapacity = spec.maxItems !== undefined && items.length >= spec.maxItems

  return (
    <div className="flex flex-col gap-4">
      {/*
        Both alerts sit ABOVE the tabs on purpose. A `Tabs.Panel` unmounts while it is
        hidden, so an alert rendered inside the entries panel is invisible to an operator
        working on the JSON tab — and the JSON tab is exactly where a blob that fails
        validation gets edited. Save refuses a blocked write silently, so with the alert
        hidden the button simply appeared to do nothing.
      */}
      {parseIssue !== undefined ? (
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('This list cannot be shown as a table')} tone="destructive">
          {describeListIssue(parseIssue, spec, t)}
        </Alert>
      ) : null}

      {listIssue !== undefined ? (
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('The server would refuse this list')} tone="warning">
          {describeListIssue(listIssue, spec, t)}
        </Alert>
      ) : null}

      <Tabs defaultValue="entries">
        <Tabs.List label={t('{{noun}} editor views', { noun: props.itemNoun })}>
          <Tabs.Tab value="entries">{t('Entries')}</Tabs.Tab>
          <Tabs.Tab value="json">
            <BracesIcon aria-hidden="true" />
            {t('JSON')}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="entries">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted" role="status">
                {t('{{count}} entries', { count: items.length })}
                {spec.maxItems === undefined ? null : t(' · at most {{max}}', { max: spec.maxItems })}
              </p>
              <Button
                disabled={props.disabled || parseIssue !== undefined || atCapacity}
                onClick={() => {
                  setDialogNonce((nonce) => nonce + 1)
                  setEditing({ mode: 'add' })
                }}
                size="sm"
              >
                <PlusIcon aria-hidden="true" />
                {props.addLabel}
              </Button>
            </div>

            <DataTable
              columns={columns}
              emptyDescription={props.emptyDescription}
              emptyTitle={props.emptyTitle}
              label={props.tableLabel}
              minWidthClassName="min-w-[40rem]"
              table={table}
            />
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="json">
          <div className="flex flex-col gap-3">
            <Textarea
              description={props.jsonDescription}
              disabled={props.disabled}
              error={parseIssue === undefined ? undefined : describeListIssue(parseIssue, spec, t)}
              invalid={parseIssue !== undefined}
              label={t('Stored value ({{key}})', { key: spec.optionKey })}
              onChange={(event) => props.onChange(event.target.value)}
              rows={14}
              spellCheck={false}
              textareaClassName="mono text-xs"
              value={value}
            />
            <div>
              <Button
                disabled={props.disabled}
                onClick={() => props.onChange(formatJson(value, spec.emptyValue))}
                size="sm"
                variant="outline"
              >
                {t('Reformat')}
              </Button>
            </div>
          </div>
        </Tabs.Panel>
      </Tabs>

      {editing === null ? null : (
        <ListItemDialog
          description={
            editing.mode === 'add'
              ? t('The entry is added to the list here. Nothing reaches the server until you save the section.')
              : t('The change is applied to the list here. Nothing reaches the server until you save the section.')
          }
          initialFields={editing.mode === 'add' ? blankFields(spec) : editing.item.fields}
          key={dialogNonce}
          onOpenChange={(open) => {
            if (!open) closeDialog()
          }}
          onSubmit={submitRow}
          open
          spec={spec}
          submitLabel={editing.mode === 'add' ? t('Add to the list') : t('Apply the change')}
          title={
            editing.mode === 'add'
              ? t('Add a {{noun}}', { noun: props.itemNoun })
              : t('Edit this {{noun}}', { noun: props.itemNoun })
          }
          validate={(fields) =>
            validateRow(fields, editing.mode === 'edit' ? editing.item.position : undefined)}
        />
      )}

      <ConfirmDialog
        cancelLabel={t('Keep it')}
        confirmLabel={t('Remove it')}
        description={t('The entry is removed from the list. It is written to the server when you save the section, and until then “Discard changes” brings it back.')}
        destructive
        onConfirm={confirmRemove}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        open={removing !== null}
        title={t('Remove this {{noun}}?', { noun: props.itemNoun })}
      />
    </div>
  )
}
