import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'
import FlaskConicalIcon from 'lucide-react/dist/esm/icons/flask-conical'

import { Collapsible } from '@/components/disclosure'
import { Input, NativeSelect, NumberInput, Textarea } from '@/components/form'
import { Badge } from '@/components/ui'
import { formatPrice } from '@/features/system-settings/billing/model-pricing-draft'
import {
  DIAGNOSTIC_TEXT,
  expressionNeeds,
  NO_EXTRA_TOKENS,
  simulate,
  type SimulationInput,
} from '@/features/system-settings/billing/price-simulation'
import { localizedText } from '@/features/task-plugins/presentation'
import { formatBillingCondition } from '@/lib/billing-expression/condition-display'
import type { ExtraTokenValues } from '@/lib/billing-expression/tier-expr'
import type { BillingUsageSchema } from '@/lib/billing-expression/usage-schema'
import { cn } from '@/lib/utils'

/**
 * "Try this price": the cost of one request (or task) at the price being edited, computed
 * in the browser. Collapsed until opened, and it only asks for what the expression reads —
 * extra token kinds, the image count, a sample request, a time.
 */

type PriceSimulatorProps = { expression: string } & ({ kind: 'token' } | { kind: 'task'; schema: BillingUsageSchema })

const EXTRA_LABELS: Record<keyof ExtraTokenValues, string> = {
  audioInputTokens: 'Audio input tokens',
  audioOutputTokens: 'Audio output tokens',
  cacheCreate12hTokens: 'Cache write (12h) tokens',
  cacheCreate1hTokens: 'Cache write (1h) tokens',
  cacheCreateTokens: 'Cache write tokens',
  cacheReadTokens: 'Cached input tokens',
  imageCacheTokens: 'Cached image tokens',
  imageOutputTokens: 'Image output tokens',
  imageTokens: 'Image input tokens',
}

/** A count as typed: empty is 0, anything else must be a number. */
function readCount(text: string): number {
  return text.trim() === '' ? 0 : Number(text)
}

export function PriceSimulator(props: PriceSimulatorProps) {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const needs = useMemo(() => expressionNeeds(props.expression), [props.expression])

  const [input, setInput] = useState('1000')
  const [output, setOutput] = useState('1000')
  const [extra, setExtra] = useState<Record<keyof ExtraTokenValues, string>>(() =>
    Object.fromEntries(Object.keys(NO_EXTRA_TOKENS).map((key) => [key, ''])) as Record<keyof ExtraTokenValues, string>,
  )
  const [length, setLength] = useState('')
  const [imageCount, setImageCount] = useState('1')
  const [usage, setUsage] = useState<Record<string, string>>({})
  const [body, setBody] = useState('{}')
  const [headers, setHeaders] = useState('{}')
  const [timeMode, setTimeMode] = useState<'now' | 'fixed'>('now')
  const [fixedTime, setFixedTime] = useState('')
  const [now, setNow] = useState(() => new Date())

  // A time-based price follows the clock while it is open and the current time is used.
  useEffect(() => {
    if (!open || !needs?.usesTime || timeMode !== 'now') return undefined
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [needs?.usesTime, open, timeMode])

  const schema = props.kind === 'task' ? props.schema : undefined
  const schemaFields = useMemo(() => Object.entries(schema ?? {}).sort(([left], [right]) => left.localeCompare(right)), [schema])

  const result = useMemo(() => {
    if (!open || needs === null) return null
    const common = {
      now,
      request: needs.usesRequest ? { body, headers } : undefined,
      time: needs.usesTime && timeMode === 'fixed' ? fixedTime.trim() : null,
    }
    let simulation: SimulationInput
    if (props.kind === 'task') {
      const facts: Record<string, unknown> = {}
      for (const [field, definition] of schemaFields) {
        const value = usage[field]
        if (value === undefined || value === '') continue
        if (definition.type === 'boolean') facts[field] = value === 'true'
        else if (definition.enum?.length) facts[field] = value
        else facts[field] = Number(value)
      }
      simulation = { ...common, kind: 'task', usage: facts }
    } else {
      simulation = {
        ...common,
        extra: Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, readCount(value)])) as ExtraTokenValues,
        imageCount: readCount(imageCount),
        input: readCount(input),
        kind: 'token',
        length: length.trim() === '' ? null : Number(length),
        output: readCount(output),
      }
    }
    return simulate(props.expression, simulation)
  }, [body, extra, fixedTime, headers, imageCount, input, length, needs, now, open, output, props.expression, props.kind, schemaFields, timeMode, usage])

  if (needs === null) return null

  let problem: string | null = null
  if (result?.inputError) problem = t(result.inputError)
  else if (result?.evaluation && result.evaluation.status !== 'success') {
    problem = `${t(DIAGNOSTIC_TEXT[result.evaluation.diagnostic.code])} ${result.evaluation.diagnostic.detail}`
  }
  const success = result?.evaluation?.status === 'success' ? result.evaluation : null

  return (
    <Collapsible className="rounded-md border border-border p-3" onOpenChange={setOpen} open={open}>
      <Collapsible.Trigger>
        <FlaskConicalIcon aria-hidden="true" />
        {t('Try this price')}
        <ChevronDownIcon aria-hidden="true" className={cn('transition-transform', open ? 'rotate-180' : '')} />
      </Collapsible.Trigger>
      <Collapsible.Panel className="mt-3 flex flex-col gap-4">
        <p className="text-xs leading-5 text-muted">
          {t('The cost of one request at this price, before group ratios. Nothing is saved or sent.')}
        </p>

        {props.kind === 'token' ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberInput label={t('Input tokens')} min={0} onChange={(event) => setInput(event.target.value)} step={1} value={input} />
            <NumberInput label={t('Output tokens')} min={0} onChange={(event) => setOutput(event.target.value)} step={1} value={output} />
            {[...needs.extraTokens].map((key) => (
              <NumberInput key={key} label={t(EXTRA_LABELS[key])} min={0} onChange={(event) => setExtra((current) => ({ ...current, [key]: event.target.value }))} placeholder="0" step={1} value={extra[key]} />
            ))}
            {needs.usesLength ? (
              <NumberInput
                description={t('Empty uses input plus cached and cache-write tokens.')}
                label={t('Full input length')}
                min={0}
                onChange={(event) => setLength(event.target.value)}
                placeholder={t('Automatic')}
                step={1}
                value={length}
              />
            ) : null}
            {needs.usesImageCount ? (
              <NumberInput label={t('Images requested')} min={1} onChange={(event) => setImageCount(event.target.value)} step={1} value={imageCount} />
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {schemaFields.map(([field, definition]) => {
              const label = localizedText(definition.description, i18n.language) || field
              if (definition.type === 'boolean' || definition.enum?.length) {
                const options = definition.type === 'boolean'
                  ? [{ label: t('Yes'), value: 'true' }, { label: t('No'), value: 'false' }]
                  : (definition.enum ?? []).map((value) => ({ label: localizedText(definition.enumLabels?.[value], i18n.language) || value, value }))
                return (
                  <NativeSelect
                    key={field}
                    label={label}
                    onChange={(event) => setUsage((current) => ({ ...current, [field]: event.target.value }))}
                    options={[{ label: t('Not reported'), value: '' }, ...options]}
                    size="sm"
                    value={usage[field] ?? ''}
                  />
                )
              }
              return (
                <NumberInput key={field} label={label} min={0} onChange={(event) => setUsage((current) => ({ ...current, [field]: event.target.value }))} placeholder={t('Not reported')} step="any" value={usage[field] ?? ''} />
              )
            })}
          </div>
        )}

        {needs.usesRequest ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Textarea
              description={t('The fields request rules read, such as {"service_tier": "priority"}.')}
              label={t('Sample request body')}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              spellCheck={false}
              textareaClassName="mono text-xs"
              value={body}
            />
            <Textarea
              description={t('As {"header-name": "value"}.')}
              label={t('Sample request headers')}
              onChange={(event) => setHeaders(event.target.value)}
              rows={4}
              spellCheck={false}
              textareaClassName="mono text-xs"
              value={headers}
            />
          </div>
        ) : null}

        {needs.usesTime ? (
          <div className="flex flex-wrap items-end gap-3">
            <NativeSelect
              className="w-48"
              description={t('Time functions use the time zone written in the expression.')}
              label={t('Request time')}
              onChange={(event) => {
                const mode = event.target.value as 'now' | 'fixed'
                if (mode === 'fixed' && fixedTime === '') setFixedTime(isoWithOffset(new Date()))
                setTimeMode(mode)
              }}
              options={[
                { label: t('Now'), value: 'now' },
                { label: t('A time I choose'), value: 'fixed' },
              ]}
              size="sm"
              value={timeMode}
            />
            {timeMode === 'fixed' ? (
              <Input className="w-72" inputClassName="mono" label={t('Time with offset')} onChange={(event) => setFixedTime(event.target.value)} placeholder="2026-09-07T22:00:00+08:00" size="sm" value={fixedTime} />
            ) : null}
          </div>
        ) : null}

        {problem ? (
          <p className="text-sm text-destructive" role="alert">
            {problem}
          </p>
        ) : null}

        {success && result?.usd !== undefined ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 text-sm" role="status">
            <p className="font-semibold text-foreground">
              {props.kind === 'task' ? t('This task costs ${{price}}', { price: formatPrice(result.usd) }) : t('This request costs ${{price}}', { price: formatPrice(result.usd) })}
            </p>
            {success.matchedTier ? (
              <span>
                <Badge tone="info">{t('Tier: {{tier}}', { tier: success.matchedTier })}</Badge>
              </span>
            ) : null}
            {success.requestRules.length > 0 ? (
              <ul className="flex flex-col gap-1 text-xs">
                {success.requestRules.map((rule, index) => (
                  <li className={rule.matched ? 'text-foreground' : 'text-muted'} key={`${rule.cond}-${index}`}>
                    {rule.matched ? t('Applied ×{{multiplier}}', { multiplier: rule.multiplier }) : t('Not applied ×{{multiplier}}', { multiplier: rule.multiplier })}
                    {' · '}
                    {formatBillingCondition(rule.cond, t, i18n.language) ?? rule.cond}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Collapsible.Panel>
    </Collapsible>
  )
}

/** The local time as ISO with the browser's offset, a starting point for a chosen time. */
function isoWithOffset(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19)
  return `${local}${sign}${pad(offset / 60)}:${pad(offset % 60)}`
}
