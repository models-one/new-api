import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down'
import ArrowUpIcon from 'lucide-react/dist/esm/icons/arrow-up'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import XIcon from 'lucide-react/dist/esm/icons/x'

import { Input, NativeSelect, Textarea } from '@/components/form'
import { Badge, Button } from '@/components/ui'
import { parseJson } from '@/features/system-settings/billing/option-json'
import { PROVIDER_PAY_METHOD_TYPES } from '@/features/system-settings/billing/pay-methods'

/**
 * Table editors for the payment options stored as JSON text: payment methods, top-up
 * amounts, amount discounts and Creem products. Each edits the same text the section
 * saves, so the section's checks still guard the write. A cell that is not a valid number
 * is written as the text typed, which those checks refuse — a typo blocks the save instead
 * of quietly disappearing from the list. Text the table cannot show is edited as JSON.
 */

type JsonEditorProps = {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
  description?: string
}

/** A typed number as stored: the number when valid, otherwise the text so the check refuses it. */
function numberOrText(text: string): number | string {
  const trimmed = text.trim()
  return trimmed !== '' && Number.isFinite(Number(trimmed)) ? Number(trimmed) : text
}

/**
 * Rows edited locally and written back as JSON. The rows are re-read only when the value
 * changes from outside (a save, a discard), never from this editor's own writes.
 */
function useRows<TRow>(props: JsonEditorProps, read: (value: string) => TRow[] | null, write: (rows: TRow[]) => string) {
  const [rows, setRows] = useState<TRow[] | null>(() => read(props.value))
  const emitted = useRef(props.value)
  if (props.value !== emitted.current) {
    emitted.current = props.value
    const next = read(props.value)
    // A render-time reset, the documented way to derive state from a changed prop.
    setRows(next)
  }
  function update(next: TRow[]) {
    setRows(next)
    const text = write(next)
    emitted.current = text
    props.onChange(text)
  }
  return [rows, update] as const
}

/** The JSON fallback, also offered on request for bulk edits. */
function JsonFallback(props: JsonEditorProps & { readable: boolean; onTable: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        description={props.readable ? props.description : t('This value cannot be shown as a table. Fix it here; the table returns once it is valid.')}
        disabled={props.disabled}
        error={props.error}
        label={props.label}
        onChange={(event) => props.onChange(event.target.value)}
        rows={5}
        spellCheck={false}
        textareaClassName="mono text-xs"
        value={props.value}
      />
      {props.readable ? (
        <div>
          <Button onClick={props.onTable} size="sm" variant="quiet">
            {t('Edit as a table')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function moveItem<T>(rows: T[], index: number, offset: -1 | 1): T[] {
  const next = [...rows]
  ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
  return next
}

function RowActions(props: { index: number; count: number; label: string; disabled?: boolean; onMove: (offset: -1 | 1) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  return (
    <span className="flex items-center gap-1">
      <Button aria-label={t('Move {{name}} up', { name: props.label })} disabled={props.disabled || props.index === 0} onClick={() => props.onMove(-1)} size="icon-sm" variant="quiet">
        <ArrowUpIcon aria-hidden="true" />
      </Button>
      <Button aria-label={t('Move {{name}} down', { name: props.label })} disabled={props.disabled || props.index === props.count - 1} onClick={() => props.onMove(1)} size="icon-sm" variant="quiet">
        <ArrowDownIcon aria-hidden="true" />
      </Button>
      <Button aria-label={t('Remove {{name}}', { name: props.label })} disabled={props.disabled} onClick={props.onRemove} size="icon-sm" variant="quiet">
        <XIcon aria-hidden="true" />
      </Button>
    </span>
  )
}

function Header(props: { label: string; description?: string; json: boolean; onJson: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-sm font-medium text-foreground">{props.label}</p>
        {props.description ? <p className="text-xs leading-5 text-muted">{props.description}</p> : null}
      </div>
      {props.json ? null : (
        <Button onClick={props.onJson} size="sm" variant="quiet">
          {t('Edit as JSON')}
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Payment methods — `PayMethods`, `[]map[string]string`
// ---------------------------------------------------------------------------

type PayMethodRow = { name: string; type: string; color: string; min_topup: string; /** Keys this editor does not show, kept as they are. */ rest: Record<string, string> }

const KNOWN_TYPES = ['alipay', 'wxpay', ...PROVIDER_PAY_METHOD_TYPES]

function readPayMethods(value: string): PayMethodRow[] | null {
  const parsed = parseJson(value)
  if (!Array.isArray(parsed)) return null
  const rows: PayMethodRow[] = []
  for (const item of parsed) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null
    const record = item as Record<string, unknown>
    if (Object.values(record).some((field) => typeof field !== 'string')) return null
    const { color = '', min_topup = '', name = '', type = '', ...rest } = record as Record<string, string>
    rows.push({ color, min_topup, name, rest, type })
  }
  return rows
}

function writePayMethods(rows: PayMethodRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      ...row.rest,
      name: row.name,
      type: row.type,
      ...(row.color.trim() === '' ? {} : { color: row.color.trim() }),
      // Always a string on the wire: the Go type is map[string]string.
      ...(row.min_topup.trim() === '' ? {} : { min_topup: row.min_topup.trim() }),
    })),
  )
}

export function PayMethodsEditor(props: JsonEditorProps) {
  const { t } = useTranslation()
  const [rows, update] = useRows(props, readPayMethods, writePayMethods)
  const [json, setJson] = useState(false)
  if (rows === null || json) return <JsonFallback {...props} onTable={() => setJson(false)} readable={rows !== null} />

  const patch = (index: number, next: Partial<PayMethodRow>) => update(rows.map((row, at) => (at === index ? { ...row, ...next } : row)))
  return (
    <div className="flex flex-col gap-3">
      <Header description={props.description} json={json} label={props.label} onJson={() => setJson(true)} />
      {rows.length === 0 ? <p className="text-xs text-muted">{t('No payment method is configured, so the top-up page has nothing to offer even when a gateway is live.')}</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const custom = !KNOWN_TYPES.includes(row.type)
          const label = row.name || row.type || t('new method')
          return (
            <li className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,8rem)_6rem_7rem_auto] sm:items-start" key={index}>
              <Input disabled={props.disabled} hideLabel label={t('Name of {{method}}', { method: label })} onChange={(event) => patch(index, { name: event.target.value })} placeholder={t('Shown on the top-up page')} size="sm" value={row.name} />
              <NativeSelect
                disabled={props.disabled}
                hideLabel
                label={t('Type of {{method}}', { method: label })}
                onChange={(event) => patch(index, { type: event.target.value === '__custom' ? '' : event.target.value })}
                options={[
                  { label: t('Alipay (Epay)'), value: 'alipay' },
                  { label: t('WeChat Pay (Epay)'), value: 'wxpay' },
                  { label: 'Stripe', value: 'stripe' },
                  { label: 'NOWPayments', value: 'nowpayments' },
                  { label: 'Waffo', value: 'waffo' },
                  { label: 'Waffo Pancake', value: 'waffo_pancake' },
                  { label: t('Other Epay type…'), value: '__custom' },
                ]}
                size="sm"
                value={custom ? '__custom' : row.type}
              />
              {custom ? (
                <Input disabled={props.disabled} hideLabel inputClassName="mono" label={t('Epay type of {{method}}', { method: label })} onChange={(event) => patch(index, { type: event.target.value })} placeholder="qqpay" size="sm" value={row.type} />
              ) : (
                <span className="self-center">
                  {(PROVIDER_PAY_METHOD_TYPES as readonly string[]).includes(row.type) ? <Badge tone="info">{t('Own gateway')}</Badge> : <Badge tone="muted">Epay</Badge>}
                </span>
              )}
              <Input disabled={props.disabled} hideLabel label={t('Colour of {{method}}', { method: label })} onChange={(event) => patch(index, { color: event.target.value })} placeholder={t('Colour')} size="sm" value={row.color} />
              <Input disabled={props.disabled} hideLabel inputMode="numeric" label={t('Minimum top-up of {{method}}', { method: label })} onChange={(event) => patch(index, { min_topup: event.target.value })} placeholder={t('Minimum')} size="sm" value={row.min_topup} />
              <RowActions count={rows.length} disabled={props.disabled} index={index} label={label} onMove={(offset) => update(moveItem(rows, index, offset))} onRemove={() => update(rows.filter((_, at) => at !== index))} />
            </li>
          )
        })}
      </ul>
      {props.error ? <p className="text-xs text-destructive" role="alert">{props.error}</p> : null}
      <div>
        <Button disabled={props.disabled} onClick={() => update([...rows, { color: '', min_topup: '', name: '', rest: {}, type: 'alipay' }])} size="sm" variant="outline">
          <PlusIcon aria-hidden="true" />
          {t('Add a payment method')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top-up amounts — `payment_setting.amount_options`, `[]int`
// ---------------------------------------------------------------------------

function readAmounts(value: string): string[] | null {
  const parsed = parseJson(value)
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'number')) return null
  return parsed.map(String)
}

export function AmountOptionsEditor(props: JsonEditorProps) {
  const { t } = useTranslation()
  const [rows, update] = useRows(props, readAmounts, (next) => JSON.stringify(next.map(numberOrText)))
  const [json, setJson] = useState(false)
  const [draft, setDraft] = useState('')
  if (rows === null || json) return <JsonFallback {...props} onTable={() => setJson(false)} readable={rows !== null} />

  const add = () => {
    if (draft.trim() === '') return
    update([...rows, draft.trim()])
    setDraft('')
  }
  return (
    <div className="flex flex-col gap-3">
      <Header description={props.description} json={json} label={props.label} onJson={() => setJson(true)} />
      <ul aria-label={props.label} className="flex flex-wrap gap-2">
        {rows.map((amount, index) => (
          <li className="flex items-center gap-1" key={index}>
            <Input className="w-24" disabled={props.disabled} hideLabel inputMode="numeric" label={t('Amount {{index}}', { index: index + 1 })} onChange={(event) => update(rows.map((item, at) => (at === index ? event.target.value : item)))} size="sm" value={amount} />
            <Button aria-label={t('Remove amount {{amount}}', { amount })} disabled={props.disabled} onClick={() => update(rows.filter((_, at) => at !== index))} size="icon-sm" variant="quiet">
              <XIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
        <li className="flex items-center gap-1">
          <Input
            className="w-24"
            disabled={props.disabled}
            hideLabel
            inputMode="numeric"
            label={t('New amount')}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
            }}
            placeholder={t('Amount')}
            size="sm"
            value={draft}
          />
          <Button aria-label={t('Add amount')} disabled={props.disabled || draft.trim() === ''} onClick={add} size="icon-sm" variant="outline">
            <PlusIcon aria-hidden="true" />
          </Button>
        </li>
      </ul>
      {props.error ? <p className="text-xs text-destructive" role="alert">{props.error}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Amount discounts — `payment_setting.amount_discount`, `map[int]float64`
// ---------------------------------------------------------------------------

type DiscountRow = { amount: string; multiplier: string }

function readDiscounts(value: string): DiscountRow[] | null {
  const parsed = parseJson(value)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.some(([, multiplier]) => typeof multiplier !== 'number')) return null
  return entries.map(([amount, multiplier]) => ({ amount, multiplier: String(multiplier) }))
}

/**
 * A JSON object cannot hold an empty or a repeated key; either would silently drop a row.
 * Such a row is written under a key the amount check refuses, so the save is blocked.
 */
function writeDiscounts(rows: DiscountRow[]): string {
  const map: Record<string, number | string> = {}
  rows.forEach((row, index) => {
    const amount = row.amount.trim()
    const key = amount === '' || Object.hasOwn(map, amount) ? `${amount}#row${index + 1}` : amount
    map[key] = numberOrText(row.multiplier)
  })
  return JSON.stringify(map)
}

export function AmountDiscountEditor(props: JsonEditorProps) {
  const { t } = useTranslation()
  const [rows, update] = useRows(props, readDiscounts, writeDiscounts)
  const [json, setJson] = useState(false)
  if (rows === null || json) return <JsonFallback {...props} onTable={() => setJson(false)} readable={rows !== null} />

  const patch = (index: number, next: Partial<DiscountRow>) => update(rows.map((row, at) => (at === index ? { ...row, ...next } : row)))
  return (
    <div className="flex flex-col gap-3">
      <Header description={props.description} json={json} label={props.label} onJson={() => setJson(true)} />
      {rows.length === 0 ? <p className="text-xs text-muted">{t('No discounts.')}</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const multiplier = Number(row.multiplier)
          let effect = ''
          if (row.multiplier.trim() !== '' && Number.isFinite(multiplier) && multiplier > 0) {
            if (multiplier < 1) effect = t('{{percent}}% off', { percent: Number(((1 - multiplier) * 100).toPrecision(4)) })
            else if (multiplier > 1) effect = t('{{percent}}% surcharge', { percent: Number(((multiplier - 1) * 100).toPrecision(4)) })
            else effect = t('No change')
          }
          return (
            <li className="flex flex-wrap items-center gap-2" key={index}>
              <Input className="w-28" disabled={props.disabled} hideLabel inputMode="numeric" label={t('Top-up amount of discount {{index}}', { index: index + 1 })} onChange={(event) => patch(index, { amount: event.target.value })} placeholder={t('Amount')} size="sm" value={row.amount} />
              <span className="text-xs text-muted">{t('pays ×')}</span>
              <Input className="w-24" disabled={props.disabled} hideLabel inputMode="decimal" label={t('Price multiplier of discount {{index}}', { index: index + 1 })} onChange={(event) => patch(index, { multiplier: event.target.value })} placeholder="0.9" size="sm" value={row.multiplier} />
              {effect ? <Badge tone={multiplier > 1 ? 'warning' : 'success'}>{effect}</Badge> : null}
              <Button aria-label={t('Remove discount {{index}}', { index: index + 1 })} disabled={props.disabled} onClick={() => update(rows.filter((_, at) => at !== index))} size="icon-sm" variant="quiet">
                <XIcon aria-hidden="true" />
              </Button>
            </li>
          )
        })}
      </ul>
      {props.error ? <p className="text-xs text-destructive" role="alert">{props.error}</p> : null}
      <div>
        <Button disabled={props.disabled} onClick={() => update([...rows, { amount: '', multiplier: '' }])} size="sm" variant="outline">
          <PlusIcon aria-hidden="true" />
          {t('Add a discount')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Creem products — `CreemProducts`, `[{productId, name, price, currency, quota}]`
// ---------------------------------------------------------------------------

type CreemRow = { productId: string; name: string; price: string; currency: string; quota: string }

export type CreemProblem = 'syntax' | 'not-array' | 'missing-id' | 'duplicate-id' | 'missing-name' | 'bad-price' | 'bad-currency' | 'bad-quota'

/**
 * `controller/topup_creem.go` reads this list when a user buys, and credits `quota` — an
 * int64 — for the product bought. The option itself is stored unchecked, so this is the
 * only check: every product needs an id, a name, a positive price, USD or EUR, and a
 * positive whole-number quota no larger than the wallet can hold.
 */
export function checkCreemProducts(value: string): CreemProblem | undefined {
  const parsed = parseJson(value)
  if (parsed === undefined) return 'syntax'
  if (!Array.isArray(parsed)) return 'not-array'
  const ids = new Set<string>()
  for (const item of parsed) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return 'not-array'
    const record = item as Record<string, unknown>
    if (typeof record.productId !== 'string' || record.productId.trim() === '') return 'missing-id'
    if (ids.has(record.productId)) return 'duplicate-id'
    ids.add(record.productId)
    if (typeof record.name !== 'string' || record.name.trim() === '') return 'missing-name'
    if (typeof record.price !== 'number' || !Number.isFinite(record.price) || record.price <= 0) return 'bad-price'
    if (record.currency !== 'USD' && record.currency !== 'EUR') return 'bad-currency'
    if (typeof record.quota !== 'number' || !Number.isSafeInteger(record.quota) || record.quota <= 0) return 'bad-quota'
  }
  return undefined
}

function readCreem(value: string): CreemRow[] | null {
  const parsed = parseJson(value)
  if (!Array.isArray(parsed)) return null
  const rows: CreemRow[] = []
  for (const item of parsed) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null
    const record = item as Record<string, unknown>
    const text = (field: unknown) => (typeof field === 'string' || typeof field === 'number' ? String(field) : '')
    rows.push({ currency: text(record.currency) || 'USD', name: text(record.name), price: text(record.price), productId: text(record.productId), quota: text(record.quota) })
  }
  return rows
}

function writeCreem(rows: CreemRow[]): string {
  return JSON.stringify(rows.map((row) => ({ currency: row.currency, name: row.name.trim(), price: numberOrText(row.price), productId: row.productId.trim(), quota: numberOrText(row.quota) })))
}

export function CreemProductsEditor(props: JsonEditorProps) {
  const { t } = useTranslation()
  const [rows, update] = useRows(props, readCreem, writeCreem)
  const [json, setJson] = useState(false)
  if (rows === null || json) return <JsonFallback {...props} onTable={() => setJson(false)} readable={rows !== null} />

  const patch = (index: number, next: Partial<CreemRow>) => update(rows.map((row, at) => (at === index ? { ...row, ...next } : row)))
  return (
    <div className="flex flex-col gap-3">
      <Header description={props.description} json={json} label={props.label} onJson={() => setJson(true)} />
      {rows.length === 0 ? <p className="text-xs text-muted">{t('No Creem product yet.')}</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const label = row.name || row.productId || t('new product')
          return (
            <li className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem_6rem_8rem_auto] sm:items-start" key={index}>
              <Input disabled={props.disabled} hideLabel inputClassName="mono" label={t('Product id of {{product}}', { product: label })} onChange={(event) => patch(index, { productId: event.target.value })} placeholder="prod_…" size="sm" value={row.productId} />
              <Input disabled={props.disabled} hideLabel label={t('Name of {{product}}', { product: label })} onChange={(event) => patch(index, { name: event.target.value })} placeholder={t('Name')} size="sm" value={row.name} />
              <Input disabled={props.disabled} hideLabel inputMode="decimal" label={t('Price of {{product}}', { product: label })} onChange={(event) => patch(index, { price: event.target.value })} placeholder={t('Price')} size="sm" value={row.price} />
              <NativeSelect disabled={props.disabled} hideLabel label={t('Currency of {{product}}', { product: label })} onChange={(event) => patch(index, { currency: event.target.value })} options={[{ label: 'USD', value: 'USD' }, { label: 'EUR', value: 'EUR' }]} size="sm" value={row.currency} />
              <Input disabled={props.disabled} hideLabel inputMode="numeric" label={t('Quota credited by {{product}}', { product: label })} onChange={(event) => patch(index, { quota: event.target.value })} placeholder={t('Quota')} size="sm" value={row.quota} />
              <RowActions count={rows.length} disabled={props.disabled} index={index} label={label} onMove={(offset) => update(moveItem(rows, index, offset))} onRemove={() => update(rows.filter((_, at) => at !== index))} />
            </li>
          )
        })}
      </ul>
      {props.error ? <p className="text-xs text-destructive" role="alert">{props.error}</p> : null}
      <div>
        <Button disabled={props.disabled} onClick={() => update([...rows, { currency: 'USD', name: '', price: '', productId: '', quota: '' }])} size="sm" variant="outline">
          <PlusIcon aria-hidden="true" />
          {t('Add a Creem product')}
        </Button>
      </div>
    </div>
  )
}
