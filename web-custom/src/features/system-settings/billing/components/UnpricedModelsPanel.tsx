import { useQuery } from '@tanstack/react-query'
import CircleCheckIcon from 'lucide-react/dist/esm/icons/circle-check'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, Panel } from '@/components/ui'
import type { ModelPricingRow } from '@/features/system-settings/billing/model-pricing'
import { enabledModelsQuery, findUnpricedModels } from '@/features/system-settings/billing/unpriced-models'

/**
 * The models a live channel can serve that this deployment has not priced.
 *
 * See `unpriced-models.ts` for why this is not cosmetic: `relay/helper/price.go` REFUSES
 * a request for a model with no ratio unless the caller opted into `AcceptUnsetRatioModel`,
 * and serves the ones who did at the fallback ratio of 37.5.
 *
 * The list is read from `/api/channel/models_enabled`, which is behind `AdminAuth` plus
 * the `channel:read` permission rather than the root gate the rest of this page sits
 * behind. A root account without that permission gets a refusal here while every other
 * control on the page keeps working, so the failure is rendered inside this panel and
 * never allowed to take the pricing table with it.
 */

type UnpricedModelsPanelProps = {
  /** The rows the pricing table is showing, draft edits included. */
  rows: readonly ModelPricingRow[]
  /** Opens the per-model editor with this model's name already fixed. */
  onSetPrice: (model: string) => void
  disabled?: boolean
}

export function UnpricedModelsPanel(props: UnpricedModelsPanelProps) {
  const { t } = useTranslation()
  const modelsQuery = useQuery(enabledModelsQuery())

  const unpriced = useMemo(
    () => findUnpricedModels(modelsQuery.data ?? [], props.rows),
    [modelsQuery.data, props.rows],
  )

  return (
    <Panel as="section">
      <Panel.Header
        description={t('Every model a live channel can serve is checked against the pricing above. A model missing from it is refused at request time, not quietly billed at a default.')}
        title={t('Live models with no price')}
      />

      <Panel.Body className="flex flex-col gap-4">
        {modelsQuery.isPending ? (
          <p aria-busy="true" className="text-sm text-muted" role="status">
            {t('Checking which models a channel can serve…')}
          </p>
        ) : null}

        {!modelsQuery.isPending && modelsQuery.isError ? (
          <Alert
            action={(
              <Button
                aria-busy={modelsQuery.isFetching}
                disabled={modelsQuery.isFetching}
                onClick={() => void modelsQuery.refetch()}
                size="sm"
                variant="outline"
              >
                {t('Try again')}
              </Button>
            )}
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('The list of servable models could not be loaded')}
            tone="destructive"
          >
            <p>{toErrorMessage(modelsQuery.error)}</p>
            <p className="mt-2">
              {t('This check needs the channel read permission, which is separate from root access. Everything else on this page is unaffected.')}
            </p>
          </Alert>
        ) : null}

        {!modelsQuery.isPending && !modelsQuery.isError && modelsQuery.data?.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            {t('No channel is enabled, so nothing is servable yet and there is nothing to price.')}
          </p>
        ) : null}

        {!modelsQuery.isPending && !modelsQuery.isError && unpriced.length === 0
        && (modelsQuery.data?.length ?? 0) > 0 ? (
          <p className="flex items-center gap-2 text-sm leading-6 text-muted">
            <CircleCheckIcon aria-hidden="true" className="size-4 shrink-0 text-success" />
            {t('All {{count}} servable model(s) have a base price.', {
              count: modelsQuery.data?.length ?? 0,
            })}
          </p>
        ) : null}

        {unpriced.length > 0 ? (
          <>
            <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
              <p>
                {t('{{count}} servable model(s) have neither a fixed price nor a model ratio. A request for one of them is refused, unless the account has opted into unpriced models — and those are then charged at the fallback ratio of 37.5.', {
                  count: unpriced.length,
                })}
              </p>
            </Alert>

            <ul className="flex flex-col gap-2">
              {unpriced.map((model) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[4px] border border-border px-3 py-2"
                  key={model}
                >
                  <span className="mono text-xs text-foreground">{model}</span>
                  <Button
                    aria-label={t('Set a price for {{model}}', { model })}
                    disabled={props.disabled}
                    onClick={() => props.onSetPrice(model)}
                    size="sm"
                    title={t('Set a price for {{model}}', { model })}
                    variant="outline"
                  >
                    {t('Set a price')}
                  </Button>
                </li>
              ))}
            </ul>

            <p className="text-xs leading-5 text-muted">
              {t('The check is by exact model name. The gateway rewrites a small fixed set of names before it looks a price up — the gpt-4-gizmo family, the gemini thinking variants and the *-openai-compact wildcard — so a model listed here may still resolve to one of those.')}
            </p>
          </>
        ) : null}
      </Panel.Body>
    </Panel>
  )
}
