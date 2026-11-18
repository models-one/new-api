import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down'
import ArrowUpIcon from 'lucide-react/dist/esm/icons/arrow-up'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import XIcon from 'lucide-react/dist/esm/icons/x'

import { Input, NativeSelect } from '@/components/form'
import { Alert, Badge, Button, Panel, SegmentedControl } from '@/components/ui'
import { PRICING_TEMPLATES } from '@/features/system-settings/billing/pricing-templates'
import {
  addRule,
  fromRuleChain,
  issuesOf,
  moveRule,
  pricingIds,
  readTieredDraft,
  removeRule,
  ruleChain,
  writeTieredDraft,
  type TierNode,
  type TieredDraft,
  type TieredIssue,
} from '@/features/system-settings/billing/tiered-expression'
import {
  BILLING_PRICING_VARS,
  createEmptyCondition,
  createEmptyTimeCondition,
  getRequestRuleMatchOptions,
  MATCH_EXISTS,
  MATCH_RANGE,
  TIME_FUNCS,
  type RequestCondition,
  type RequestRuleGroup,
  type TimeFunc,
} from '@/lib/billing-expression/billing-expr'
import { formatBillingCondition } from '@/lib/billing-expression/condition-display'
import {
  createEmptyVisualCondition,
  visualConditionExpression,
  visualNodeId,
  type VisualComparison,
  type VisualCondition,
  type VisualPrice,
  type VisualPricingNode,
} from '@/lib/billing-expression/visual'

/**
 * The tiered view of a billing expression: ordered price rules — the first whose condition
 * matches sets the price, the last one has no condition — and request multipliers applied
 * on top. Every change is written back through `tiered-expression.ts`; the parent receives
 * either the expression to store or the problems that stop one being written.
 */

export type TieredResult = { expression?: string; issues: TieredIssue[] }

type TieredExpressionEditorProps = {
  /** Read once, when the view opens. */
  initialDraft: TieredDraft
  showIssues: boolean
  onChange: (result: TieredResult) => void
}

type PriceVariable = VisualPrice['variable']

const PRICE_LABELS = Object.fromEntries(BILLING_PRICING_VARS.map((variable) => [variable.key, variable.label])) as Record<PriceVariable, string>
const PROBES: Array<{ value: VisualComparison['probe']; label: string }> = [
  { label: 'Input tokens', value: 'p' },
  { label: 'Output tokens', value: 'c' },
  { label: 'Full input length', value: 'len' },
  { label: 'Hour', value: 'hour' },
  { label: 'Minute', value: 'minute' },
  { label: 'Weekday', value: 'weekday' },
  { label: 'Month', value: 'month' },
  { label: 'Day', value: 'day' },
]
const TOKEN_PROBES = new Set(['p', 'c', 'len'])
const OPERATORS: VisualComparison['operator'][] = ['<', '<=', '>', '>=', '==', '!=']

export function TieredExpressionEditor(props: TieredExpressionEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(props.initialDraft)
  const [result, setResult] = useState<TieredResult>(() => writeTieredDraft(props.initialDraft))

  function update(next: TieredDraft) {
    const written = writeTieredDraft(next)
    setDraft(next)
    setResult(written)
    props.onChange(written)
  }

  const issues = props.showIssues ? result.issues : []
  const setRoot = (root: VisualPricingNode) => update({ ...draft, document: { ...draft.document, root } })

  return (
    <div className="flex flex-col gap-5">
      <NativeSelect
        description={t('Replaces the price below. Check every figure before saving: a template is a starting point, not the vendor’s current price.')}
        label={t('Start from a template')}
        onChange={(event) => {
          const template = PRICING_TEMPLATES.flatMap((group) => group.templates).find((item) => item.key === event.target.value)
          const next = template === undefined ? null : readTieredDraft(template.expression)
          if (next !== null) update({ ...next, rulesEdited: true })
        }}
        size="sm"
        value=""
      >
        <option value="">{t('Choose a template')}</option>
        {PRICING_TEMPLATES.map((group) => (
          <optgroup key={group.group} label={t(group.group)}>
            {group.templates.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ))}
      </NativeSelect>

      <section aria-label={t('Price rules')} className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('Price rules')}</h3>
          <p className="text-xs leading-5 text-muted">
            {t('Checked from top to bottom; the first rule whose condition matches sets the price. Token prices are USD per 1M tokens.')}
          </p>
        </div>
        <RuleList issues={issues} node={draft.document.root} onChange={setRoot} source={draft.document.source} />
      </section>

      <RequestRules draft={draft} issues={issues} onChange={update} />

      {draft.document.imageCount ? <p className="text-xs text-muted">{t('The price is multiplied by the number of images requested.')}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Price rules
// ---------------------------------------------------------------------------

type NodeProps = {
  node: VisualPricingNode
  source: string
  issues: readonly TieredIssue[]
  onChange: (node: VisualPricingNode) => void
}

function RuleList(props: NodeProps & { nested?: boolean }) {
  const { t } = useTranslation()
  const chain = ruleChain(props.node)

  function replaceResult(index: number, result: VisualPricingNode) {
    props.onChange(fromRuleChain(chain.map((entry, position) => (position === index ? { ...entry, result } : entry))))
  }

  return (
    <ol className={`flex flex-col gap-3 ${props.nested ? 'border-l-2 border-border pl-3' : ''}`}>
      {chain.map((entry, index) => {
        const last = entry.branch === null
        const owned = last ? pricingIds(entry.result) : pricingIds(entry.branch!)
        const ruleIssues = props.issues.filter((issue) => owned.has(issue.id.split(':')[0]))
        return (
          <li key={entry.branch?.id ?? `default-${entry.result.id}`}>
            <Panel className="flex flex-col gap-3 p-3" muted={!props.nested}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={last ? 'muted' : 'info'}>{last ? t('Otherwise') : t('Rule {{number}}', { number: index + 1 })}</Badge>
                {ruleIssues.length > 0 ? <Badge tone="destructive">{t('Needs attention')}</Badge> : null}
                {entry.branch === null ? (
                  <span className="text-xs text-muted">{chain.length === 1 ? t('Always applies.') : t('Applies when no rule above matches.')}</span>
                ) : (
                  <span className="ml-auto flex items-center gap-1">
                    <Button
                      aria-label={t('Move rule {{number}} up', { number: index + 1 })}
                      disabled={index === 0}
                      onClick={() => props.onChange(moveRule(props.node, entry.branch!.id, -1))}
                      size="icon-sm"
                      variant="quiet"
                    >
                      <ArrowUpIcon aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={t('Move rule {{number}} down', { number: index + 1 })}
                      disabled={index >= chain.length - 2}
                      onClick={() => props.onChange(moveRule(props.node, entry.branch!.id, 1))}
                      size="icon-sm"
                      variant="quiet"
                    >
                      <ArrowDownIcon aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={t('Remove rule {{number}}', { number: index + 1 })}
                      onClick={() => props.onChange(removeRule(props.node, entry.branch!.id))}
                      size="icon-sm"
                      variant="quiet"
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </span>
                )}
              </div>

              {entry.branch === null ? null : (
                <ConditionBlock
                  condition={entry.branch.condition}
                  issues={props.issues}
                  onChange={(condition) =>
                    props.onChange(fromRuleChain(chain.map((item, position) => (position === index ? { ...item, branch: { ...entry.branch!, condition } } : item))))
                  }
                  source={props.source}
                />
              )}

              <ResultNode issues={props.issues} node={entry.result} onChange={(result) => replaceResult(index, result)} source={props.source} />
            </Panel>
          </li>
        )
      })}
      <li>
        <Button onClick={() => props.onChange(addRule(props.node))} size="sm" variant="outline">
          <PlusIcon aria-hidden="true" />
          {t('Add a rule')}
        </Button>
      </li>
    </ol>
  )
}

/** A rule's price: a tier, or a nested list of rules. */
function ResultNode(props: NodeProps) {
  const { t } = useTranslation()
  if (props.node.kind === 'branch') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted">{t('Then, within this rule:')}</p>
        <RuleList {...props} nested />
      </div>
    )
  }
  return <TierFields {...props} node={props.node} />
}

function TierFields(props: Omit<NodeProps, 'node'> & { node: TierNode }) {
  const { t } = useTranslation()
  const { node } = props
  const issues = issuesOf(props.issues, node.id)
  const fieldIssue = (field: string) => {
    const issue = issues.find((item) => item.id === `${node.id}:${field}`)
    return issue === undefined ? undefined : t(issue.message)
  }
  const unused = BILLING_PRICING_VARS.filter((variable) => !node.prices.some((price) => price.variable === variable.key))

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Input
          description={t('Shown in usage logs as the tier a request was billed at.')}
          inputClassName="mono"
          label={t('Tier name')}
          onChange={(event) => props.onChange({ ...node, label: event.target.value })}
          size="sm"
          value={node.label}
        />
        <SegmentedControl
          label={t('Billed per')}
          onChange={(billingUnit) =>
            props.onChange({
              ...node,
              billingUnit,
              // A newly priced side starts empty: free is typed as 0, never defaulted.
              prices: billingUnit === 'token' && node.prices.length === 0 ? [{ value: '', variable: 'p' }, { value: '', variable: 'c' }] : node.prices,
            })
          }
          options={[
            { id: 'token', label: t('Per token') },
            { id: 'request', label: t('Per request') },
          ]}
          size="sm"
          value={node.billingUnit}
        />
      </div>

      {node.billingUnit === 'request' ? (
        <Input
          error={fieldIssue('fixed')}
          inputMode="decimal"
          label={t('Price per request (USD)')}
          onChange={(event) => props.onChange({ ...node, fixedPrice: event.target.value })}
          size="sm"
          value={node.fixedPrice}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {node.prices.map((price) => (
            <div className="flex items-start gap-1" key={price.variable}>
              <Input
                className="min-w-0 flex-1"
                error={fieldIssue(price.variable)}
                inputMode="decimal"
                label={`${t(PRICE_LABELS[price.variable])} (USD / 1M)`}
                onChange={(event) =>
                  props.onChange({ ...node, prices: node.prices.map((item) => (item.variable === price.variable ? { ...item, value: event.target.value } : item)) })
                }
                size="sm"
                value={price.value}
              />
              <Button
                aria-label={t('Remove {{name}}', { name: t(PRICE_LABELS[price.variable]) })}
                className="mt-6"
                onClick={() => props.onChange({ ...node, prices: node.prices.filter((item) => item.variable !== price.variable) })}
                size="icon-sm"
                variant="quiet"
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          ))}
          {unused.length > 0 ? (
            <NativeSelect
              label={t('Add a price')}
              onChange={(event) => {
                if (event.target.value !== '') {
                  props.onChange({ ...node, prices: [...node.prices, { value: '', variable: event.target.value as PriceVariable }] })
                }
              }}
              size="sm"
              value=""
            >
              <option value="">{t('Choose a token type')}</option>
              {unused.map((variable) => (
                <option key={variable.key} value={variable.key}>
                  {t(variable.label)}
                </option>
              ))}
            </NativeSelect>
          ) : null}
        </div>
      )}

      {issues.filter((issue) => issue.id === node.id).map((issue) => (
        <p className="text-xs text-destructive" key={issue.message} role="alert">
          {t(issue.message)}
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

type ConditionProps = {
  condition: VisualCondition
  source: string
  issues: readonly TieredIssue[]
  onChange: (condition: VisualCondition) => void
}

/** A rule's condition, with a plain-language reading of it above the controls. */
function ConditionBlock(props: ConditionProps) {
  const { i18n, t } = useTranslation()
  // Null while the condition is incomplete; then there is nothing to read out yet.
  const expression = visualConditionExpression(props.condition, props.source)
  const reading = expression === null ? null : formatBillingCondition(expression, t, i18n.language)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{reading ? t('When {{condition}}', { condition: reading }) : t('When')}</p>
      <ConditionNode {...props} root />
    </div>
  )
}

function ConditionNode(props: ConditionProps & { root?: boolean; onRemove?: () => void }) {
  const { t } = useTranslation()
  const { condition } = props
  const issues = issuesOf(props.issues, condition.id).filter((issue) => issue.id === condition.id)

  const negate = () => props.onChange({ child: condition, id: visualNodeId(), kind: 'not' })
  const actions = (
    <span className="flex items-center gap-1">
      {condition.kind === 'not' ? (
        <Button onClick={() => props.onChange(condition.child)} size="sm" variant="quiet">
          {t('Remove “not”')}
        </Button>
      ) : (
        <Button onClick={negate} size="sm" variant="quiet">
          {t('Negate')}
        </Button>
      )}
      {props.onRemove ? (
        <Button aria-label={t('Remove this condition')} onClick={props.onRemove} size="icon-sm" variant="quiet">
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </span>
  )

  if (condition.kind === 'comparison') {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start gap-2">
          <Comparison condition={condition} invalid={issues.length > 0} onChange={props.onChange} />
          {props.root ? (
            <Button
              onClick={() => props.onChange({ children: [condition, createEmptyVisualCondition()], id: visualNodeId(), kind: 'all' })}
              size="sm"
              variant="quiet"
            >
              {t('And…')}
            </Button>
          ) : null}
          {actions}
        </div>
        <ConditionIssues issues={issues} />
      </div>
    )
  }

  if (condition.kind === 'not') {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/5 p-2">
        <div className="flex items-center gap-2">
          <Badge tone="warning">{t('Not')}</Badge>
          {actions}
        </div>
        <ConditionNode condition={condition.child} issues={props.issues} onChange={(child) => props.onChange({ ...condition, child })} source={props.source} />
      </div>
    )
  }

  const group = condition
  return (
    <div className={`flex flex-col gap-2 rounded-md border p-2 ${group.kind === 'all' ? 'border-info/40 bg-info/5' : 'border-primary/40 bg-primary/5'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          className="w-48"
          hideLabel
          label={t('How the conditions combine')}
          onChange={(event) => props.onChange({ ...group, kind: event.target.value as 'all' | 'any' })}
          options={[
            { label: t('All of these'), value: 'all' },
            { label: t('Any of these'), value: 'any' },
          ]}
          size="sm"
          value={group.kind}
        />
        {actions}
      </div>
      {group.children.map((child, index) => (
        <ConditionNode
          condition={child}
          issues={props.issues}
          key={child.id}
          onChange={(next) => props.onChange({ ...group, children: group.children.map((item, position) => (position === index ? next : item)) })}
          onRemove={() => props.onChange({ ...group, children: group.children.filter((_, position) => position !== index) })}
          source={props.source}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => props.onChange({ ...group, children: [...group.children, createEmptyVisualCondition()] })} size="sm" variant="outline">
          {t('Add condition')}
        </Button>
        <Button
          onClick={() =>
            props.onChange({
              ...group,
              children: [...group.children, { children: [createEmptyVisualCondition()], id: visualNodeId(), kind: group.kind === 'all' ? 'any' : 'all' }],
            })
          }
          size="sm"
          variant="quiet"
        >
          {t('Add group')}
        </Button>
      </div>
      <ConditionIssues issues={issues} />
    </div>
  )
}

function ConditionIssues(props: { issues: readonly TieredIssue[] }) {
  const { t } = useTranslation()
  return props.issues.map((issue) => (
    <p className="text-xs text-destructive" key={issue.message} role="alert">
      {t(issue.message)}
    </p>
  ))
}

function Comparison(props: { condition: VisualComparison; invalid: boolean; onChange: (condition: VisualComparison) => void }) {
  const { t } = useTranslation()
  const { condition } = props
  const time = !TOKEN_PROBES.has(condition.probe)
  return (
    <>
      <NativeSelect
        className="w-40"
        hideLabel
        label={t('Compared value')}
        onChange={(event) => props.onChange({ ...condition, probe: event.target.value as VisualComparison['probe'] })}
        options={PROBES.map((probe) => ({ label: t(probe.label), value: probe.value }))}
        size="sm"
        value={condition.probe}
      />
      {time ? (
        <Input
          className="w-40"
          hideLabel
          inputClassName="mono"
          label={t('Time zone')}
          onChange={(event) => props.onChange({ ...condition, timezone: event.target.value })}
          placeholder="Asia/Shanghai"
          size="sm"
          value={condition.timezone}
        />
      ) : null}
      <NativeSelect
        className="w-20"
        hideLabel
        label={t('Comparison')}
        onChange={(event) => props.onChange({ ...condition, operator: event.target.value as VisualComparison['operator'] })}
        options={OPERATORS.map((operator) => ({ label: operator, value: operator }))}
        size="sm"
        value={condition.operator}
      />
      <Input
        className="w-32"
        description={condition.probe === 'weekday' ? t('0 is Sunday') : undefined}
        hideLabel
        inputMode="numeric"
        invalid={props.invalid}
        label={t('Compared with')}
        onChange={(event) => props.onChange({ ...condition, value: event.target.value })}
        placeholder={time ? '0' : '32000'}
        size="sm"
        value={condition.value}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Request multipliers
// ---------------------------------------------------------------------------

function RequestRules(props: { draft: TieredDraft; issues: readonly TieredIssue[]; onChange: (draft: TieredDraft) => void }) {
  const { t } = useTranslation()
  const { draft } = props
  const setRules = (rules: RequestRuleGroup[]) => props.onChange({ ...draft, rules, rulesEdited: true })

  return (
    <section aria-label={t('Request multipliers')} className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t('Request multipliers')}</h3>
        <p className="text-xs leading-5 text-muted">
          {t('Multiply the price when a request matches, for example a priority tier or a night discount. Every condition of a multiplier must match; matching multipliers multiply together.')}
        </p>
      </div>

      {!draft.rulesEditable ? (
        <Alert tone="info">
          <p>{t('These multipliers use a form this view cannot show. They are kept exactly as written; edit them as text.')}</p>
          <pre className="mono mt-2 text-xs break-all whitespace-pre-wrap">{draft.rulesSource}</pre>
        </Alert>
      ) : (
        <>
          {draft.rules.map((rule, index) => {
            const ruleIssues = props.issues.filter((issue) => issue.id === `rule-${index}` || issue.id.startsWith(`rule-${index}:`))
            const multiplierIssue = ruleIssues.find((issue) => issue.id === `rule-${index}:multiplier`)
            const patchRule = (next: Partial<RequestRuleGroup>) => setRules(draft.rules.map((item, position) => (position === index ? { ...item, ...next } : item)))
            return (
              <Panel className="flex flex-col gap-3 p-3" key={index} muted>
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    className="w-40"
                    error={multiplierIssue ? t(multiplierIssue.message) : undefined}
                    inputMode="decimal"
                    label={t('Multiply the price by')}
                    onChange={(event) => patchRule({ multiplier: event.target.value })}
                    size="sm"
                    value={rule.multiplier}
                  />
                  <Button
                    aria-label={t('Remove multiplier {{number}}', { number: index + 1 })}
                    className="ml-auto"
                    onClick={() => setRules(draft.rules.filter((_, position) => position !== index))}
                    size="icon-sm"
                    variant="quiet"
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </div>
                <p className="text-xs font-medium text-muted">{t('When all of these match')}</p>
                {rule.conditions.map((condition, position) => (
                  <RequestConditionRow
                    condition={condition}
                    invalid={ruleIssues.some((issue) => issue.id === `rule-${index}:${position}`)}
                    key={position}
                    onChange={(next) => patchRule({ conditions: rule.conditions.map((item, at) => (at === position ? next : item)) })}
                    onRemove={() => patchRule({ conditions: rule.conditions.filter((_, at) => at !== position) })}
                  />
                ))}
                <div>
                  <Button onClick={() => patchRule({ conditions: [...rule.conditions, createEmptyCondition()] })} size="sm" variant="outline">
                    {t('Add condition')}
                  </Button>
                </div>
                {ruleIssues.filter((issue) => issue.id === `rule-${index}`).map((issue) => (
                  <p className="text-xs text-destructive" key={issue.message} role="alert">
                    {t(issue.message)}
                  </p>
                ))}
              </Panel>
            )
          })}
          <div>
            <Button onClick={() => setRules([...draft.rules, { conditions: [createEmptyCondition()], multiplier: '' }])} size="sm" variant="outline">
              <PlusIcon aria-hidden="true" />
              {t('Add a multiplier')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

const TIME_LABELS: Record<TimeFunc, string> = { day: 'Day', hour: 'Hour', minute: 'Minute', month: 'Month', weekday: 'Weekday' }

function RequestConditionRow(props: { condition: RequestCondition; invalid: boolean; onChange: (condition: RequestCondition) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const { condition } = props
  const modes = getRequestRuleMatchOptions(condition.source)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-start gap-2">
        <NativeSelect
          className="w-40"
          hideLabel
          label={t('Matched against')}
          onChange={(event) => {
            const source = event.target.value
            if (source === condition.source) return
            props.onChange(source === 'time' ? createEmptyTimeCondition() : { ...createEmptyCondition(), source: source as 'param' | 'header' })
          }}
          options={[
            { label: t('Request body field'), value: 'param' },
            { label: t('Request header'), value: 'header' },
            { label: t('Time'), value: 'time' },
          ]}
          size="sm"
          value={condition.source}
        />
        {condition.source === 'time' ? (
          <>
            <NativeSelect
              className="w-32"
              hideLabel
              label={t('Time unit')}
              onChange={(event) => props.onChange({ ...condition, timeFunc: event.target.value as TimeFunc })}
              options={TIME_FUNCS.map((name) => ({ label: t(TIME_LABELS[name]), value: name }))}
              size="sm"
              value={condition.timeFunc}
            />
            <Input
              className="w-40"
              hideLabel
              inputClassName="mono"
              label={t('Time zone')}
              onChange={(event) => props.onChange({ ...condition, timezone: event.target.value })}
              placeholder="Asia/Shanghai"
              size="sm"
              value={condition.timezone}
            />
          </>
        ) : (
          <Input
            className="w-48"
            hideLabel
            inputClassName="mono"
            label={condition.source === 'header' ? t('Header name') : t('Field path')}
            onChange={(event) => props.onChange({ ...condition, path: event.target.value })}
            placeholder={condition.source === 'header' ? 'anthropic-beta' : 'service_tier'}
            size="sm"
            value={condition.path}
          />
        )}
        <NativeSelect
          className="w-44"
          hideLabel
          label={t('Match')}
          onChange={(event) => props.onChange({ ...condition, mode: event.target.value })}
          options={modes.map((mode) => ({ label: t(mode.labelKey), value: mode.value }))}
          size="sm"
          value={condition.mode}
        />
        {condition.source === 'time' && condition.mode === MATCH_RANGE ? (
          <>
            <Input
              className="w-20"
              hideLabel
              inputMode="numeric"
              label={t('From')}
              onChange={(event) => props.onChange({ ...condition, rangeStart: event.target.value })}
              placeholder={t('From')}
              size="sm"
              value={condition.rangeStart}
            />
            <Input
              className="w-20"
              hideLabel
              inputMode="numeric"
              label={t('Until')}
              onChange={(event) => props.onChange({ ...condition, rangeEnd: event.target.value })}
              placeholder={t('Until')}
              size="sm"
              value={condition.rangeEnd}
            />
          </>
        ) : null}
        {condition.mode !== MATCH_EXISTS && !(condition.source === 'time' && condition.mode === MATCH_RANGE) ? (
          <Input
            className="w-40"
            hideLabel
            label={t('Value')}
            onChange={(event) => props.onChange({ ...condition, value: event.target.value })}
            placeholder={t('Value')}
            size="sm"
            value={condition.value}
          />
        ) : null}
        <Button aria-label={t('Remove this condition')} onClick={props.onRemove} size="icon-sm" variant="quiet">
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      {props.invalid ? (
        <p className="text-xs text-destructive" role="alert">
          {t('Complete this condition.')}
        </p>
      ) : null}
    </div>
  )
}
