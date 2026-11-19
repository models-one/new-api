import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ArrowRightLeftIcon from 'lucide-react/dist/esm/icons/arrow-right-left'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'

import { Input, NumberInput, RadioGroup, Textarea, type RadioOption } from '@/components/form'
import { ConfirmDialog, Dialog, toErrorMessage } from '@/components/overlay'
import { Alert, Badge, Button, Panel, SegmentedControl } from '@/components/ui'
import { TaskPluginPrices } from '@/features/system-settings/billing/components/TaskPluginPrices'
import { TieredExpressionEditor, type TieredResult } from '@/features/system-settings/billing/components/TieredExpressionEditor'
import {
  convertModelPricing,
  LEGACY_RATIO_KEYS,
  ModelPricingConflictError,
  saveModelPricingChanges,
  type LegacyRatioKey,
  type ModelPricingEntry,
  type ModelPricingIssue,
  type PricingConversion,
} from '@/features/system-settings/billing/model-pricing-api'
import {
  draftFromEntry,
  flatExpression,
  formatPrice,
  parseFlatExpression,
  pricingFromDraft,
  ratioToUsdPerMillion,
  samePricing,
  type DraftProblem,
  type FlatPrices,
  type PricingDraft,
  type PricingMode,
} from '@/features/system-settings/billing/model-pricing-draft'
import { blankTieredDraft, readTieredDraft, type TieredDraft } from '@/features/system-settings/billing/tiered-expression'
import { parseTieredBilling, formatTierCondition } from '@/features/pricing/tiered-billing'

const RATIO_LABELS: Record<LegacyRatioKey, string> = {
  AudioCompletionRatio: 'Audio output ratio',
  AudioRatio: 'Audio input ratio',
  CacheRatio: 'Cache read ratio',
  CompletionRatio: 'Completion ratio',
  CreateCacheRatio: 'Cache write ratio',
  ImageRatio: 'Image input ratio',
  ModelRatio: 'Model ratio',
}

/** How an expression is edited: three flat prices, ordered rules, or the text itself. */
type ExpressionView = 'simple' | 'tiered' | 'text'

function initialView(expression: string): ExpressionView {
  if (expression.trim() === '' || parseFlatExpression(expression) !== null) return 'simple'
  return readTieredDraft(expression) === null ? 'text' : 'tiered'
}

type ModelPricingEditorProps = {
  /** The model being edited; undefined adds a model. */
  entry: ModelPricingEntry | undefined
  /** The version of a model with nothing stored, for a new model. */
  emptyVersion: string
  /** Names already priced, so a new model cannot silently replace one. */
  existingNames: readonly string[]
  /** A name to start a new model with, such as an unpriced model a channel serves. */
  initialName?: string
  /** The task plugins that cannot charge this model, as the server reports them. */
  issues: readonly ModelPricingIssue[]
  quotaPerUnit: number
  onClose: () => void
  /** Called after a save or reset was stored; the list reloads. */
  onSaved: (modelName: string) => void
  /** Reloads the list after a conflict, so the editor can be opened on the latest values. */
  onReload: () => void
}

/**
 * Edits one model's price through `PATCH /api/option/model_pricing`. Mounted once per
 * opening, so a closed editor keeps no draft.
 */
export function ModelPricingEditor(props: ModelPricingEditorProps) {
  const { t } = useTranslation()
  const isNew = props.entry === undefined
  const configured = props.entry?.configured ?? {}
  const [name, setName] = useState(props.entry?.model_name ?? props.initialName ?? '')
  const [draft, setDraft] = useState<PricingDraft>(() => draftFromEntry(props.entry))
  const [showProblems, setShowProblems] = useState(false)
  const [view, setView] = useState<ExpressionView>(() => initialView(draft.expression))
  // The tiered view's own draft, read when the view opens; null when it is not open.
  const [tieredStart, setTieredStart] = useState<TieredDraft | null>(() => (view === 'tiered' ? readTieredDraft(draft.expression) : null))
  const [tieredResult, setTieredResult] = useState<TieredResult>({ issues: [] })
  const [tieredKey, setTieredKey] = useState(0)
  const [flat, setFlat] = useState<FlatPrices>(() => parseFlatExpression(draft.expression) ?? { cacheRead: '', input: '', output: '' })
  const [conversion, setConversion] = useState<PricingConversion | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const modelName = name.trim()
  const duplicate = isNew && props.existingNames.includes(modelName)
  // What the editor opened with. A built-in price it was only shown is not a change, so
  // saving it untouched would store the built-in price as an override.
  const [opened] = useState(() => pricingFromDraft(draftFromEntry(props.entry)).values ?? configured)
  const result = pricingFromDraft(draft)
  const unchanged = !isNew && result.values !== undefined && samePricing(result.values, opened)

  const saveMutation = useMutation({
    mutationFn: (request: { reset: boolean }) =>
      saveModelPricingChanges([
        {
          expected_version: props.entry?.version ?? props.emptyVersion,
          model_name: modelName,
          pricing: request.reset ? {} : (result.values ?? {}),
          ...(request.reset ? { reset: true } : {}),
        },
      ]),
    onSuccess: () => props.onSaved(modelName),
  })

  const convertMutation = useMutation({
    mutationFn: () => {
      // The legacy draft as typed, with its mode, is what the server converts.
      const legacy = pricingFromDraft(draft)
      if (legacy.values === undefined) throw new Error('draft has a problem')
      return convertModelPricing(modelName, legacy.values)
    },
    onSuccess: setConversion,
  })

  function update(patch: Partial<PricingDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setConversion(null)
    saveMutation.reset()
  }

  function updateFlat(patch: Partial<FlatPrices>) {
    const next = { ...flat, ...patch }
    setFlat(next)
    update({ expression: flatExpression(next) ?? '' })
  }

  function problemText(problem: DraftProblem | undefined, field: DraftProblem['field']): string | undefined {
    if (!showProblems || problem === undefined || problem.field !== field) return undefined
    if (problem.reason === 'invalid') return t('Enter a finite, non-negative price')
    if (field === 'expression') return view === 'simple' ? t('Enter the input and output prices.') : t('An expression is required in this mode.')
    if (field === 'modelPrice') return t('Enter the price of one request.')
    return t('Enter the model ratio.')
  }

  function save() {
    setShowProblems(true)
    if (modelName === '' || duplicate || result.values === undefined || unchanged || tieredBlocked) return
    saveMutation.mutate({ reset: false })
  }

  // An incomplete tiered draft keeps the last complete expression in `draft`; it must not be saved.
  const tieredBlocked = draft.mode === 'expression' && view === 'tiered' && tieredResult.issues.length > 0

  /** Opens the tiered view afresh on an expression; its unfinished edits, if any, are dropped. */
  function startTiered(expression: string) {
    setTieredStart(expression.trim() === '' ? blankTieredDraft() : readTieredDraft(expression))
    setTieredResult({ issues: [] })
    setTieredKey((key) => key + 1)
  }

  function openView(next: ExpressionView) {
    if (next === view) return
    if (next === 'simple') setFlat(parseFlatExpression(draft.expression) ?? { cacheRead: '', input: '', output: '' })
    if (next === 'tiered') startTiered(draft.expression)
    setView(next)
  }

  function updateTiered(next: TieredResult) {
    setTieredResult(next)
    if (next.expression !== undefined) update({ expression: next.expression })
    else saveMutation.reset()
  }

  const conflict = saveMutation.error instanceof ModelPricingConflictError
  const modeOptions: RadioOption<PricingMode>[] = [
    {
      description: t('Prices in USD per 1M tokens, with tiers and request rules when needed.'),
      label: (
        <span className="flex items-center gap-2">
          {t('Expression')}
          <Badge tone="success">{t('Recommended')}</Badge>
        </span>
      ),
      value: 'expression',
    },
    {
      description: t('Ratios against the quota unit. Kept for existing prices.'),
      label: (
        <span className="flex items-center gap-2">
          {t('Per token')}
          <Badge tone="muted">{t('Deprecated')}</Badge>
        </span>
      ),
      value: 'per-token',
    },
    {
      description: t('A fixed USD price for each request. Kept for existing prices.'),
      label: (
        <span className="flex items-center gap-2">
          {t('Per request')}
          <Badge tone="muted">{t('Deprecated')}</Badge>
        </span>
      ),
      value: 'per-request',
    },
  ]

  const tiers = draft.mode === 'expression' && view === 'text'
    ? parseTieredBilling({ billing_expr: draft.expression, billing_mode: 'tiered_expr' } as Parameters<typeof parseTieredBilling>[0])
    : undefined
  const baseRatio = Number(draft.ratios.ModelRatio)
  const inputUsd = draft.ratios.ModelRatio.trim() !== '' && Number.isFinite(baseRatio)
    ? ratioToUsdPerMillion(baseRatio, props.quotaPerUnit)
    : null
  const plugins = props.entry?.plugin_variants ?? []
  const canUseSimplePrices = draft.expression.trim() === '' || parseFlatExpression(draft.expression) !== null
  const canUseTiered = draft.expression.trim() === '' || readTieredDraft(draft.expression) !== null

  return (
    <>
      <Dialog
        footer={
          <>
            {isNew || Object.keys(configured).length === 0 ? null : (
              <Button className="mr-auto" disabled={saveMutation.isPending} onClick={() => setConfirmReset(true)} variant="quiet">
                {t('Restore default price')}
              </Button>
            )}
            <Button disabled={saveMutation.isPending} onClick={props.onClose} variant="outline">
              {t('Cancel')}
            </Button>
            <Button aria-busy={saveMutation.isPending} disabled={saveMutation.isPending || (unchanged && !tieredBlocked)} onClick={save} variant="primary">
              {saveMutation.isPending ? t('Saving…') : t('Save')}
            </Button>
          </>
        }
        onOpenChange={(open) => (open || saveMutation.isPending ? undefined : props.onClose())}
        open
        scrollBody
        // Rules with conditions need the room; the other views fit the narrow dialog.
        size={draft.mode === 'expression' && view === 'tiered' ? 'lg' : 'md'}
        title={isNew ? t('Price a model') : t('Price of {{model}}', { model: modelName })}
      >
        <div className="flex flex-col gap-5">
          {isNew ? (
            <Input
              // A name handed over by the unpriced list is the model being priced; it is not retyped.
              disabled={props.initialName !== undefined}
              error={(() => {
                if (duplicate) return t('This model already has pricing configured.')
                if (showProblems && modelName === '') return t('A model name is required.')
                return undefined
              })()}
              inputClassName="mono"
              label={t('Model name')}
              onChange={(event) => setName(event.target.value)}
              placeholder="gpt-4o"
              required
              value={name}
            />
          ) : null}

          {!isNew && Object.keys(configured).length === 0 ? (
            <Alert tone="info">{t('Nothing is stored for this model; it bills at the built-in or default price shown here. Saving stores your price instead.')}</Alert>
          ) : null}

          <RadioGroup<PricingMode>
            label={t('Billing mode')}
            onValueChange={(mode) => {
              // The tiered view is unmounted outside expression mode; it reopens on the last complete expression.
              if (mode === 'expression' && view === 'tiered') startTiered(draft.expression)
              update({ mode })
            }}
            options={modeOptions}
            value={draft.mode}
            variant="card"
          />

          {draft.mode === 'expression' ? (
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <SegmentedControl<ExpressionView>
                  label={t('Edit the expression as')}
                  onChange={openView}
                  options={[
                    { disabled: tieredBlocked || !canUseSimplePrices, id: 'simple', label: t('Simple prices') },
                    { disabled: tieredBlocked || !canUseTiered, id: 'tiered', label: t('Tiered') },
                    { disabled: tieredBlocked, id: 'text', label: t('Text') },
                  ]}
                  size="sm"
                  value={view}
                />
                {tieredBlocked ? (
                  <span className="text-xs text-muted">{t('Finish or undo the incomplete fields below before switching views or saving.')}</span>
                ) : null}
                {!tieredBlocked && !canUseTiered ? (
                  <span className="text-xs text-muted">{t('This expression uses functions the tiered view cannot show without losing information, so it is edited as text.')}</span>
                ) : null}
                {!tieredBlocked && canUseTiered && !canUseSimplePrices && view !== 'simple' ? (
                  <span className="text-xs text-muted">{t('Simple prices fit one flat tier only; this expression has tiers or rules.')}</span>
                ) : null}
              </div>

              {view === 'text' ? (
                <>
                  <Textarea
                    description={t('Coefficients are USD per 1M tokens, for example tier("base", p * 2.5 + c * 15 + cr * 0.25). Request rules follow |||. The server compiles and tests the expression when it is saved.')}
                    error={problemText(result.problem, 'expression')}
                    label={t('Billing expression')}
                    onChange={(event) => update({ expression: event.target.value })}
                    rows={6}
                    spellCheck={false}
                    textareaClassName="mono text-xs"
                    value={draft.expression}
                  />
                  {tiers?.parsed ? (
                    <ul aria-label={t('Tiers')} className="flex flex-col gap-1 text-xs text-muted">
                      {tiers.tiers.map((tier, index) => (
                        <li key={`${tier.label}-${index}`}>
                          <span className="font-medium text-foreground">{tier.label || t('Tier {{index}}', { index: index + 1 })}</span>
                          {tier.conditions.length > 0 ? ` · ${tier.conditions.map(formatTierCondition).join(' && ')}` : ''}
                          {' · '}
                          {tier.prices.map((price) => `${t(price.variable.labelKey)} $${formatPrice(price.perMillion)}`).join(', ')}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}

              {view === 'tiered' && tieredStart !== null ? (
                <TieredExpressionEditor initialDraft={tieredStart} key={tieredKey} onChange={updateTiered} showIssues={showProblems} />
              ) : null}

              {view === 'simple' ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberInput
                    error={problemText(result.problem, 'expression')}
                    label={t('Input (USD / 1M tokens)')}
                    min={0}
                    onChange={(event) => updateFlat({ input: event.target.value })}
                    step="any"
                    value={flat.input}
                  />
                  <NumberInput
                    label={t('Output (USD / 1M tokens)')}
                    min={0}
                    onChange={(event) => updateFlat({ output: event.target.value })}
                    step="any"
                    value={flat.output}
                  />
                  <NumberInput
                    description={t('Optional. Empty bills cached input at the input price.')}
                    label={t('Cached input (USD / 1M tokens)')}
                    min={0}
                    onChange={(event) => updateFlat({ cacheRead: event.target.value })}
                    step="any"
                    value={flat.cacheRead}
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          {draft.mode === 'per-request' ? (
            <NumberInput
              error={problemText(result.problem, 'modelPrice')}
              label={t('Price per request (USD)')}
              min={0}
              onChange={(event) => update({ modelPrice: event.target.value })}
              step="any"
              value={draft.modelPrice}
            />
          ) : null}

          {draft.mode === 'per-token' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {LEGACY_RATIO_KEYS.map((key) => (
                <NumberInput
                  description={
                    key === 'ModelRatio' && inputUsd !== null
                      ? t('Input ${{price}} per 1M tokens at this deployment’s quota unit.', { price: formatPrice(inputUsd) })
                      : undefined
                  }
                  error={problemText(result.problem, key)}
                  key={key}
                  label={t(RATIO_LABELS[key])}
                  min={0}
                  onChange={(event) =>
                    update({ ratios: { ...draft.ratios, [key]: event.target.value } })
                  }
                  placeholder={key === 'ModelRatio' ? undefined : t('Default')}
                  step="any"
                  value={draft.ratios[key]}
                />
              ))}
            </div>
          ) : null}

          {draft.mode !== 'expression' ? (
            <Panel className="flex flex-col gap-3 p-4" muted>
              <p className="text-sm text-muted">
                {t('Legacy prices still run. Converting writes the same price as an expression, which you can then extend with tiers or rules.')}
              </p>
              <div>
                <Button
                  aria-busy={convertMutation.isPending}
                  disabled={convertMutation.isPending || modelName === '' || result.values === undefined}
                  onClick={() => convertMutation.mutate()}
                  size="sm"
                  variant="outline"
                >
                  <ArrowRightLeftIcon aria-hidden="true" />
                  {t('Convert to expression')}
                </Button>
              </div>
              {convertMutation.isError ? <Alert tone="destructive">{toErrorMessage(convertMutation.error)}</Alert> : null}
              {conversion?.unsupported_reason ? <Alert tone="warning">{t(conversion.unsupported_reason)}</Alert> : null}
              {conversion?.expression ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted">{t('The same price as an expression:')}</p>
                  <pre className="mono overflow-x-auto rounded-md border border-border bg-surface p-3 text-xs break-all whitespace-pre-wrap">{conversion.expression}</pre>
                  <div>
                    <Button
                      onClick={() => {
                        const expression = conversion.expression ?? ''
                        const parsed = parseFlatExpression(expression)
                        const next = initialView(expression)
                        if (parsed !== null) setFlat(parsed)
                        if (next === 'tiered') startTiered(expression)
                        setView(next)
                        update({ expression, mode: 'expression' })
                      }}
                      size="sm"
                      variant="primary"
                    >
                      {t('Use this expression')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </Panel>
          ) : null}

          <TaskPluginPrices
            draft={draft}
            issues={props.issues}
            onChange={(plugins) => update({ plugins })}
            showProblems={showProblems}
            variants={plugins}
          />

          {showProblems && unchanged ? <p className="text-sm text-muted">{t('Nothing has changed.')}</p> : null}
          {conflict ? (
            <Alert
              action={
                <Button onClick={props.onReload} size="sm" variant="outline">
                  {t('Reload')}
                </Button>
              }
              icon={<TriangleAlertIcon aria-hidden="true" />}
              title={t('This price was changed elsewhere')}
              tone="warning"
            >
              {t('Someone saved this model’s price after you opened it. Reload to see the latest price, then make your change again.')}
            </Alert>
          ) : null}
          {saveMutation.isError && !conflict ? <Alert tone="destructive">{toErrorMessage(saveMutation.error)}</Alert> : null}
        </div>
      </Dialog>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Restore default price')}
        description={t('Everything stored for {{model}} is removed, including its plugin prices. It then bills at the built-in price, or at the default if there is none.', { model: modelName })}
        destructive
        isLoading={saveMutation.isPending}
        onConfirm={() => {
          setConfirmReset(false)
          saveMutation.mutate({ reset: true })
        }}
        onOpenChange={setConfirmReset}
        open={confirmReset}
        title={t('Restore the default price?')}
      />
    </>
  )
}
