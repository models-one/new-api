import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'
import type { ModelPricingRow } from '@/features/system-settings/billing/model-pricing'

/**
 * MODELS THAT ARE LIVE BUT HAVE NO BASE PRICE
 * ===========================================
 * The pricing table above answers "what is configured". This answers the question that
 * actually costs money: "is anything servable NOT configured".
 *
 * WHY THAT MATTERS, from `relay/helper/price.go` rather than from the legacy UI. When a
 * request arrives for a model with no `ModelRatio` entry:
 *
 *   modelRatio, success, matchName = ratio_setting.GetModelRatio(info.OriginModelName)
 *   if !success && !info.UserSetting.AcceptUnsetRatioModel {
 *       return …, modelPriceNotConfiguredError(matchName, info.UserId)
 *   }
 *
 * the request is REFUSED. It does not quietly bill at a default — the caller gets an
 * error. Only a user who has opted into `AcceptUnsetRatioModel` gets served, and then at
 * the fallback ratio of 37.5 (`setting/ratio_setting/model_ratio.go`), which is enormous.
 * So an enabled model missing from this table is either broken for every caller or wildly
 * overcharging the few who opted in. Neither is visible from the pricing blobs alone.
 *
 * THE MATCH IS BY EXACT NAME, and this panel says so. `FormatMatchingModelName` rewrites
 * a small fixed set before lookup (`gpt-4-gizmo…` → `gpt-4-gizmo-*`, the gemini thinking
 * variants, and the `*-openai-compact` wildcard) and nothing else — there is no general
 * suffix or glob matching. Reimplementing those rewrites here would be a second copy of a
 * rule that lives in Go and changes there, so this errs toward listing a model the
 * gateway can in fact price, and says as much, rather than staying silent about one it
 * cannot.
 */

/** `GET /api/channel/models_enabled` — every model name a live channel can serve. */
export const ENABLED_MODELS_QUERY_KEY = ['channel', 'models-enabled'] as const

export function enabledModelsQuery() {
  return queryOptions({
    queryKey: ENABLED_MODELS_QUERY_KEY,
    queryFn: async (): Promise<string[]> => {
      // Go serialises an empty slice as null, so the null case is real, not defensive.
      const models = await getJson<string[] | null>('/api/channel/models_enabled', {
        skipBusinessError: true,
        skipErrorHandler: true,
      })
      if (!Array.isArray(models)) return []
      return models.filter((name): name is string => typeof name === 'string' && name.trim() !== '')
    },
    staleTime: 60 * 1000,
  })
}

/**
 * Mirrors `isBasePricingUnset` in the legacy console: a model is unpriced when it has
 * neither a fixed price nor a model ratio, and is not billed by an expression. The other
 * ratios are multipliers on a base that does not exist, so they do not count as pricing.
 */
export function isBasePriceMissing(row: ModelPricingRow | undefined): boolean {
  if (row === undefined) return true
  if (row.mode === 'tiered_expr') return false
  return row.price === null && row.ratio === null
}

/** Enabled model names with no base price, sorted and de-duplicated. */
export function findUnpricedModels(
  enabled: readonly string[],
  rows: readonly ModelPricingRow[],
): string[] {
  const byName = new Map(rows.map((row) => [row.name, row]))
  const unpriced = new Set<string>()

  for (const name of enabled) {
    if (isBasePriceMissing(byName.get(name))) unpriced.add(name)
  }

  return [...unpriced].sort((left, right) => left.localeCompare(right))
}
