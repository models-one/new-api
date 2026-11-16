import type { CSSProperties } from 'react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down'
import ArrowUpIcon from 'lucide-react/dist/esm/icons/arrow-up'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import XIcon from 'lucide-react/dist/esm/icons/x'

import { Input } from '@/components/form'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

import {
  newRequestPluginConfigRow,
  requestPluginConfigDefaults,
  requestPluginFieldKind,
  requestPluginFieldVisible,
  requestPluginModelValueShape,
  requestPluginRowsAsTable,
  toRequestPluginConfigDraft,
  type RequestPluginConfigDraft,
  type RequestPluginConfigRow,
  type RequestPluginFieldError,
} from '../lib/request-plugins'
import { localizedText } from '../presentation'
import type { RequestPluginConfigField as ConfigField, RequestPluginConfigSchema } from '../types'
import { PluginConfigField, PluginConfigFieldHint } from './PluginConfigField'

type PluginConfigFormProps = {
  /** Prefixes the control ids, so two forms on a page do not collide. */
  idPrefix?: string
  schema?: RequestPluginConfigSchema
  draft: RequestPluginConfigDraft
  /** Every problem in the draft, keyed as fromRequestPluginConfigDraft does. */
  errors: Record<string, RequestPluginFieldError>
  /** Before a save is tried, only fields already edited show their problem. */
  showAllErrors?: boolean
  disabled?: boolean
  /** The models a value-per-model field offers. */
  models?: string[]
  onChange: (draft: RequestPluginConfigDraft) => void
}

/**
 * A form generated from a plugin's config schema: a request processing instance's
 * `configSchema` or a channel's `channelConfig`.
 */
export function PluginConfigForm(props: PluginConfigFormProps) {
  const { t } = useTranslation()
  const generatedId = useId()
  const idPrefix = props.idPrefix ?? generatedId
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const properties = props.schema?.properties ?? {}
  const entries = Object.entries(properties)
  if (entries.length === 0) return <p className="text-sm text-muted">{t('This plugin has no settings.')}</p>

  const required = new Set(props.schema?.required ?? [])
  const errorFor = (path: string) => (props.showAllErrors || touched.has(path) ? props.errors[path] : undefined)
  const update = (name: string, value: unknown, path = name) => {
    setTouched((current) => new Set(current).add(path))
    props.onChange({ ...props.draft, [name]: value })
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {entries.map(([name, field]) => {
        // A hidden field keeps its value for when it shows again.
        if (!requestPluginFieldVisible(field, properties, props.draft)) return null
        const id = `${idPrefix}-${name}`
        const kind = requestPluginFieldKind(field)
        const rows = (props.draft[name] as RequestPluginConfigRow[] | undefined) ?? []
        let control
        if (kind === 'modelValues') {
          control = (
            <PluginConfigModelValues
              disabled={props.disabled}
              errorFor={errorFor}
              field={field}
              id={id}
              models={props.models}
              name={name}
              onChange={(next, path) => update(name, next, path)}
              rows={rows}
            />
          )
        } else if (kind === 'rows') {
          control = (
            <PluginConfigRows
              disabled={props.disabled}
              errorFor={errorFor}
              field={field}
              id={id}
              name={name}
              onChange={(next, path) => update(name, next, path)}
              rows={rows}
            />
          )
        } else {
          control = (
            <PluginConfigField
              disabled={props.disabled}
              error={errorFor(name)}
              field={field}
              id={id}
              name={name}
              onChange={(value) => update(name, value)}
              required={required.has(name)}
              value={props.draft[name]}
            />
          )
        }
        return (
          <div className="px-4 py-3.5" key={name}>
            {control}
          </div>
        )
      })}
    </div>
  )
}

type ListEditorProps = {
  id: string
  name: string
  field: ConfigField
  rows: RequestPluginConfigRow[]
  disabled?: boolean
  errorFor: (path: string) => RequestPluginFieldError | undefined
  /** `path` names the row field that changed, when one did. */
  onChange: (rows: RequestPluginConfigRow[], path?: string) => void
}

function ListHeading(props: { title: string; description: string }) {
  return (
    <legend className="mb-3 flex flex-col gap-0.5">
      <span className="text-sm font-medium text-foreground">{props.title}</span>
      {props.description === '' ? null : <span className="text-xs text-muted">{props.description}</span>}
    </legend>
  )
}

/** How wide a table column is: patterns and long text take the room left. */
function columnWidth(field: ConfigField) {
  const kind = requestPluginFieldKind(field)
  if (kind === 'boolean') return 'auto'
  if (kind === 'enum') return '8.5rem'
  if (kind === 'number') return '6.5rem'
  if (field.format === 'regex' || field.maxLength === undefined || field.maxLength > 64) return 'minmax(8rem, 2fr)'
  return 'minmax(6rem, 1fr)'
}

/**
 * A list of objects, such as rules. Items with a few short fields are edited one line
 * each under column titles; larger items get a small card each.
 */
function PluginConfigRows(props: ListEditorProps) {
  const { i18n, t } = useTranslation()
  const title = localizedText(props.field.title, i18n.language) || props.name
  const items = props.field.items
  const itemTitle = localizedText(items?.title, i18n.language) || title
  const fields = Object.entries(items?.properties ?? {})
  const properties = items?.properties ?? {}
  const required = new Set(items?.required ?? [])
  const table = requestPluginRowsAsTable(items)
  const full = props.field.maxItems !== undefined && props.rows.length >= props.field.maxItems
  // Columns line up across the title row and every item row.
  const gridStyle: CSSProperties | undefined = table
    ? { gridTemplateColumns: `${fields.map(([, field]) => columnWidth(field)).join(' ')} auto` }
    : undefined

  function move(index: number, offset: number) {
    const next = [...props.rows]
    const [row] = next.splice(index, 1)
    next.splice(index + offset, 0, row)
    props.onChange(next)
  }

  function renderField(row: RequestPluginConfigRow, fieldName: string, field: ConfigField) {
    const path = `${props.name}.${row.key}.${fieldName}`
    // A cell keeps its column even while its field is hidden.
    if (!requestPluginFieldVisible(field, properties, row.values)) return table ? <div key={fieldName} /> : null
    return (
      <PluginConfigField
        disabled={props.disabled}
        error={props.errorFor(path)}
        field={field}
        id={`${props.id}-${row.key}-${fieldName}`}
        key={fieldName}
        layout={table ? 'cell' : 'compact'}
        name={fieldName}
        onChange={(value) =>
          props.onChange(
            props.rows.map((item) => (item.key === row.key ? { ...item, values: { ...item.values, [fieldName]: value } } : item)),
            path,
          )
        }
        required={required.has(fieldName)}
        value={row.values[fieldName]}
      />
    )
  }

  function rowActions(row: RequestPluginConfigRow, index: number) {
    const rowName = `${itemTitle} ${index + 1}`
    return (
      <div className="flex items-center">
        <Button
          aria-label={t('Move {{name}} up', { name: rowName })}
          disabled={props.disabled || index === 0}
          onClick={() => move(index, -1)}
          size="icon-sm"
          variant="quiet"
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
        <Button
          aria-label={t('Move {{name}} down', { name: rowName })}
          disabled={props.disabled || index === props.rows.length - 1}
          onClick={() => move(index, 1)}
          size="icon-sm"
          variant="quiet"
        >
          <ArrowDownIcon aria-hidden="true" />
        </Button>
        <Button
          aria-label={t('Delete {{name}}', { name: rowName })}
          disabled={props.disabled}
          onClick={() => props.onChange(props.rows.filter((item) => item.key !== row.key))}
          size="icon-sm"
          variant="quiet"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    )
  }

  return (
    <fieldset className="min-w-0">
      <ListHeading description={localizedText(props.field.description, i18n.language)} title={title} />
      {props.rows.length === 0 ? <p className="text-sm text-muted">{t('None added yet')}</p> : null}
      {table && props.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-max items-start gap-2 sm:min-w-0" style={gridStyle}>
            {fields.map(([fieldName, field]) => (
              <div aria-hidden="true" className="flex items-center gap-1 text-xs whitespace-nowrap text-muted" key={fieldName}>
                <span>{localizedText(field.title, i18n.language) || fieldName}</span>
                {required.has(fieldName) ? <span className="text-destructive">*</span> : null}
                <PluginConfigFieldHint text={localizedText(field.description, i18n.language)} />
              </div>
            ))}
            <div />
            {props.rows.map((row, index) => (
              <div aria-label={`${itemTitle} ${index + 1}`} className="contents" key={row.key} role="group">
                {fields.map(([fieldName, field]) => renderField(row, fieldName, field))}
                {rowActions(row, index)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {!table && props.rows.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {props.rows.map((row, index) => (
            <li aria-label={`${itemTitle} ${index + 1}`} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-high/40 p-3" key={row.key}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">{`${itemTitle} ${index + 1}`}</span>
                {rowActions(row, index)}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {fields.map(([fieldName, field]) => {
                  if (!requestPluginFieldVisible(field, properties, row.values)) return null
                  const kind = requestPluginFieldKind(field)
                  const wide =
                    kind === 'textarea' ||
                    kind === 'lines' ||
                    kind === 'json' ||
                    kind === 'enumList' ||
                    (kind === 'text' &&
                      (field.format === 'regex' || field.format === 'url' || field.maxLength === undefined || field.maxLength > 64))
                  return (
                    <div className={cn('min-w-0', wide && 'sm:col-span-3')} key={fieldName}>
                      {renderField(row, fieldName, field)}
                    </div>
                  )
                })}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <Button
        className="mt-2"
        disabled={props.disabled || full}
        onClick={() =>
          props.onChange([...props.rows, newRequestPluginConfigRow(toRequestPluginConfigDraft(items, requestPluginConfigDefaults(items)))])
        }
        size="sm"
        variant="quiet"
      >
        <PlusIcon aria-hidden="true" />
        {t('Add {{name}}', { name: itemTitle })}
      </Button>
    </fieldset>
  )
}

/** A value per model, edited one line per model. Other model names can be typed. */
function PluginConfigModelValues(props: ListEditorProps & { models?: string[] }) {
  const { i18n, t } = useTranslation()
  const title = localizedText(props.field.title, i18n.language) || props.name
  const valueField = props.field.additionalProperties
  const valueTitle = localizedText(valueField?.title, i18n.language) || t('Value')
  const listId = `${props.id}-models`

  function update(row: RequestPluginConfigRow, name: string, value: unknown) {
    props.onChange(
      props.rows.map((item) => (item.key === row.key ? { ...item, values: { ...item.values, [name]: value } } : item)),
      `${props.name}.${row.key}.${name}`,
    )
  }

  return (
    <fieldset className="min-w-0">
      <ListHeading description={localizedText(props.field.description, i18n.language)} title={title} />
      {props.rows.length === 0 ? <p className="text-sm text-muted">{t('None added yet')}</p> : null}
      <datalist id={listId}>
        {[...new Set(props.models ?? [])].map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      {valueField && props.rows.length > 0 ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2">
          <div aria-hidden="true" className="text-xs text-muted">
            {t('Model')}
          </div>
          <div aria-hidden="true" className="flex items-center gap-1 text-xs text-muted">
            <span>{valueTitle}</span>
            <PluginConfigFieldHint text={localizedText(valueField.description, i18n.language)} />
          </div>
          <div />
          {props.rows.map((row, index) => {
            const rowName = `${title} ${index + 1}`
            const modelError = props.errorFor(`${props.name}.${row.key}.model`)
            return (
              <div aria-label={rowName} className="contents" key={row.key} role="group">
                <Input
                  disabled={props.disabled}
                  error={modelError ? t(modelError.message, modelError.values) : undefined}
                  hideLabel
                  id={`${props.id}-${row.key}-model`}
                  invalid={modelError !== undefined}
                  label={t('Model')}
                  list={listId}
                  onChange={(event) => update(row, 'model', event.target.value)}
                  placeholder={t('Select or enter a model')}
                  size="sm"
                  value={typeof row.values.model === 'string' ? row.values.model : ''}
                />
                <PluginConfigField
                  disabled={props.disabled}
                  error={props.errorFor(`${props.name}.${row.key}.value`)}
                  field={{ ...valueField, title: valueTitle }}
                  id={`${props.id}-${row.key}-value`}
                  layout="cell"
                  name="value"
                  onChange={(next) => update(row, 'value', next)}
                  required
                  value={row.values.value}
                />
                <Button
                  aria-label={t('Delete {{name}}', { name: rowName })}
                  disabled={props.disabled}
                  onClick={() => props.onChange(props.rows.filter((item) => item.key !== row.key))}
                  size="icon-sm"
                  variant="quiet"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </div>
            )
          })}
        </div>
      ) : null}
      <Button
        className="mt-2"
        disabled={props.disabled || !valueField}
        onClick={() =>
          props.onChange([
            ...props.rows,
            newRequestPluginConfigRow(toRequestPluginConfigDraft(requestPluginModelValueShape(props.field), { value: valueField?.default })),
          ])
        }
        size="sm"
        variant="quiet"
      >
        <PlusIcon aria-hidden="true" />
        {t('Add model')}
      </Button>
    </fieldset>
  )
}
