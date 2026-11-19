import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'

import { Checkbox, Input, NativeSelect, RadioGroup, SearchInput, Switch } from '@/components/form'
import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Panel } from '@/components/ui'
import { PriceSummary } from '@/features/system-settings/billing/components/PriceSummary'
import {
  ModelPricingConflictError,
  modelPricingKeys,
  modelPricingQuery,
  saveModelPricingChanges,
  type ModelPricingChange,
  type ModelPricingSnapshot,
} from '@/features/system-settings/billing/model-pricing-api'
import { samePricing } from '@/features/system-settings/billing/model-pricing-draft'
import {
  adjustPrice,
  defaultEndpoint,
  displayValues,
  fetchSyncableChannels,
  fetchUpstreamPrices,
  importedPricing,
  isPreset,
  OPENROUTER_ENDPOINT,
  PRICING_ENDPOINT,
  RATIO_CONFIG_ENDPOINT,
  sourceLabel,
  syncKeys,
  type PriceAdjustment,
  type SyncResult,
  type SyncSource,
} from '@/features/system-settings/billing/price-sync'
import { readOptionNumber, systemOptionsQuery } from '@/features/system-settings/options-store'
import { useQuotaPerUnit } from '@/hooks/use-server-status'

/**
 * Compares this deployment's model prices with upstream sources and imports the chosen
 * ones. A comparison reads the sources server-side and writes nothing; an import saves each
 * chosen model through the per-model pricing API, against the versions read when the
 * comparison was made, so a price changed in the meantime is refused rather than overwritten.
 */

const PAGE = 50
const CUSTOM = 'custom'

type Choice = { source: string; adjustment: PriceAdjustment }
type Comparison = { result: SyncResult; baseline: ModelPricingSnapshot }

export function PriceSyncPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const quotaPerUnit = useQuotaPerUnit()
  const optionsQuery = useQuery(systemOptionsQuery())
  const rate = readOptionNumber(optionsQuery.data, 'USDExchangeRate', 0)
  const validRate = Number.isFinite(rate) && rate > 0 ? rate : null

  const channelsQuery = useQuery({ queryFn: fetchSyncableChannels, queryKey: syncKeys.channels })
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [endpoints, setEndpoints] = useState<Record<number, string>>({})
  const [customUrls, setCustomUrls] = useState<Record<number, string>>({})
  const [channelSearch, setChannelSearch] = useState('')

  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [includeSame, setIncludeSame] = useState(false)
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [reviewing, setReviewing] = useState(false)

  const channels = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data])
  const endpointOf = (id: number, type: number) => endpoints[id] ?? defaultEndpoint({ id, type })
  const chosenSources: SyncSource[] = channels
    .filter((channel) => selected[channel.id])
    .map((channel) => {
      const endpoint = endpointOf(channel.id, channel.type)
      return { base_url: channel.base_url, endpoint: endpoint === CUSTOM ? (customUrls[channel.id] ?? '').trim() : endpoint, id: channel.id, name: channel.name }
    })
  const incompleteSource = chosenSources.some((source) => source.endpoint === '')

  const compare = useMutation({
    mutationFn: async (): Promise<Comparison> => {
      // The versions every import is checked against are read with the comparison.
      const [result, baseline] = await Promise.all([fetchUpstreamPrices(chosenSources), queryClient.fetchQuery({ ...modelPricingQuery(), staleTime: 0 })])
      if (result.test_results.length > 0 && result.test_results.every((item) => item.status === 'error')) {
        throw new Error(result.test_results.map((item) => `${sourceLabel(item.name, t)}: ${item.error ?? ''}`).join('; '))
      }
      return { baseline, result }
    },
    onMutate: () => {
      setComparison(null)
      setChoices({})
      setShown(PAGE)
    },
    onSuccess: setComparison,
  })

  const rows = useMemo(() => {
    if (comparison === null) return []
    const needle = search.trim().toLowerCase()
    return Object.entries(comparison.result.prices)
      .filter(([name]) => (includeSame || Object.hasOwn(comparison.result.differences, name)) && (needle === '' || name.toLowerCase().includes(needle)))
      .sort(([left], [right]) => left.localeCompare(right))
  }, [comparison, includeSame, search])
  const sourceNames = useMemo(
    () => (comparison === null ? [] : comparison.result.test_results.filter((item) => item.status === 'success').map((item) => item.name)),
    [comparison],
  )

  /** Each chosen model's stored pricing after the import, or why it cannot be imported. */
  const planned = useMemo(() => {
    if (comparison === null) return []
    return Object.entries(choices).map(([model, choice]) => {
      const entry = comparison.baseline.entries.find((item) => item.model_name === model)
      const published = comparison.result.prices[model]?.upstreams[choice.source] ?? {}
      const adjusted = adjustPrice(published, choice.adjustment, validRate)
      const imported = adjusted.values === undefined ? { error: adjusted.error } : importedPricing(adjusted.values, entry?.configured ?? {})
      return { choice, entry, imported, model }
    })
  }, [choices, comparison, validRate])
  const blocked = planned.filter((item) => item.imported.values === undefined)
  const changes: ModelPricingChange[] = planned.flatMap((item) =>
    item.imported.values === undefined || (item.entry !== undefined && samePricing(item.imported.values, item.entry.configured))
      ? []
      : [{ expected_version: item.entry?.version ?? comparison!.baseline.empty_version, model_name: item.model, pricing: item.imported.values }],
  )

  const save = useMutation({
    mutationFn: () => saveModelPricingChanges(changes),
    onSuccess: async () => {
      toast.success(t('Prices imported for {{count}} model(s)', { count: changes.length }))
      setReviewing(false)
      setChoices({})
      await queryClient.invalidateQueries({ queryKey: modelPricingKeys.all })
      // The next import must be checked against the versions just written.
      const baseline = await queryClient.fetchQuery({ ...modelPricingQuery(), staleTime: 0 })
      setComparison((current) => {
        if (current === null) return current
        const prices = { ...current.result.prices }
        for (const change of changes) {
          const row = prices[change.model_name]
          const chosen = planned.find((item) => item.model === change.model_name)
          const published = row?.upstreams[chosen?.choice.source ?? '']
          if (row && published) prices[change.model_name] = { ...row, current: adjustPrice(published, chosen!.choice.adjustment, validRate).values ?? row.current }
        }
        return { baseline, result: { ...current.result, prices } }
      })
    },
  })

  function choose(model: string, source: string) {
    setChoices((current) => {
      const next = { ...current }
      if (source === '') delete next[model]
      else next[model] = { adjustment: current[model]?.adjustment ?? 'keep', source }
      return next
    })
  }

  function useSourceForAll(source: string) {
    setChoices((current) => {
      const next = { ...current }
      for (const [model, prices] of rows) {
        const candidate = prices.upstreams[source]
        if (candidate && !samePricing(displayValues(candidate), displayValues(prices.current))) next[model] = { adjustment: next[model]?.adjustment ?? 'keep', source }
      }
      return next
    })
  }

  const visibleChannels = channels.filter((channel) => channelSearch.trim() === '' || `${channel.name} ${channel.base_url}`.toLowerCase().includes(channelSearch.trim().toLowerCase()))

  return (
    <div className="flex flex-col gap-6">
      <Panel as="section">
        <Panel.Header
          description={t('Read prices from your upstream channels or a public price list and compare them with yours. Nothing changes until you import the prices you choose.')}
          title={t('Sources')}
        />
        <Panel.Body className="flex flex-col gap-3">
          {channelsQuery.isError ? <Alert tone="destructive">{toErrorMessage(channelsQuery.error)}</Alert> : null}
          {channels.length > 8 ? <SearchInput className="max-w-xs" hideLabel label={t('Search sources')} onValueChange={setChannelSearch} placeholder={t('Search sources')} value={channelSearch} /> : null}
          <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {visibleChannels.map((channel) => {
              const endpoint = endpointOf(channel.id, channel.type)
              return (
                <li className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2" key={channel.id}>
                  <Checkbox
                    checked={Boolean(selected[channel.id])}
                    label={
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-foreground">{sourceLabel(channel.name, t)}</span>
                        {isPreset(channel) ? <Badge tone="info">{t('Public price list')}</Badge> : null}
                        {!isPreset(channel) && channel.status !== 1 ? <Badge tone="muted">{t('Disabled')}</Badge> : null}
                      </span>
                    }
                    onCheckedChange={(checked) => setSelected((current) => ({ ...current, [channel.id]: checked }))}
                  />
                  <span className="mono min-w-0 flex-1 truncate text-xs text-muted">{channel.base_url}</span>
                  {isPreset(channel) ? null : (
                    <>
                      <NativeSelect
                        className="w-40"
                        hideLabel
                        label={t('Price endpoint of {{source}}', { source: channel.name })}
                        onChange={(event) => setEndpoints((current) => ({ ...current, [channel.id]: event.target.value }))}
                        options={[
                          { label: '/api/pricing', value: PRICING_ENDPOINT },
                          { label: '/api/ratio_config', value: RATIO_CONFIG_ENDPOINT },
                          { label: 'OpenRouter', value: OPENROUTER_ENDPOINT },
                          { label: t('Custom URL'), value: CUSTOM },
                        ]}
                        size="sm"
                        value={endpoint}
                      />
                      {endpoint === CUSTOM ? (
                        <Input
                          className="w-64"
                          hideLabel
                          inputClassName="mono"
                          label={t('Custom price URL of {{source}}', { source: channel.name })}
                          onChange={(event) => setCustomUrls((current) => ({ ...current, [channel.id]: event.target.value }))}
                          placeholder="https://example.com/api/pricing"
                          size="sm"
                          value={customUrls[channel.id] ?? ''}
                        />
                      ) : null}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          {compare.isError ? <Alert tone="destructive">{toErrorMessage(compare.error)}</Alert> : null}
        </Panel.Body>
        <Panel.Footer align="end">
          <Button aria-busy={compare.isPending} disabled={compare.isPending || chosenSources.length === 0 || incompleteSource} onClick={() => compare.mutate()} variant="primary">
            <RefreshCwIcon aria-hidden="true" />
            {compare.isPending ? t('Comparing…') : t('Compare prices')}
          </Button>
        </Panel.Footer>
      </Panel>

      {comparison === null ? null : (
        <Panel as="section">
          <Panel.Header
            description={t('Choose a source for each model to import its price. Token prices are USD per 1M tokens, before group ratios.')}
            title={t('Comparison')}
          />
          <Panel.Body className="flex flex-col gap-4">
            <ul className="flex flex-wrap gap-2 text-xs">
              {comparison.result.test_results.map((item) => (
                <li key={item.name}>
                  <Badge tone={item.status === 'success' ? 'success' : 'destructive'}>
                    {sourceLabel(item.name, t)}
                    {item.status === 'error' ? `: ${item.error ?? ''}` : ''}
                  </Badge>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <SearchInput className="max-w-xs" hideLabel label={t('Search models')} onValueChange={(value) => { setSearch(value); setShown(PAGE) }} placeholder={t('Search models')} value={search} />
              <Switch checked={includeSame} label={t('Include models with the same price')} onCheckedChange={(checked) => { setIncludeSame(checked); setShown(PAGE) }} />
              <NativeSelect
                className="w-56"
                hideLabel
                label={t('Use one source for every model')}
                onChange={(event) => event.target.value !== '' && useSourceForAll(event.target.value)}
                size="sm"
                value=""
              >
                <option value="">{t('Use one source for every model')}</option>
                {sourceNames.map((name) => (
                  <option key={name} value={name}>
                    {sourceLabel(name, t)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                className="w-56"
                disabled={Object.keys(choices).length === 0 || validRate === null}
                hideLabel
                label={t('Convert every chosen price')}
                onChange={(event) => {
                  const adjustment = event.target.value as PriceAdjustment
                  setChoices((current) => Object.fromEntries(Object.entries(current).map(([model, choice]) => [model, { ...choice, adjustment }])))
                }}
                options={[
                  { label: t('Convert every chosen price'), value: '' },
                  ...adjustmentOptions(validRate, t),
                ]}
                size="sm"
                value=""
              />
              <span className="text-xs text-muted">
                {validRate === null ? t('Set an exchange rate under Currency to convert prices.') : t('Exchange rate: 1 USD = {{rate}}', { rate: validRate })}
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted">{includeSame ? t('No source prices any of these models.') : t('Every source agrees with your prices.')}</p>
            ) : (
              <ul aria-label={t('Models to compare')} className="flex flex-col gap-3">
                {rows.slice(0, shown).map(([model, prices]) => {
                  const choice = choices[model]
                  const plan = planned.find((item) => item.model === model)
                  // The price charged now, built-in defaults included; the sync API reports only stored fields.
                  const effective = comparison.baseline.entries.find((entry) => entry.model_name === model)?.effective
                  return (
                    <li className="rounded-md border border-border p-3" key={model}>
                      <div className="grid gap-3 lg:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)]">
                        <div className="flex flex-col gap-1">
                          <span className="mono text-sm text-foreground">{model}</span>
                          <span className="text-xs text-muted">{t('Now')}</span>
                          <PriceSummary quotaPerUnit={quotaPerUnit} values={effective ?? displayValues(prices.current)} />
                        </div>
                        <div className="flex flex-col gap-2">
                          <RadioGroup<string>
                            hideLabel
                            label={t('Price source for {{model}}', { model })}
                            onValueChange={(source) => choose(model, source)}
                            options={[
                              { label: t('Keep my price'), value: '' },
                              ...Object.entries(prices.upstreams).map(([source, values]) => ({
                                label: (
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{sourceLabel(source, t)}</span>
                                    {samePricing(displayValues(values), displayValues(prices.current)) ? <Badge tone="muted">{t('Same as now')}</Badge> : null}
                                    <PriceSummary quotaPerUnit={quotaPerUnit} values={displayValues(values)} />
                                  </span>
                                ),
                                value: source,
                              })),
                            ]}
                            value={choice?.source ?? ''}
                          />
                          {choice ? (
                            <div className="flex flex-wrap items-center gap-2 pl-6">
                              <NativeSelect
                                className="w-56"
                                disabled={validRate === null}
                                hideLabel
                                label={t('Conversion for {{model}}', { model })}
                                onChange={(event) => setChoices((current) => ({ ...current, [model]: { ...choice, adjustment: event.target.value as PriceAdjustment } }))}
                                options={adjustmentOptions(validRate, t)}
                                size="sm"
                                value={choice.adjustment}
                              />
                              {plan?.imported.values === undefined ? (
                                <span className="text-xs text-destructive" role="alert">{t(plan?.imported.error ?? '')}</span>
                              ) : null}
                              {plan?.imported.values !== undefined && choice.adjustment !== 'keep' ? (
                                <span className="flex items-center gap-2 text-xs text-muted">
                                  {t('Imported as')} <PriceSummary quotaPerUnit={quotaPerUnit} values={plan.imported.values} />
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {rows.length > shown ? (
              <div>
                <Button onClick={() => setShown((count) => count + PAGE)} size="sm" variant="outline">
                  {t('Show {{count}} more of {{total}}', { count: Math.min(PAGE, rows.length - shown), total: rows.length })}
                </Button>
              </div>
            ) : null}
          </Panel.Body>
          <Panel.Footer align="end">
            {blocked.length > 0 ? <span className="mr-auto text-xs text-destructive">{t('{{count}} chosen price(s) cannot be imported.', { count: blocked.length })}</span> : null}
            {Object.keys(choices).length > 0 ? (
              <Button onClick={() => setChoices({})} variant="quiet">
                {t('Clear choices')}
              </Button>
            ) : null}
            <Button disabled={changes.length === 0 || blocked.length > 0} onClick={() => { save.reset(); setReviewing(true) }} variant="primary">
              {t('Review {{count}} change(s)', { count: changes.length })}
            </Button>
          </Panel.Footer>
        </Panel>
      )}

      <Dialog
        footer={
          <>
            <Button disabled={save.isPending} onClick={() => setReviewing(false)} variant="outline">
              {t('Cancel')}
            </Button>
            <Button aria-busy={save.isPending} disabled={save.isPending || changes.length === 0} onClick={() => save.mutate()} variant="primary">
              {save.isPending ? t('Importing…') : t('Import {{count}} price(s)', { count: changes.length })}
            </Button>
          </>
        }
        onOpenChange={(open) => (open || save.isPending ? undefined : setReviewing(false))}
        open={reviewing}
        scrollBody
        size="lg"
        title={t('Import these prices?')}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t('Each model’s own price is replaced; its task plugin prices are kept.')}</p>
          <ul className="flex flex-col gap-2">
            {changes.map((change) => {
              const plan = planned.find((item) => item.model === change.model_name)!
              return (
                <li className="grid gap-2 rounded-md border border-border p-3 text-sm sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_minmax(0,1fr)]" key={change.model_name}>
                  <span className="flex flex-col gap-1">
                    <span className="mono">{change.model_name}</span>
                    <span className="text-xs text-muted">
                      {sourceLabel(plan.choice.source, t)}
                      {plan.choice.adjustment === 'keep' ? '' : ` · ${adjustmentLabel(plan.choice.adjustment, validRate, t)}`}
                    </span>
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t('Now')}</span>
                    {plan.entry ? <PriceSummary quotaPerUnit={quotaPerUnit} values={plan.entry.effective ?? plan.entry.configured} /> : <span className="text-xs text-muted">{t('Not priced')}</span>}
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t('After')}</span>
                    <PriceSummary quotaPerUnit={quotaPerUnit} values={change.pricing} />
                  </span>
                </li>
              )
            })}
          </ul>
          {save.error instanceof ModelPricingConflictError ? (
            <Alert title={t('Prices changed since the comparison')} tone="warning">
              {t('Someone changed a chosen model’s price after you compared. Nothing was imported. Compare again, then choose again.')}
            </Alert>
          ) : null}
          {save.isError && !(save.error instanceof ModelPricingConflictError) ? <Alert tone="destructive">{toErrorMessage(save.error)}</Alert> : null}
        </div>
      </Dialog>
    </div>
  )
}

function adjustmentLabel(mode: PriceAdjustment, rate: number | null, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (mode === 'divide') return t('Divide by {{rate}} (from the site currency to USD)', { rate: rate ?? '—' })
  if (mode === 'multiply') return t('Multiply by {{rate}} (from USD to the site currency)', { rate: rate ?? '—' })
  return t('Import as published')
}

function adjustmentOptions(rate: number | null, t: (key: string, options?: Record<string, unknown>) => string) {
  return (['keep', 'divide', 'multiply'] as const).map((mode) => ({ label: adjustmentLabel(mode, rate, t), value: mode }))
}
