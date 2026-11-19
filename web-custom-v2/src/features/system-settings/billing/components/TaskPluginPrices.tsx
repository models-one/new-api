import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, SwitchRow, Textarea } from '@/components/form'
import { Alert, Badge, Button, Panel } from '@/components/ui'
import type { ModelPricingIssue, ModelPricingPluginVariant } from '@/features/system-settings/billing/model-pricing-api'
import { formatPrice, type PricingDraft } from '@/features/system-settings/billing/model-pricing-draft'
import {
  canUsePriceTable,
  modelPriceChargesPlugin,
  readPriceTable,
  writePriceTable,
  type PriceTable,
} from '@/features/system-settings/billing/task-plugin-pricing'
import { PluginIcon } from '@/features/task-plugins/components/PluginIcon'
import { localizedText } from '@/features/task-plugins/presentation'
import { taskExpressionCompatible } from '@/lib/billing-expression/plugin-pricing'
import { evaluateTaskUsageExamples, getTaskNumberFields } from '@/lib/billing-expression/task-expr'
import type { BillingUsageFieldSchema, BillingUsageSchema } from '@/lib/billing-expression/usage-schema'

/**
 * The task plugins serving one model, each either charged with the model's price or with
 * its own (`billing_setting.plugin_billing_expr`). The parent holds the expressions in the
 * draft; an own price still being filled in is held there as an empty string, which the
 * draft refuses to save.
 */

type TaskPluginPricesProps = {
  variants: readonly ModelPricingPluginVariant[]
  issues: readonly ModelPricingIssue[]
  draft: PricingDraft
  showProblems: boolean
  onChange: (plugins: Record<string, string>) => void
}

const ISSUE_TEXT: Record<ModelPricingIssue['reason'], string> = {
  incompatible: 'Its price reads usage this plugin no longer reports. Set its price again with the fields below.',
  stale: 'This plugin no longer offers this model. Remove its saved price.',
  unconfigured: 'No price can charge this plugin’s tasks. Set a separate price for it below.',
}

export function TaskPluginPrices(props: TaskPluginPricesProps) {
  const { t } = useTranslation()
  if (props.variants.length === 0) return null

  return (
    <section aria-label={t('Plugin prices')} className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t('Plugin prices')}</h3>
        <p className="text-xs leading-5 text-muted">
          {t('Task plugins serving this model charge its price, or a price of their own based on the usage they report. Prices are USD.')}
        </p>
      </div>
      {props.variants.map((variant) => (
        <PluginPrice
          draft={props.draft}
          issue={props.issues.find((issue) => issue.plugin_key === variant.plugin_key)}
          key={variant.plugin_key}
          onChange={(expression) => {
            const next = { ...props.draft.plugins }
            if (expression === null) delete next[variant.plugin_key]
            else next[variant.plugin_key] = expression
            props.onChange(next)
          }}
          showProblems={props.showProblems}
          variant={variant}
        />
      ))}
    </section>
  )
}

type PluginPriceProps = {
  variant: ModelPricingPluginVariant
  issue: ModelPricingIssue | undefined
  draft: PricingDraft
  showProblems: boolean
  /** The plugin's own expression, '' while incomplete, or null to use the model price. */
  onChange: (expression: string | null) => void
}

function PluginPrice(props: PluginPriceProps) {
  const { t } = useTranslation()
  const { variant } = props
  const schema = variant.usage_schema ?? {}
  const own = Object.hasOwn(props.draft.plugins, variant.plugin_key)
  const expression = props.draft.plugins[variant.plugin_key] ?? ''
  const inherited = own ? undefined : modelPriceChargesPlugin(variant, props.draft)

  return (
    <Panel className="flex flex-col gap-3 p-3" muted>
      <div className="flex flex-wrap items-center gap-2">
        <PluginIcon icon={variant.icon} name={variant.plugin_name} pluginKey={variant.plugin_key} size="sm" />
        <span className="text-sm font-medium text-foreground">{variant.plugin_name}</span>
        {own ? <Badge tone="info">{t('Own price')}</Badge> : <Badge tone="muted">{t('Uses the model price')}</Badge>}
        {variant.relay ? <Badge tone="muted">{t('Also relays this model')}</Badge> : null}
        {variant.stale ? <Badge tone="warning">{t('No longer serves this model')}</Badge> : null}
      </div>

      {props.issue ? <Alert tone="warning">{t(ISSUE_TEXT[props.issue.reason])}</Alert> : null}

      {variant.stale && own ? (
        <div className="flex flex-col gap-2">
          <pre className="mono overflow-x-auto rounded-md border border-border bg-surface p-3 text-xs break-all whitespace-pre-wrap">{expression}</pre>
          <div>
            <Button onClick={() => props.onChange(null)} size="sm" variant="outline">
              {t('Remove saved price')}
            </Button>
          </div>
        </div>
      ) : null}

      {variant.stale ? null : (
        <>
          <SwitchRow
            checked={own}
            description={own ? undefined : inheritedDescription(inherited, t)}
            label={t('Set a separate price for this plugin')}
            onCheckedChange={(checked) => {
              if (!checked) return props.onChange(null)
              // Start from the model price when it already works for this plugin; otherwise
              // from an empty table, so nothing is charged at a price nobody typed.
              const start = props.draft.mode === 'expression' && modelPriceChargesPlugin(variant, props.draft) === true ? props.draft.expression : ''
              props.onChange(start)
            }}
          />
          {own ? (
            <OwnPrice
              expression={expression}
              key={variant.plugin_key}
              onChange={props.onChange}
              schema={schema}
              showProblems={props.showProblems}
              variant={variant}
            />
          ) : null}
          <UsageFields schema={schema} />
        </>
      )}
    </Panel>
  )
}

function inheritedDescription(inherited: boolean | undefined, t: (key: string) => string): string {
  if (inherited === true) return t('Its tasks are charged with the model price above.')
  if (inherited === false) return t('The model price above cannot charge this plugin’s tasks, so they are refused until it has its own price.')
  return t('The server checks whether the model price can charge these tasks when you save.')
}

type OwnPriceProps = {
  variant: ModelPricingPluginVariant
  schema: BillingUsageSchema
  expression: string
  showProblems: boolean
  onChange: (expression: string) => void
}

/** The plugin's own price, as a table when its shape allows, else as text. */
function OwnPrice(props: OwnPriceProps) {
  const { i18n, t } = useTranslation()
  const [table, setTable] = useState<PriceTable | null>(() => readPriceTable(props.expression, props.schema))
  const [view, setView] = useState<'table' | 'text'>(table === null ? 'text' : 'table')
  const [cellIssues, setCellIssues] = useState<string[]>(() => (table === null ? [] : writePriceTable(table, props.schema).issues))

  function editTable(next: PriceTable) {
    setTable(next)
    const written = writePriceTable(next, props.schema)
    setCellIssues(written.issues)
    props.onChange(written.expression ?? '')
  }

  const fields = getTaskNumberFields(props.schema)
  // A plugin's own price may omit u() even when it relays the model; only the schema matters.
  const compatible = props.expression.trim() === '' ? undefined : taskExpressionCompatible(props.expression, props.schema, false)
  const examples = props.expression.trim() === '' ? [] : evaluateTaskUsageExamples(props.expression, props.schema, props.variant.usage_examples)
  const showCell = (cell: string) => props.showProblems && cellIssues.includes(cell)

  return (
    <div className="flex flex-col gap-3">
      {canUsePriceTable(props.schema) ? (
        <div className="flex items-center gap-2">
          <Button
            // Text that is not a table stays text; switching would drop it.
            disabled={view === 'text' && readPriceTable(props.expression, props.schema) === null}
            onClick={() => {
              if (view === 'text') {
                const next = readPriceTable(props.expression, props.schema)
                setTable(next)
                setCellIssues(next === null ? [] : writePriceTable(next, props.schema).issues)
              }
              setView(view === 'table' ? 'text' : 'table')
            }}
            size="sm"
            variant="quiet"
          >
            {view === 'table' ? t('Edit as expression') : t('Use the price table')}
          </Button>
          {view === 'text' && readPriceTable(props.expression, props.schema) === null ? (
            <span className="text-xs text-muted">{t('This price does not fit the table, so it is edited as text.')}</span>
          ) : null}
        </div>
      ) : null}

      {view === 'table' && table !== null ? (
        <div className="overflow-x-auto">
          <table aria-label={t('Price table for {{plugin}}', { plugin: props.variant.plugin_name })} className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {table.rows.some((row) => Object.keys(row.combination).length > 0) ? <th className="py-1 pr-2 font-medium">{t('When')}</th> : null}
                <th className="py-1 pr-2 font-medium">{t('Per task (USD)')}</th>
                {fields.map(([field, definition]) => (
                  <th className="py-1 pr-2 font-medium" key={field}>
                    <span className="mono">{field}</span> · {unitText(definition, i18n.language, t)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => {
                const when = Object.entries(row.combination)
                  .map(([field, value]) => `${field} = ${enumLabel(props.schema[field], value, i18n.language)}`)
                  .join(', ')
                const setRow = (patch: Partial<typeof row>) => editTable({ rows: table.rows.map((item, at) => (at === index ? { ...item, ...patch } : item)) })
                return (
                  <tr className="border-t border-border" key={index}>
                    {when ? <td className="py-2 pr-2 text-xs text-foreground">{when}</td> : null}
                    <td className="py-2 pr-2">
                      <Input
                        hideLabel
                        inputMode="decimal"
                        invalid={showCell(`${index}:constant`)}
                        label={t('Per-task price, row {{row}}', { row: index + 1 })}
                        onChange={(event) => setRow({ constant: event.target.value })}
                        placeholder={t('None')}
                        size="sm"
                        value={row.constant}
                      />
                    </td>
                    {fields.map(([field]) => (
                      <td className="py-2 pr-2" key={field}>
                        <Input
                          hideLabel
                          inputMode="decimal"
                          invalid={showCell(`${index}:${field}`)}
                          label={t('{{field}} price, row {{row}}', { field, row: index + 1 })}
                          onChange={(event) => setRow({ unitPrices: { ...row.unitPrices, [field]: event.target.value } })}
                          size="sm"
                          value={row.unitPrices[field] ?? ''}
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {props.showProblems && cellIssues.length > 0 ? (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {t('Enter every unit price — 0 for free — with no negative values.')}
            </p>
          ) : null}
        </div>
      ) : (
        <Textarea
          description={t('A task expression: read usage with u("field"), for example tier("base", u("seconds") * 0.1). Chat token variables and fixed() cannot price tasks.')}
          error={props.showProblems && props.expression.trim() === '' ? t('Enter a price for this plugin.') : undefined}
          label={t('Plugin price expression')}
          onChange={(event) => props.onChange(event.target.value)}
          rows={4}
          spellCheck={false}
          textareaClassName="mono text-xs"
          value={props.expression}
        />
      )}

      {compatible === false ? (
        <Alert tone="warning">{t('This price reads something this plugin does not report, so the server will refuse it.')}</Alert>
      ) : null}

      {examples.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted">{t('Example tasks at this price')}</p>
          <ul className="flex flex-col gap-0.5 text-xs text-foreground">
            {examples.map((example) => (
              <li key={example.label}>
                {example.label}: ${formatPrice(example.total)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function unitText(definition: BillingUsageFieldSchema, language: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (definition.unit === 'token') return t('USD / 1M tokens')
  if (definition.unit === 'second') return t('USD / second')
  if (definition.unit === 'credit') return t('USD / credit')
  const label = localizedText(definition.unitLabel, language)
  return label ? t('USD / {{unit}}', { unit: label }) : t('USD / unit')
}

function enumLabel(definition: BillingUsageFieldSchema | undefined, value: string, language: string): string {
  return localizedText(definition?.enumLabels?.[value], language) || value
}

/** What the plugin reports for each task, so a price can be written against it. */
function UsageFields(props: { schema: BillingUsageSchema }) {
  const { i18n, t } = useTranslation()
  const entries = Object.entries(props.schema).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) return null
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer">{t('Usage this plugin reports')}</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {entries.map(([field, definition]) => (
          <li key={field}>
            <span className="mono text-foreground">u("{field}")</span>
            {definition.enum?.length ? ` · ${definition.enum.map((value) => enumLabel(definition, value, i18n.language)).join(' / ')}` : ''}
            {definition.unit ? ` · ${definition.unit}` : ''}
            {localizedText(definition.description, i18n.language) ? ` — ${localizedText(definition.description, i18n.language)}` : ''}
          </li>
        ))}
      </ul>
    </details>
  )
}
