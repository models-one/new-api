import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NumberInput, RadioGroup, Textarea, type RadioOption } from '@/components/form'
import { Dialog } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import {
  checkExpression,
  countTiers,
  emptyEdit,
  type BillingMode,
  type ModelPricingEdit,
} from '@/features/system-settings/billing/model-pricing'

/**
 * The per-model editor.
 *
 * The three billing modes are mutually exclusive upstream, so they are mutually exclusive
 * here: choosing one hides the other two's fields, and saving CLEARS the keys the chosen
 * mode does not use (see `applyModelEdit`). The legacy console left them all visible and
 * all writable at once, which is how a model ends up with both a fixed price and a set of
 * ratios and bills by the price while the ratios sit there looking authoritative.
 *
 * THE EXPRESSION FIELD IS THE DANGEROUS ONE. `PUT /api/option/` does not validate
 * `billing_setting.billing_expr` at all — verified live, the literal text "not json at all"
 * was accepted and stored. The expression is compiled only when a request is billed, so a
 * broken one is discovered by mispricing real traffic. The checks here are structural
 * (non-empty, balanced brackets, contains a `tier(` wrapper) and are honest about being
 * less than the compiler in `pkg/billingexpr`.
 */

type ModelPricingDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Undefined opens the dialog for a new model. */
  edit: ModelPricingEdit | undefined
  /** Names already configured, so the new-model path cannot silently overwrite one. */
  existingNames: readonly string[]
  onSubmit: (edit: ModelPricingEdit) => void
}

export function ModelPricingDialog(props: ModelPricingDialogProps) {
  const { t } = useTranslation()
  const isNew = props.edit === undefined
  const [draft, setDraft] = useState<ModelPricingEdit>(emptyEdit)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!props.open) return
    setDraft(props.edit ?? emptyEdit())
    setTouched(false)
  }, [props.edit, props.open])

  const set = <TKey extends keyof ModelPricingEdit>(key: TKey, value: ModelPricingEdit[TKey]) => {
    setTouched(true)
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const trimmedName = draft.name.trim()
  const duplicate = isNew && props.existingNames.includes(trimmedName)
  const exprProblem = draft.mode === 'tiered_expr' ? checkExpression(draft.expr) : undefined

  const nameError = ((): string | undefined => {
    if (!touched) return undefined
    if (trimmedName === '') return t('A model name is required.')
    if (duplicate) return t('This model already has pricing configured.')
    return undefined
  })()

  const exprError = ((): string | undefined => {
    if (!touched || exprProblem === undefined) return undefined
    if (exprProblem === 'empty') return t('An expression is required in this mode.')
    if (exprProblem === 'unbalanced') return t('Brackets or quotes are not balanced.')
    return t('The expression must wrap its cost in tier("name", …) so the matched tier is recorded on every request.')
  })()

  const canSubmit = trimmedName !== '' && !duplicate && exprProblem === undefined

  const submit = () => {
    setTouched(true)
    if (!canSubmit) return
    props.onSubmit({ ...draft, name: trimmedName })
  }

  const modeOptions: readonly RadioOption<BillingMode>[] = [
    {
      description: t('A base ratio on input tokens, with optional multipliers for output, cache and media.'),
      label: t('Per token'),
      value: 'per-token',
    },
    {
      description: t('One flat charge per call, whatever the token counts are.'),
      label: t('Per request'),
      value: 'per-request',
    },
    {
      description: t('A billing expression decides the cost. Every ratio below is ignored for this model.'),
      label: t('Expression'),
      value: 'tiered_expr',
    },
  ]

  return (
    <Dialog
      footer={(
        <>
          <Button onClick={() => props.onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button disabled={touched && !canSubmit} onClick={submit}>
            {isNew ? t('Add pricing') : t('Apply to the draft')}
          </Button>
        </>
      )}
      description={t('Changes are held in this page until you save the section.')}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="lg"
      title={isNew ? t('Add a model price') : t('Edit {{model}}', { model: draft.name })}
    >
      <div className="flex flex-col gap-5">
        <Input
          description={t('The model id exactly as the gateway receives it. Matching is exact apart from a fixed set of rewrites the gateway applies first, such as every gpt-4-gizmo name collapsing to gpt-4-gizmo-*.')}
          disabled={!isNew}
          error={nameError}
          inputClassName="mono"
          label={t('Model')}
          onChange={(event) => set('name', event.target.value)}
          required
          value={draft.name}
        />

        <RadioGroup
          label={t('Billing mode')}
          onValueChange={(value) => set('mode', value)}
          options={modeOptions}
          value={draft.mode}
          variant="card"
        />

        {draft.mode === 'per-token' ? (
          <div className="grid gap-5 md:grid-cols-2">
            <NumberInput
              description={t('The base multiplier on input tokens. Leave empty to fall back to the built-in default for this model.')}
              label={t('Model ratio')}
              min={0}
              onValueChange={(value) => set('ratio', value)}
              step="any"
              value={draft.ratio ?? ''}
            />
            <NumberInput
              description={t('Multiplies the model ratio for output tokens.')}
              label={t('Completion ratio')}
              min={0}
              onValueChange={(value) => set('completionRatio', value)}
              step="any"
              value={draft.completionRatio ?? ''}
            />
            <NumberInput
              description={t('Applied to tokens served from cache. Usually well below 1.')}
              label={t('Cache read ratio')}
              min={0}
              onValueChange={(value) => set('cacheRatio', value)}
              step="any"
              value={draft.cacheRatio ?? ''}
            />
            <NumberInput
              description={t('Applied to tokens written into the cache. Usually above 1.')}
              label={t('Cache write ratio')}
              min={0}
              onValueChange={(value) => set('createCacheRatio', value)}
              step="any"
              value={draft.createCacheRatio ?? ''}
            />
            <NumberInput
              description={t('Applied to image input tokens.')}
              label={t('Image ratio')}
              min={0}
              onValueChange={(value) => set('imageRatio', value)}
              step="any"
              value={draft.imageRatio ?? ''}
            />
            <NumberInput
              description={t('Applied to audio input tokens.')}
              label={t('Audio ratio')}
              min={0}
              onValueChange={(value) => set('audioRatio', value)}
              step="any"
              value={draft.audioRatio ?? ''}
            />
            <NumberInput
              description={t('Applied to audio output tokens.')}
              label={t('Audio completion ratio')}
              min={0}
              onValueChange={(value) => set('audioCompletionRatio', value)}
              step="any"
              value={draft.audioCompletionRatio ?? ''}
            />
          </div>
        ) : null}

        {draft.mode === 'per-request' ? (
          <NumberInput
            description={t('Charged once per call, in the same currency unit as the quota divisor. Every ratio is ignored while this mode is selected.')}
            label={t('Fixed price per request')}
            min={0}
            onValueChange={(value) => set('price', value)}
            step="any"
            value={draft.price ?? ''}
          />
        ) : null}

        {draft.mode === 'tiered_expr' ? (
          <div className="flex flex-col gap-4">
            <Alert title={t('The server does not check this expression before storing it')} tone="warning">
              <p>
                {t('It is compiled the first time a request is billed with it. A mistake here misprices live traffic rather than failing at save time. Coefficients are real prices per million tokens: p * 3 means three units per million input tokens.')}
              </p>
            </Alert>

            <Textarea
              description={t('Variables: p input, c output, len full context length for tier conditions, cr cache read, cc cache write, cc1h one-hour cache write, img image in, img_o image out, ai audio in, ao audio out.')}
              error={exprError}
              label={t('Billing expression')}
              onChange={(event) => set('expr', event.target.value)}
              placeholder={'len <= 200000\n  ? tier("standard", p * 3 + c * 15 + cr * 0.3)\n  : tier("long_context", p * 6 + c * 22.5 + cr * 0.6)'}
              rows={7}
              textareaClassName="mono text-xs"
              value={draft.expr}
            />

            <p className="text-xs leading-5 text-muted">
              {t('{{count}} tier marker(s) found. Use len rather than p in a tier condition: p shrinks when a request hits the cache, len does not.', {
                count: countTiers(draft.expr),
              })}
            </p>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
