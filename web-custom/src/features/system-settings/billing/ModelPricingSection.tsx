import { useQuery } from '@tanstack/react-query'
import type { SortingState } from '@tanstack/react-table'
import CoinsIcon from 'lucide-react/dist/esm/icons/coins'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTable,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { Checkbox, SearchInput, SwitchRow, Textarea, type CheckboxState } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Panel } from '@/components/ui'
import { ModelPricingDialog } from '@/features/system-settings/billing/components/ModelPricingDialog'
import { SaveBlockedNotice } from '@/features/system-settings/billing/components/SaveBlockedNotice'
import { UnpricedModelsPanel } from '@/features/system-settings/billing/components/UnpricedModelsPanel'
import {
  applyModelEdit,
  BILLING_EXPR_OPTION_KEY,
  BILLING_MODE_OPTION_KEY,
  buildModelRows,
  emptyEdit,
  RATIO_OPTION_KEYS,
  removeModels,
  toEdit,
  type BillingMode,
  type ModelPricingEdit,
  type ModelPricingMaps,
  type ModelPricingRow,
  type RatioOptionKey,
} from '@/features/system-settings/billing/model-pricing'
import { checkJsonShape, isSameJson } from '@/features/system-settings/billing/option-json'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionString,
  systemOptionsQuery,
  useInvalidateSystemOptions,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import { postJson } from '@/lib/api/client'

/**
 * `/system-settings/billing/model-pricing` — the pricing control centre.
 *
 * Twelve keys, all confirmed present in `GET /api/option/`:
 *
 *   ModelPrice  ModelRatio  CompletionRatio  CacheRatio  CreateCacheRatio
 *   ImageRatio  AudioRatio  AudioCompletionRatio
 *   billing_setting.billing_mode   billing_setting.billing_expr
 *   ExposeRatioEnabled             tool_price_setting.prices
 *
 * WHY IT IS A TABLE AND NOT TEN TEXT AREAS. Those ten maps describe the same models from
 * ten angles, and a model is mispriced by the combination rather than by any one blob:
 * a fixed `ModelPrice` silently beats every ratio, and a `tiered_expr` mode silently beats
 * both. Joining them into one row per model is the only way an operator can see which of
 * the three is actually in force. The raw blobs remain editable at the bottom for the
 * cases a table cannot express.
 *
 * WHAT THE SERVER CHECKS, AND WHAT IT DOES NOT — every line verified live:
 *
 *   Refused BEFORE storing (safe to attempt):
 *     ImageRatio, AudioRatio, AudioCompletionRatio, CreateCacheRatio,
 *     tool_price_setting.prices
 *   Refused AFTER the raw text has already replaced the stored value (a rejected write
 *   CORRUPTS the setting):
 *     ModelPrice, ModelRatio, CompletionRatio, CacheRatio
 *   Not checked at all — any string is stored:
 *     billing_setting.billing_mode, billing_setting.billing_expr
 *
 * So every blob is parsed and shape-checked here before Save is allowed to run. That is
 * not belt and braces; for four of these keys it is the only thing preventing a typo from
 * replacing a working price table with the word it was mistyped as.
 */

const PRICING_JSON_KEYS = [
  ...RATIO_OPTION_KEYS,
  BILLING_MODE_OPTION_KEY,
  BILLING_EXPR_OPTION_KEY,
] as const

type ModelPricingDraft = ModelPricingMaps & {
  ExposeRatioEnabled: boolean
  'tool_price_setting.prices': string
}

/**
 * The eight `{model: number}` blobs, read from the `RATIO_OPTION_KEYS` tuple rather than
 * written out again so the list cannot drift from the one the table and the save path use.
 * Every absent key reads as `'{}'`, which is what the shape check expects — an empty blob
 * would be rejected as a syntax error.
 */
function readRatioMaps(options: SystemOptionMap | undefined): Record<RatioOptionKey, string> {
  const maps = {} as Record<RatioOptionKey, string>
  for (const key of RATIO_OPTION_KEYS) maps[key] = readOptionString(options, key, '{}')
  return maps
}

function toDraft(options: SystemOptionMap | undefined): ModelPricingDraft {
  return {
    ...readRatioMaps(options),
    [BILLING_EXPR_OPTION_KEY]: readOptionString(options, BILLING_EXPR_OPTION_KEY, '{}'),
    [BILLING_MODE_OPTION_KEY]: readOptionString(options, BILLING_MODE_OPTION_KEY, '{}'),
    ExposeRatioEnabled: readOptionBoolean(options, 'ExposeRatioEnabled', false),
    'tool_price_setting.prices': readOptionString(options, 'tool_price_setting.prices', '{}'),
  }
}

const MODE_TONE: Record<BillingMode, 'success' | 'warning' | 'info'> = {
  'per-request': 'warning',
  'per-token': 'success',
  tiered_expr: 'info',
}

function formatRatio(value: number | null): string {
  return value === null ? '—' : String(value)
}

function modeLabel(mode: BillingMode, t: (key: string) => string): string {
  if (mode === 'per-token') return t('Per token')
  if (mode === 'per-request') return t('Per request')
  return t('Expression')
}

/** TanStack reports "all" and "some" separately; the kit's Checkbox wants one value. */
function selectAllState(all: boolean, some: boolean): CheckboxState {
  if (all) return true
  return some ? 'indeterminate' : false
}

export function ModelPricingSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())
  const invalidate = useInvalidateSystemOptions()

  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<BillingMode | 'all'>('all')
  const [sorting, setSorting] = useState<SortingState>([])
  const [rawKeysOpen, setRawKeysOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ModelPricingEdit | undefined>(undefined)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  const saved = toDraft(optionsQuery.data)

  const form = useOptionSectionForm<ModelPricingDraft>({
    saved,
    validate: (values) => {
      const errors: Partial<Record<keyof ModelPricingDraft, string>> = {}

      for (const key of RATIO_OPTION_KEYS) {
        const problem = checkJsonShape(values[key], 'number-map')
        if (problem !== undefined) {
          errors[key] = problem === 'syntax'
            ? t('This is not valid JSON.')
            : t('Every entry must be a model name mapped to a number.')
        }
      }

      const modeProblem = checkJsonShape(values[BILLING_MODE_OPTION_KEY], 'string-map')
      if (modeProblem !== undefined) {
        errors[BILLING_MODE_OPTION_KEY] = modeProblem === 'syntax'
          ? t('This is not valid JSON.')
          : t('Every entry must be a model name mapped to text.')
      }

      const exprProblem = checkJsonShape(values[BILLING_EXPR_OPTION_KEY], 'string-map')
      if (exprProblem !== undefined) {
        errors[BILLING_EXPR_OPTION_KEY] = exprProblem === 'syntax'
          ? t('This is not valid JSON.')
          : t('Every entry must be a model name mapped to text.')
      }

      const toolProblem = checkJsonShape(values['tool_price_setting.prices'], 'object')
      if (toolProblem !== undefined) {
        errors['tool_price_setting.prices'] = toolProblem === 'syntax'
          ? t('This is not valid JSON.')
          : t('This must be a JSON object.')
      }

      return errors
    },
  })

  const rows = useMemo(() => buildModelRows(form.values), [form.values])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (modeFilter !== 'all' && row.mode !== modeFilter) return false
      if (needle === '') return true
      return row.name.toLowerCase().includes(needle)
    })
  }, [modeFilter, rows, search])

  /**
   * Sorting runs over the WHOLE filtered list, here, before the page is cut out of it.
   *
   * Letting TanStack sort would sort only the twenty rows already on screen, so
   * "descending" on page 2 of 400 models would reverse those twenty and leave the other
   * 380 where they were — an order that looks sorted and is not. `buildModelRows` already
   * returns ascending order, so an unsorted table is stable either way.
   */
  const sorted = useMemo(() => {
    const [first] = sorting
    if (first === undefined) return filtered
    const direction = first.desc ? -1 : 1
    return [...filtered].sort((left, right) => left.name.localeCompare(right.name) * direction)
  }, [filtered, sorting])

  /**
   * Clamped, because the row count shrinks underneath the page number: clearing pricing
   * for a selection, or a filter, can leave `page` past the end and the table would then
   * render its empty state while rows exist.
   */
  const lastPage = Math.max(1, Math.ceil(sorted.length / Math.max(1, pageSize)))
  const currentPage = Math.min(page, lastPage)

  const pageRows = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, sorted],
  )

  const selectedNames = useMemo(
    () => Object.entries(selection).filter(([, on]) => on).map(([name]) => name),
    [selection],
  )

  /**
   * Writes the ten pricing blobs back, restoring the server's own text for any blob whose
   * content did not change. Re-serialising all ten on every edit would otherwise mark keys
   * dirty purely because this console sorts them, and Save would rewrite — through four
   * keys whose failed write corrupts the stored value — settings nobody touched.
   */
  const commitMaps = useCallback(
    (next: ModelPricingMaps) => {
      for (const key of PRICING_JSON_KEYS) {
        const value = isSameJson(next[key], saved[key]) ? saved[key] : next[key]
        if (value !== form.values[key]) form.setField(key, value)
      }
    },
    [form, saved],
  )

  const applyEdit = (edit: ModelPricingEdit) => {
    commitMaps(applyModelEdit(form.values, edit))
    setEditorOpen(false)
    setEditing(undefined)
  }

  const clearSelected = () => {
    commitMaps(removeModels(form.values, selectedNames))
    setSelection({})
    setConfirmClear(false)
  }

  /**
   * `POST /api/option/rest_model_ratio` replaces the WHOLE `ModelRatio` map with the
   * gateway's built-in defaults, server-side and immediately — it is not part of this
   * section's draft and no Save is involved. Anything an operator has set by hand is gone,
   * so it is gated on typing the model-ratio key name rather than on a single click.
   */
  const resetModelRatios = async () => {
    setResetting(true)
    try {
      await postJson<unknown>('/api/option/rest_model_ratio', undefined, {
        skipBusinessError: true,
        skipErrorHandler: true,
      })
      form.reset()
      await invalidate()
      toast.success(t('Model ratios reset to the built-in defaults'))
      setConfirmReset(false)
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setResetting(false)
    }
  }

  const columns = useMemo<DataTableColumns<ModelPricingRow>>(
    () => [
      {
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            hideLabel
            label={t('Select {{model}}', { model: row.original.name })}
            onCheckedChange={(checked) => row.toggleSelected(checked)}
          />
        ),
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            checked={selectAllState(
              table.getIsAllPageRowsSelected(),
              table.getIsSomePageRowsSelected(),
            )}
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
          <div className="flex min-w-0 flex-col gap-1">
            <span className="mono truncate text-xs text-foreground">{row.original.name}</span>
            {row.original.hasConflict ? (
              <span className="text-[0.6875rem] leading-4 text-warning">
                {t('A fixed price and per-token ratios are both set. The fixed price wins.')}
              </span>
            ) : null}
          </div>
        ),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Model')} />,
        id: 'name',
        meta: { label: t('Model'), mono: true },
      },
      {
        cell: ({ row }) => (
          <Badge tone={MODE_TONE[row.original.mode]}>{modeLabel(row.original.mode, t)}</Badge>
        ),
        enableSorting: false,
        header: () => t('Mode'),
        id: 'mode',
        meta: { label: t('Mode') },
      },
      {
        cell: ({ row }) => {
          const model = row.original
          if (model.mode === 'tiered_expr') {
            return (
              <span className="text-xs text-muted">
                {t('{{count}} tier marker(s)', { count: model.tierCount })}
              </span>
            )
          }
          if (model.mode === 'per-request') {
            return <span className="mono text-xs text-foreground">{formatRatio(model.price)}</span>
          }
          return <span className="mono text-xs text-foreground">{formatRatio(model.ratio)}</span>
        },
        enableSorting: false,
        header: () => t('Base'),
        id: 'base',
        meta: { label: t('Base') },
      },
      {
        cell: ({ row }) => (
          <span className="mono text-xs text-muted">{formatRatio(row.original.completionRatio)}</span>
        ),
        enableSorting: false,
        header: () => t('Completion'),
        id: 'completion',
        meta: { label: t('Completion') },
      },
      {
        cell: ({ row }) => {
          const model = row.original
          const extras: string[] = []
          if (model.cacheRatio !== null) extras.push(`${t('cache')} ${model.cacheRatio}`)
          if (model.createCacheRatio !== null) extras.push(`${t('cache write')} ${model.createCacheRatio}`)
          if (model.imageRatio !== null) extras.push(`${t('image')} ${model.imageRatio}`)
          if (model.audioRatio !== null) extras.push(`${t('audio in')} ${model.audioRatio}`)
          if (model.audioCompletionRatio !== null) {
            extras.push(`${t('audio out')} ${model.audioCompletionRatio}`)
          }
          return (
            <span className="text-xs text-muted">{extras.length === 0 ? '—' : extras.join(' · ')}</span>
          )
        },
        enableSorting: false,
        header: () => t('Other ratios'),
        id: 'extras',
        meta: { label: t('Other ratios') },
      },
      {
        cell: ({ row }) => (
          <Button
            aria-label={t('Edit pricing for {{model}}', { model: row.original.name })}
            onClick={() => {
              setEditing(toEdit(row.original))
              setEditorOpen(true)
            }}
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
    [t],
  )

  const { table, paginationControls } = useDataTable<ModelPricingRow>({
    columns,
    data: pageRows,
    enableRowSelection: true,
    getRowId: (row) => row.name,
    // The rows handed in are already sorted and already paged, so the table must not
    // reorder them; `manualSorting` also sends the operator back to page 1 on a change.
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
  const conflictCount = rows.filter((row) => row.hasConflict).length

  /**
   * The ten raw blobs live inside a collapsed `<details>`, so a malformed one can be the
   * reason Save does nothing while its message is not on screen. The panel is forced open
   * while one of them is blocking, and `SaveBlockedNotice` above says which.
   */
  const blockedRawKeys = PRICING_JSON_KEYS.filter((key) => form.errors[key] !== undefined)
  const hasBlockedRawKey = blockedRawKeys.length > 0

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        description={t('Every model this deployment prices, and which of the three billing modes is actually in force for it.')}
        form={form}
        note={t('Nothing on this page reaches the server until you save. Each of the ten pricing keys is then written on its own, so a refusal of one leaves the others saved.')}
        saveMode="section"
        title={t('Model pricing')}
      >
        {conflictCount > 0 ? (
          <Alert
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('{{count}} model(s) have overlapping pricing', { count: conflictCount })}
            tone="warning"
          >
            <p>
              {t('These models have a fixed per-request price and per-token ratios at the same time. The gateway charges the fixed price and ignores the ratios — open the model to clear whichever one is not intended.')}
            </p>
          </Alert>
        ) : null}

        <SaveBlockedNotice
          dirtyKeys={form.dirtyKeys}
          errors={form.errors}
          locate={(key) =>
            key === 'tool_price_setting.prices'
              ? t('Tool prices')
              : t('Raw pricing keys · {{key}}', { key })}
          onReveal={() => setRawKeysOpen(true)}
          revealLabel={(location) => t('Open {{location}}', { location })}
        />

        <Panel className="overflow-hidden" muted>
          <DataTableToolbar
            actions={(
              <>
                <Button
                  disabled={disabled || selectedNames.length === 0}
                  onClick={() => setConfirmClear(true)}
                  size="sm"
                  variant="danger"
                >
                  {t('Clear pricing for {{count}} selected', { count: selectedNames.length })}
                </Button>
                <Button
                  disabled={disabled}
                  onClick={() => {
                    setEditing(undefined)
                    setEditorOpen(true)
                  }}
                  size="sm"
                >
                  <PlusIcon aria-hidden="true" />
                  {t('Add a model')}
                </Button>
              </>
            )}
            filters={(
              <>
                {(['all', 'per-token', 'per-request', 'tiered_expr'] as const).map((mode) => (
                  <Button
                    aria-pressed={modeFilter === mode}
                    key={mode}
                    onClick={() => {
                      setModeFilter(mode)
                      setPage(1)
                    }}
                    size="sm"
                    variant={modeFilter === mode ? 'outline' : 'quiet'}
                  >
                    {mode === 'all' ? t('All modes') : modeLabel(mode, t)}
                  </Button>
                ))}
              </>
            )}
            filtersLabel={t('Billing mode filter')}
            isResetDisabled={search === '' && modeFilter === 'all'}
            label={t('Model pricing filters')}
            onReset={() => {
              setSearch('')
              setModeFilter('all')
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
            emptyDescription={
              rows.length === 0
                ? t('No model has an explicit price. Every model then bills at the gateway’s built-in ratio for it.')
                : t('No model matches this search.')
            }
            emptyIcon={<CoinsIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
            emptyTitle={rows.length === 0 ? t('No model pricing configured') : t('Nothing matches')}
            isLoading={optionsQuery.isPending}
            label={t('Configured model prices')}
            minWidthClassName="min-w-[64rem]"
            table={table}
          />

          {sorted.length > 0 ? (
            <div className="border-t border-border p-3">
              <DataTablePagination {...paginationControls} label={t('Model pricing pages')} />
            </div>
          ) : null}
        </Panel>

        <SwitchRow
          checked={form.values.ExposeRatioEnabled}
          description={t('Publishes the model ratios on the public pricing endpoint. Off keeps your margins private.')}
          disabled={disabled}
          label={t('Expose model ratios publicly')}
          onCheckedChange={(checked) => form.setField('ExposeRatioEnabled', checked)}
        />

        <Textarea
          description={t('Extra per-call charges for built-in tools, as {"tool name": price}. The server rejects anything that is not a JSON object before storing it.')}
          disabled={disabled}
          error={form.errors['tool_price_setting.prices']}
          label={t('Tool prices')}
          onChange={(event) => form.setField('tool_price_setting.prices', event.target.value)}
          rows={4}
          textareaClassName="mono text-xs"
          value={form.values['tool_price_setting.prices']}
        />

        <details
          className="rounded-[4px] border border-border p-4"
          onToggle={(event) => setRawKeysOpen(event.currentTarget.open)}
          open={rawKeysOpen || hasBlockedRawKey}
        >
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            {t('Edit the raw pricing keys')}
          </summary>
          <p className="mt-2 text-xs leading-5 text-muted">
            {t('The same ten values the table above is built from. Editing one here and using the table afterwards is fine — both write to the same draft.')}
          </p>
          <div className="mt-4 flex flex-col gap-4">
            {PRICING_JSON_KEYS.map((key) => (
              <Textarea
                disabled={disabled}
                error={form.errors[key]}
                key={key}
                label={key}
                onChange={(event) => form.setField(key, event.target.value)}
                rows={3}
                textareaClassName="mono text-xs"
                value={form.values[key]}
              />
            ))}
          </div>
        </details>
      </SettingsSection>

      <UnpricedModelsPanel
        disabled={disabled}
        onSetPrice={(model) => {
          // The name comes from the gateway, so the editor opens with it fixed rather
          // than as a new free-text row that could be typed differently.
          setEditing({ ...emptyEdit(), name: model })
          setEditorOpen(true)
        }}
        rows={rows}
      />

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
          <Button
            disabled={disabled || resetting}
            onClick={() => setConfirmReset(true)}
            size="sm"
            variant="danger"
          >
            <RotateCcwIcon aria-hidden="true" />
            {t('Reset model ratios')}
          </Button>
        </Panel.Footer>
      </Panel>

      <ModelPricingDialog
        edit={editing}
        existingNames={rows.map((row) => row.name)}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) setEditing(undefined)
        }}
        onSubmit={applyEdit}
        open={editorOpen}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Clear pricing')}
        description={t('{{count}} model(s) lose every price, ratio, billing mode and expression they have here. They will bill at the gateway’s built-in defaults instead. Nothing is written until you save the section.', { count: selectedNames.length })}
        destructive
        onConfirm={clearSelected}
        onOpenChange={setConfirmClear}
        open={confirmClear}
        title={t('Clear pricing for these models?')}
      >
        {/*
          Selection survives paging and filtering, so the list can hold models that are not
          on screen. A destructive action must name what it is about to take, not count it.
        */}
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {selectedNames.map((name) => (
            <li className="mono text-xs text-foreground" key={name}>
              {name}
            </li>
          ))}
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Reset model ratios')}
        confirmPhrase="ModelRatio"
        description={t('Every model ratio on this deployment is replaced with the built-in defaults immediately. This cannot be undone and does not wait for a save.')}
        destructive
        isLoading={resetting}
        onConfirm={() => void resetModelRatios()}
        onOpenChange={setConfirmReset}
        open={confirmReset}
        title={t('Reset every model ratio?')}
      />
    </div>
  )
}
