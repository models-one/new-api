import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SortingState } from '@tanstack/react-table'
import CoinsIcon from 'lucide-react/dist/esm/icons/coins'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTable,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { Checkbox, NativeSelect, SearchInput, SwitchRow, type CheckboxState } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Panel } from '@/components/ui'
import { Tabs } from '@/components/disclosure'
import { ModelPricingEditor } from '@/features/system-settings/billing/components/ModelPricingEditor'
import { PriceSyncPanel } from '@/features/system-settings/billing/components/PriceSyncPanel'
import { ToolPricesPanel } from '@/features/system-settings/billing/components/ToolPricesPanel'
import { PriceSummary } from '@/features/system-settings/billing/components/PriceSummary'
import { UnpricedModelsPanel } from '@/features/system-settings/billing/components/UnpricedModelsPanel'
import {
  fetchModelPricingEntries,
  ModelPricingConflictError,
  modelPricingIssuesQuery,
  modelPricingKeys,
  modelPricingQuery,
  saveModelPricingChanges,
  type ModelPricingEntry,
  type ModelPricingIssue,
} from '@/features/system-settings/billing/model-pricing-api'
import { pricingModeOf, type PricingMode } from '@/features/system-settings/billing/model-pricing-draft'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  systemOptionsQuery,
  useInvalidateSystemOptions,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { postJson } from '@/lib/api/client'

/**
 * `/system-settings/billing/model-pricing` — the pricing control centre.
 *
 * Model prices are read from and written to the per-model API
 * (`GET`/`PATCH /api/option/model_pricing`, see `model-pricing-api.ts`): the list shows
 * every model the gateway prices — stored prices, and built-in prices of models a channel
 * serves — with the price actually charged. Each save replaces one model's stored price
 * and is refused if someone else changed it first. Nothing writes the pricing option maps
 * whole, which would store the built-in prices as administrator overrides.
 *
 * Four tabs: the model list (with `ExposeRatioEnabled` and the ratio reset), servable
 * models with no price, tool prices, and comparing with upstream sources.
 */

type PricingSectionDraft = {
  ExposeRatioEnabled: boolean
}

function toDraft(options: SystemOptionMap | undefined): PricingSectionDraft {
  return { ExposeRatioEnabled: readOptionBoolean(options, 'ExposeRatioEnabled', false) }
}

type PricingTab = 'models' | 'unpriced' | 'tools' | 'sync'

type SourceFilter = 'all' | 'stored' | 'inherited' | 'attention'

type PricingRow = {
  name: string
  mode: PricingMode
  /** True when nothing is stored and the model bills at a built-in or default price. */
  inherited: boolean
  entry: ModelPricingEntry
  /** Task plugins that cannot charge this model. */
  issues: ModelPricingIssue[]
}

const MODE_TONE: Record<PricingMode, 'success' | 'warning' | 'info'> = {
  expression: 'success',
  'per-request': 'warning',
  'per-token': 'info',
}

function modeLabel(mode: PricingMode, t: (key: string) => string): string {
  if (mode === 'expression') return t('Expression')
  if (mode === 'per-request') return t('Per request')
  return t('Per token')
}

/** TanStack reports "all" and "some" separately; the kit's Checkbox wants one value. */
function selectAllState(all: boolean, some: boolean): CheckboxState {
  if (all) return true
  return some ? 'indeterminate' : false
}

type EditorTarget = { entry: ModelPricingEntry | undefined; initialName?: string }

export function ModelPricingSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const optionsQuery = useQuery(systemOptionsQuery())
  const pricingQuery = useQuery(modelPricingQuery())
  const issuesQuery = useQuery(modelPricingIssuesQuery())
  const invalidateOptions = useInvalidateSystemOptions()
  const quotaPerUnit = useQuotaPerUnit()

  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<PricingMode | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [sorting, setSorting] = useState<SortingState>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  const [tab, setTab] = useState<PricingTab>('models')
  const form = useOptionSectionForm<PricingSectionDraft>({ saved: toDraft(optionsQuery.data) })

  const entries = useMemo(() => pricingQuery.data?.entries ?? [], [pricingQuery.data])
  const issuesByModel = useMemo(() => {
    const byModel = new Map<string, ModelPricingIssue[]>()
    for (const issue of issuesQuery.data ?? []) byModel.set(issue.model_name, [...(byModel.get(issue.model_name) ?? []), issue])
    return byModel
  }, [issuesQuery.data])
  const rows = useMemo<PricingRow[]>(
    () =>
      entries.map((entry) => ({
        entry,
        inherited: Object.keys(entry.configured).length === 0,
        issues: issuesByModel.get(entry.model_name) ?? [],
        mode: pricingModeOf(entry.effective ?? entry.configured),
        name: entry.model_name,
      })),
    [entries, issuesByModel],
  )
  // A task model a channel serves with no price of its own is not in the list at all.
  const unlistedIssueModels = useMemo(() => {
    const listed = new Set(entries.map((entry) => entry.model_name))
    return [...issuesByModel.keys()].filter((name) => !listed.has(name))
  }, [entries, issuesByModel])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (modeFilter !== 'all' && row.mode !== modeFilter) return false
      if (sourceFilter === 'stored' && row.inherited) return false
      if (sourceFilter === 'inherited' && !row.inherited) return false
      if (sourceFilter === 'attention' && row.issues.length === 0) return false
      return needle === '' || row.name.toLowerCase().includes(needle)
    })
  }, [modeFilter, rows, search, sourceFilter])

  /**
   * Sorting runs over the WHOLE filtered list, here, before the page is cut out of it.
   * Letting TanStack sort would sort only the rows already on screen. The snapshot is
   * already in ascending name order, so an unsorted table is stable either way.
   */
  const sorted = useMemo(() => {
    const [first] = sorting
    if (first === undefined) return filtered
    const direction = first.desc ? -1 : 1
    return [...filtered].sort((left, right) => left.name.localeCompare(right.name) * direction)
  }, [filtered, sorting])

  const lastPage = Math.max(1, Math.ceil(sorted.length / Math.max(1, pageSize)))
  const currentPage = Math.min(page, lastPage)
  const pageRows = useMemo(() => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize), [currentPage, pageSize, sorted])

  const selectedNames = useMemo(() => Object.entries(selection).filter(([, on]) => on).map(([name]) => name), [selection])

  async function reloadPricing() {
    await queryClient.invalidateQueries({ queryKey: modelPricingKeys.all })
  }

  /** Opens a model the list does not hold, read fresh so its plugins and version are current. */
  async function openUnlisted(name: string) {
    try {
      const fresh = await fetchModelPricingEntries([name])
      setEditor({ entry: fresh.entries[0] })
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  /**
   * Restores the selected models to their default price in one request. The versions are
   * read again first, so the restore is refused only if a model changes in between.
   */
  async function restoreSelected() {
    setRestoring(true)
    try {
      const fresh = await fetchModelPricingEntries(selectedNames)
      const byName = new Map(fresh.entries.map((entry) => [entry.model_name, entry]))
      await saveModelPricingChanges(
        selectedNames.map((name) => ({
          expected_version: byName.get(name)?.version ?? fresh.empty_version,
          model_name: name,
          pricing: {},
          reset: true,
        })),
      )
      toast.success(t('Default prices restored for {{count}} model(s)', { count: selectedNames.length }))
      setSelection({})
      setConfirmRestore(false)
      await reloadPricing()
    } catch (error) {
      toast.error(error instanceof ModelPricingConflictError ? t('A selected model’s price was changed elsewhere. Reload and try again.') : toErrorMessage(error))
    } finally {
      setRestoring(false)
    }
  }

  /**
   * `POST /api/option/rest_model_ratio` replaces the WHOLE `ModelRatio` map with the
   * gateway's built-in defaults, server-side and immediately.
   */
  async function resetModelRatios() {
    setResetting(true)
    try {
      await postJson<unknown>('/api/option/rest_model_ratio', undefined, { skipBusinessError: true, skipErrorHandler: true })
      await Promise.all([invalidateOptions(), reloadPricing()])
      toast.success(t('Model ratios reset to the built-in defaults'))
      setConfirmReset(false)
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setResetting(false)
    }
  }

  const columns = useMemo<DataTableColumns<PricingRow>>(
    () => [
      {
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            hideLabel
            label={t('Select {{model}}', { model: row.original.name })}
            onCheckedChange={(checked) => row.toggleSelected(checked)}
          />
        ),
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            checked={selectAllState(table.getIsAllPageRowsSelected(), table.getIsSomePageRowsSelected())}
            hideLabel
            label={t('Select every model on this page')}
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
          />
        ),
        id: 'select',
        meta: { label: t('Selection') },
      },
      {
        accessorKey: 'name',
        cell: ({ row }) => (
          <span className="flex flex-col gap-1">
            <span className="mono text-xs text-foreground">{row.original.name}</span>
            {row.original.inherited ? <span className="text-xs text-muted">{t('Built-in or default price')}</span> : null}
            {row.original.issues.length > 0 ? (
              <span>
                <Badge tone="warning">{t('Plugin price needed')}</Badge>
              </span>
            ) : null}
          </span>
        ),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Model')} />,
        id: 'name',
        meta: { label: t('Model'), mono: true },
      },
      {
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            <Badge tone={MODE_TONE[row.original.mode]}>{modeLabel(row.original.mode, t)}</Badge>
            {row.original.mode === 'expression' ? null : <Badge tone="muted">{t('Deprecated')}</Badge>}
          </span>
        ),
        enableSorting: false,
        header: () => t('Mode'),
        id: 'mode',
        meta: { label: t('Mode') },
      },
      {
        cell: ({ row }) => <PriceSummary quotaPerUnit={quotaPerUnit} values={row.original.entry.effective ?? row.original.entry.configured} />,
        enableSorting: false,
        header: () => t('Price charged'),
        id: 'price',
        meta: { label: t('Price charged') },
      },
      {
        cell: ({ row }) => (
          <Button
            aria-label={t('Edit pricing for {{model}}', { model: row.original.name })}
            onClick={() => setEditor({ entry: row.original.entry })}
            size="icon-sm"
            title={t('Edit pricing for {{model}}', { model: row.original.name })}
            variant="quiet"
          >
            <PencilIcon aria-hidden="true" />
          </Button>
        ),
        enableSorting: false,
        header: () => <span className="sr-only">{t('Actions')}</span>,
        id: 'actions',
        meta: { align: 'right', label: t('Actions') },
      },
    ],
    [quotaPerUnit, t],
  )

  const { table, paginationControls } = useDataTable<PricingRow>({
    columns,
    data: pageRows,
    // A model with nothing stored has no price to restore.
    enableRowSelection: (row) => !row.original.inherited,
    getRowId: (row) => row.name,
    manualSorting: true,
    onPageChange: (query) => {
      setPage(query.p)
      setPageSize(query.page_size)
    },
    onRowSelectionChange: setSelection,
    onSortingChange: setSorting,
    page: currentPage,
    pageSize,
    rowSelection: selection,
    sorting,
    total: sorted.length,
  })

  const disabled = optionsQuery.isPending || form.isSaving

  return (
    <div className="flex flex-col gap-6">
      <Tabs onValueChange={(value) => setTab(value as PricingTab)} value={tab}>
        <Tabs.List label={t('Model pricing')}>
          <Tabs.Tab value="models">{t('Models')}</Tabs.Tab>
          <Tabs.Tab value="unpriced">{t('Unpriced models')}</Tabs.Tab>
          <Tabs.Tab value="tools">{t('Tool prices')}</Tabs.Tab>
          <Tabs.Tab value="sync">{t('Upstream sync')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel className="flex flex-col gap-6 pt-4" value="models">
          <Panel as="section">
            <Panel.Header
              description={t('Every model this deployment prices and the price it is charged at. Each change is saved for that model on its own.')}
              title={t('Model pricing')}
            />
            <Panel.Body className="flex flex-col gap-4">
              {pricingQuery.isError ? (
                <Alert
                  action={
                    <Button onClick={() => void pricingQuery.refetch()} size="sm" variant="outline">
                      {t('Try again')}
                    </Button>
                  }
                  tone="destructive"
                >
                  {toErrorMessage(pricingQuery.error, t('Failed to load model pricing'))}
                </Alert>
              ) : null}

              {issuesByModel.size > 0 ? (
                <Alert
                  action={
                    sourceFilter === 'attention' ? (
                      <Button onClick={() => setSourceFilter('all')} size="sm" variant="outline">
                        {t('Show all models')}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          setSourceFilter('attention')
                          setPage(1)
                        }}
                        size="sm"
                        variant="outline"
                      >
                        {t('Review')}
                      </Button>
                    )
                  }
                  icon={<TriangleAlertIcon aria-hidden="true" />}
                  title={t('{{count}} model(s) need a plugin price', { count: issuesByModel.size })}
                  tone="warning"
                >
                  <p>{t('A task plugin serving these models has no usable price, so its tasks are refused. Open a model to see which plugin and what to change.')}</p>
                  {unlistedIssueModels.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {unlistedIssueModels.map((name) => (
                        <li key={name}>
                          <Button aria-label={t('Set a price for {{model}}', { model: name })} onClick={() => void openUnlisted(name)} size="sm" variant="outline">
                            <span className="mono">{name}</span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Alert>
              ) : null}

              <Panel className="overflow-hidden" muted>
                <DataTableToolbar
                  actions={(
                    <>
                      {selectedNames.length === 0 ? null : (
                        <Button onClick={() => setConfirmRestore(true)} size="sm" variant="danger">
                          {t('Restore default price for {{count}} selected', { count: selectedNames.length })}
                        </Button>
                      )}
                      <Button disabled={pricingQuery.isPending} onClick={() => setEditor({ entry: undefined })} size="sm">
                        <PlusIcon aria-hidden="true" />
                        {t('Add a model')}
                      </Button>
                    </>
                  )}
                  filters={(
                    <>
                      <NativeSelect
                        className="w-40"
                        hideLabel
                        label={t('Billing mode')}
                        onChange={(event) => {
                          setModeFilter(event.target.value as PricingMode | 'all')
                          setPage(1)
                        }}
                        options={[
                          { label: t('All modes'), value: 'all' },
                          ...(['expression', 'per-token', 'per-request'] as const).map((mode) => ({ label: modeLabel(mode, t), value: mode })),
                        ]}
                        size="sm"
                        value={modeFilter}
                      />
                      <NativeSelect
                        className="w-48"
                        hideLabel
                        label={t('Price source')}
                        onChange={(event) => {
                          setSourceFilter(event.target.value as SourceFilter)
                          setPage(1)
                        }}
                        options={[
                          { label: t('All prices'), value: 'all' },
                          { label: t('Set here only'), value: 'stored' },
                          { label: t('Built-in or default price'), value: 'inherited' },
                          { label: t('Needs attention'), value: 'attention' },
                        ]}
                        size="sm"
                        value={sourceFilter}
                      />
                    </>
                  )}
                  filtersLabel={t('Billing mode filter')}
                  isResetDisabled={search === '' && modeFilter === 'all' && sourceFilter === 'all'}
                  label={t('Model pricing filters')}
                  onReset={() => {
                    setSearch('')
                    setModeFilter('all')
                    setSourceFilter('all')
                    setPage(1)
                  }}
                  search={(
                    <SearchInput
                      hideLabel
                      label={t('Search models')}
                      onValueChange={(value) => {
                        setSearch(value)
                        setPage(1)
                      }}
                      placeholder={t('Search models')}
                      value={search}
                    />
                  )}
                />

                <DataTable
                  emptyDescription={rows.length === 0 ? t('No model is priced yet. Add one, or enable a channel for a model with a built-in price.') : t('No model matches this search.')}
                  emptyIcon={<CoinsIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
                  emptyTitle={rows.length === 0 ? t('No model pricing configured') : t('Nothing matches')}
                  isLoading={pricingQuery.isPending}
                  label={t('Configured model prices')}
                  minWidthClassName="min-w-[52rem]"
                  table={table}
                />

                {sorted.length > 0 ? (
                  <div className="border-t border-border p-3">
                    <DataTablePagination {...paginationControls} label={t('Model pricing pages')} />
                  </div>
                ) : null}
              </Panel>
            </Panel.Body>
          </Panel>

          <SettingsSection
            description={t('What the public pricing page reveals.')}
            form={form}
            saveMode="section"
            title={t('Pricing options')}
          >
            <SwitchRow
              checked={form.values.ExposeRatioEnabled}
              description={t('Publishes the model ratios on the public pricing endpoint. Off keeps your margins private.')}
              disabled={disabled}
              label={t('Expose model ratios publicly')}
              onCheckedChange={(checked) => form.setField('ExposeRatioEnabled', checked)}
            />

          </SettingsSection>

          <Panel as="section">
            <Panel.Header
              description={t('Replaces the entire model ratio map with the gateway’s built-in defaults, on the server, straight away.')}
              title={t('Reset model ratios')}
            />
            <Panel.Body>
              <p className="text-sm leading-6 text-muted">
                {t('This is not part of the draft above and there is no save step. Every model ratio set by hand on this deployment is replaced. Fixed prices, expressions and the other ratio keys are left alone.')}
              </p>
            </Panel.Body>
            <Panel.Footer align="end">
              <Button disabled={resetting} onClick={() => setConfirmReset(true)} variant="danger">
                <RotateCcwIcon aria-hidden="true" />
                {t('Reset model ratios')}
              </Button>
            </Panel.Footer>
          </Panel>
        </Tabs.Panel>

        <Tabs.Panel className="pt-4" value="unpriced">
          <UnpricedModelsPanel
            disabled={pricingQuery.isPending}
            entries={entries}
            onSetPrice={(model) => setEditor({ entry: undefined, initialName: model })}
          />
        </Tabs.Panel>

        <Tabs.Panel className="pt-4" value="tools">
          <ToolPricesPanel />
        </Tabs.Panel>

        <Tabs.Panel className="pt-4" value="sync">
          <PriceSyncPanel />
        </Tabs.Panel>
      </Tabs>

      {editor === null ? null : (
        <ModelPricingEditor
          emptyVersion={pricingQuery.data?.empty_version ?? ''}
          entry={editor.entry}
          existingNames={rows.filter((row) => !row.inherited).map((row) => row.name)}
          initialName={editor.initialName}
          issues={editor.entry === undefined ? [] : (issuesByModel.get(editor.entry.model_name) ?? [])}
          onClose={() => setEditor(null)}
          onReload={() => {
            setEditor(null)
            void reloadPricing()
          }}
          onSaved={(model) => {
            setEditor(null)
            toast.success(t('Price saved for {{model}}', { model }))
            void reloadPricing()
          }}
          quotaPerUnit={quotaPerUnit}
        />
      )}

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Restore default price')}
        description={t('Everything stored for {{count}} model(s) is removed, including their plugin prices. They then bill at the built-in price, or at the default if there is none.', { count: selectedNames.length })}
        destructive
        isLoading={restoring}
        onConfirm={() => void restoreSelected()}
        onOpenChange={(open) => (open || restoring ? undefined : setConfirmRestore(false))}
        open={confirmRestore}
        title={t('Restore the default price?')}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Reset model ratios')}
        confirmPhrase="ModelRatio"
        description={t('Every model ratio on this deployment is replaced with the built-in defaults immediately. This cannot be undone and does not wait for a save.')}
        destructive
        isLoading={resetting}
        onConfirm={() => void resetModelRatios()}
        onOpenChange={(open) => (open || resetting ? undefined : setConfirmReset(false))}
        open={confirmReset}
        title={t('Reset every model ratio?')}
      />
    </div>
  )
}
