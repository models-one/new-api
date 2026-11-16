import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import InfoIcon from 'lucide-react/dist/esm/icons/info'

import { Field, Input, NativeSelect, PasswordInput, Switch, Textarea } from '@/components/form'
import { Tooltip } from '@/components/overlay'
import { formatBytes, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  REQUEST_PLUGIN_BYTE_SCALES,
  requestPluginFieldInline,
  requestPluginFieldKind,
  requestPluginFieldUsesSlider,
  type RequestPluginBytesDraft,
  type RequestPluginFieldError,
} from '../lib/request-plugins'
import { localizedText } from '../presentation'
import type { RequestPluginConfigField as ConfigField } from '../types'

/**
 * A field's description behind an info icon, for list items and table columns where a
 * line under every field would crowd them.
 */
export function PluginConfigFieldHint(props: { text?: string }) {
  if (!props.text) return null
  return (
    <Tooltip className="max-w-64" content={props.text}>
      <button aria-label={props.text} className="inline-flex rounded-sm text-muted hover:text-foreground" type="button">
        <InfoIcon aria-hidden="true" className="size-3.5" />
      </button>
    </Tooltip>
  )
}

type PluginConfigFieldProps = {
  id: string
  name: string
  field: ConfigField
  value: unknown
  required?: boolean
  error?: RequestPluginFieldError
  disabled?: boolean
  /**
   * `row` is a setting of the form: short controls sit beside the title. `compact` is a
   * field of a list item, with a small title. `cell` is a table cell: the control alone,
   * its title read by assistive technology.
   */
  layout?: 'row' | 'compact' | 'cell'
  onChange: (value: unknown) => void
}

/** One field of a plugin config, rendered from its schema (docs/plugin-api/v1.md). */
export function PluginConfigField(props: PluginConfigFieldProps) {
  const { i18n, t } = useTranslation()
  const field = props.field
  const title = localizedText(field.title, i18n.language) || props.name
  const description = localizedText(field.description, i18n.language)
  const kind = requestPluginFieldKind(field)
  const layout = props.layout ?? 'row'
  const text = typeof props.value === 'string' ? props.value : ''
  // Counted only when this text changes, not when another field does.
  const filledLines = useMemo(
    () => (kind === 'textarea' ? text.split('\n').filter((line) => line.trim()).length : 0),
    [kind, text],
  )
  const errorText = props.error ? t(props.error.message, props.error.values) : undefined
  const hideLabel = layout === 'cell'
  const label = title

  let unitText = ''
  if (field.unit === 'pixel') unitText = 'px'
  if (field.unit === 'character') unitText = t('characters')
  if (field.unit === 'second') unitText = t('seconds')
  const formatBound = (value: number) => {
    if (field.unit === 'byte') return formatBytes(value)
    const number = formatNumber(value)
    return unitText ? `${number} ${unitText}` : number
  }
  // An address left empty uses its default, so the default is its example.
  const example = field.examples?.[0] ?? (field.format === 'url' ? field.default : undefined)
  let exampleText = ''
  if (example !== undefined && kind !== 'enum') {
    if (kind === 'lines' && Array.isArray(example)) exampleText = example.join('\n')
    else if (kind === 'bytes' && typeof example === 'number') exampleText = formatBytes(example)
    else if (typeof example === 'object' && example !== null) exampleText = JSON.stringify(example, null, 2)
    else exampleText = String(example)
  }
  const slider = requestPluginFieldUsesSlider(field)
  let rangeText = ''
  if ((kind === 'number' || kind === 'bytes') && !slider) {
    if (field.minimum !== undefined && field.maximum !== undefined) {
      rangeText = t('Allowed range: {{min}} to {{max}}', { max: formatBound(field.maximum), min: formatBound(field.minimum) })
    } else if (field.maximum !== undefined) {
      rangeText = t('At most {{value}}', { value: formatBound(field.maximum) })
    } else if (field.minimum !== undefined && field.minimum > 0) {
      rangeText = t('At least {{value}}', { value: formatBound(field.minimum) })
    }
  }
  // Below a row field: what it does, its range, and an example. A list item or a table
  // cell keeps the description behind an info icon instead.
  const exampleBelow = layout === 'row' && kind !== 'enum' && kind !== 'textarea' && exampleText !== '' && !exampleText.includes('\n')
  const notes = [layout === 'row' ? description : '', rangeText, exampleBelow ? t('Example: {{value}}', { value: exampleText }) : '']
    .filter(Boolean)
  const fieldDescription: ReactNode = notes.length === 0 ? undefined : (
    <>
      {notes.map((note) => (
        <span className="block" key={note}>
          {note}
        </span>
      ))}
    </>
  )
  const shared = {
    description: fieldDescription,
    disabled: props.disabled,
    error: errorText,
    hideLabel,
    id: props.id,
    invalid: props.error !== undefined,
    label,
    required: props.required,
    size: layout === 'row' ? ('md' as const) : ('sm' as const),
  }
  const hint = layout === 'compact' ? <PluginConfigFieldHint text={description} /> : null
  const labelled = (control: ReactNode) =>
    layout === 'compact' && description ? (
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex justify-end">{hint}</div>
        {control}
      </div>
    ) : (
      control
    )

  if (kind === 'boolean') {
    return (
      <Switch
        checked={props.value === true}
        description={layout === 'row' ? description || undefined : undefined}
        disabled={props.disabled}
        hideLabel={hideLabel}
        label={label}
        onCheckedChange={props.onChange}
        size={layout === 'row' ? 'md' : 'sm'}
      />
    )
  }

  if (kind === 'enumList') {
    const selected = Array.isArray(props.value) ? (props.value as string[]) : []
    const options = (field.items?.enum ?? []).map((option) => String(option))
    return (
      <Field description={layout === 'row' ? description : undefined} error={errorText} hideLabel={hideLabel} label={title} required={props.required}>
        {(control) => (
          <div aria-describedby={control['aria-describedby']} aria-label={title} className="flex flex-wrap gap-2" id={control.id} role="group">
            {options.map((option, index) => {
              const pressed = selected.includes(option)
              return (
                <button
                  aria-pressed={pressed}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60',
                    pressed ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-muted hover:text-foreground',
                  )}
                  disabled={props.disabled}
                  key={option}
                  // Keep the schema's order, whatever order they were picked in.
                  onClick={() => props.onChange(options.filter((item) => (item === option ? !pressed : selected.includes(item))))}
                  type="button"
                >
                  {localizedText(field.items?.enumTitles?.[index], i18n.language) || option}
                </button>
              )
            })}
          </div>
        )}
      </Field>
    )
  }

  if (kind === 'enum') {
    const items = (field.enum ?? []).map((option, index) => ({
      label: localizedText(field.enumTitles?.[index], i18n.language) || String(option),
      value: String(option),
    }))
    // A choice left empty uses its default, so the default stands in for it.
    const defaultItem = field.default === undefined ? undefined : items.find((item) => item.value === String(field.default))
    return labelled(
      <NativeSelect
        {...shared}
        onChange={(event) => props.onChange(field.enum?.find((option) => String(option) === event.target.value))}
        options={[{ label: defaultItem ? t('Default: {{value}}', { value: defaultItem.label }) : t('Not set'), value: '' }, ...items]}
        value={props.value === undefined ? '' : String(props.value)}
      />,
    )
  }

  if (kind === 'json' || kind === 'lines' || kind === 'textarea') {
    const lineCount =
      kind === 'textarea' && filledLines > 0 ? (
        <span className="block text-right tabular-nums">{t('Lines: {{value}}', { value: formatNumber(filledLines) })}</span>
      ) : null
    return labelled(
      <Textarea
        {...shared}
        description={
          lineCount === null ? (
            shared.description
          ) : (
            <>
              {shared.description}
              {lineCount}
            </>
          )
        }
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={exampleText}
        rows={kind === 'json' ? 6 : 4}
        textareaClassName={kind === 'textarea' ? undefined : 'font-mono text-xs'}
        value={text}
      />,
    )
  }

  if (kind === 'bytes') {
    const bytes = (props.value as RequestPluginBytesDraft | undefined) ?? { amount: '', scale: 1000 }
    return labelled(
      <Input
        {...shared}
        inputMode="decimal"
        min={0}
        onChange={(event) => props.onChange({ ...bytes, amount: event.target.value })}
        placeholder={exampleText}
        suffix={
          <select
            aria-label={t('Unit of {{name}}', { name: title })}
            className="bg-transparent text-xs text-muted outline-none"
            disabled={props.disabled}
            onChange={(event) => props.onChange({ ...bytes, scale: Number(event.target.value) })}
            value={String(bytes.scale)}
          >
            {REQUEST_PLUGIN_BYTE_SCALES.map((item) => (
              <option key={item.scale} value={String(item.scale)}>
                {item.label}
              </option>
            ))}
          </select>
        }
        type="number"
        value={bytes.amount}
      />,
    )
  }

  if (kind === 'number') {
    const number = Number(text)
    let sliderValue = Number(field.default ?? field.minimum)
    if (text.trim() && Number.isFinite(number)) sliderValue = number
    const input = (
      <Input
        {...shared}
        className={slider ? 'flex-1' : undefined}
        inputMode="decimal"
        max={field.maximum}
        min={field.minimum}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={exampleText}
        prefix={
          slider ? (
            <input
              aria-label={title}
              className="mr-2 w-28 accent-[var(--color-primary)] sm:w-40"
              disabled={props.disabled}
              max={field.maximum}
              min={field.minimum}
              onChange={(event) => props.onChange(event.target.value)}
              step={1}
              type="range"
              value={sliderValue}
            />
          ) : undefined
        }
        suffix={unitText || undefined}
        type="number"
        value={text}
      />
    )
    return labelled(input)
  }

  const textProps = {
    ...shared,
    onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
    placeholder: exampleText,
    value: text,
  }
  if (field.format === 'password') return labelled(<PasswordInput {...textProps} autoComplete="off" />)
  return labelled(
    <Input
      {...textProps}
      inputClassName={field.format === 'regex' ? 'font-mono' : undefined}
      orientation={layout === 'row' && requestPluginFieldInline(field) ? 'horizontal' : undefined}
      type={field.format === 'url' ? 'url' : 'text'}
    />,
  )
}
