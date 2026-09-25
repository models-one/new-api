import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTable, useDataTable, type DataTableColumns } from '@/components/data'
import { Badge } from '@/components/ui'
import {
  TOKEN_PRICE_KINDS,
  billingShape,
  formatModelPrice,
  formatMultiplier,
  tokenPricePerMillion,
  type PricingGroup,
} from '@/features/pricing/pricing-presentation'
import { perRequestPrice, type PricingModel } from '@/lib/api/pricing'

/** One priced group for this model. */
type GroupPriceRow = {
  group: string
  description: string
  /** Undefined when `group_ratio` publishes nothing for the group. */
  ratio: number | undefined
}

type GroupPriceTableProps = {
  model: PricingModel
  /** Every group the gateway offers; only the ones the model enables become rows. */
  groups: readonly PricingGroup[]
  /** Groups the `auto` pseudo-group falls through, narrowed to this model. */
  autoChain: readonly string[]
}

/** Big enough that the table never paginates: a gateway publishes a handful of groups. */
const ALL_ROWS = 200

type Cell = { row: { original: GroupPriceRow } }

export function GroupPriceTable(props: GroupPriceTableProps) {
  const { t } = useTranslation()
  const { model, groups, autoChain } = props
  const shape = billingShape(model)

  const rows = useMemo<GroupPriceRow[]>(() => {
    const enabled = new Set(model.enable_groups ?? [])
    return groups
      .filter((group) => enabled.has(group.name))
      .map((group) => ({ group: group.name, description: group.description, ratio: group.ratio }))
  }, [groups, model.enable_groups])

  // Only the optional price rows the model actually publishes a ratio for get a column.
  const priceKinds = useMemo(
    () => TOKEN_PRICE_KINDS.filter((entry) => tokenPricePerMillion(model, entry.kind, 1) !== undefined),
    [model],
  )

  const columns = useMemo<DataTableColumns<GroupPriceRow>>(() => {
    const groupColumn = {
      id: 'group',
      header: t('Group'),
      cell: ({ row }: Cell) => (
        <div className="flex flex-col gap-1">
          <span className="mono font-semibold text-foreground">{row.original.group}</span>
          {row.original.description === '' ||
          row.original.description === row.original.group ? null : (
            <span className="text-xs text-muted">{row.original.description}</span>
          )}
          {autoChain.includes(row.original.group) ? (
            <span>
              <Badge size="sm" tone="muted">
                {t('In auto fallback')}
              </Badge>
            </span>
          ) : null}
        </div>
      ),
      meta: { label: t('Group'), mobilePrimary: true },
    }

    const ratioColumn = {
      id: 'ratio',
      header: t('Group ratio'),
      cell: ({ row }: Cell) =>
        row.original.ratio === undefined ? t('Not published') : formatMultiplier(row.original.ratio),
      meta: { label: t('Group ratio'), align: 'right' as const, mono: true },
    }

    // A tiered row prices from its expression, so a per-group rate would be a guess.
    if (shape === 'tiered') return [groupColumn, ratioColumn]

    if (shape === 'per-request') {
      return [
        groupColumn,
        ratioColumn,
        {
          id: 'per-request',
          header: t('Per request'),
          cell: ({ row }: Cell) =>
            row.original.ratio === undefined
              ? '—'
              : formatModelPrice(perRequestPrice(model, row.original.ratio)),
          meta: { label: t('Per request'), align: 'right' as const, mono: true },
        },
      ]
    }

    return [
      groupColumn,
      ratioColumn,
      ...priceKinds.map((entry) => ({
        id: entry.kind,
        header: t(entry.labelKey),
        cell: ({ row }: Cell) => {
          if (row.original.ratio === undefined) return '—'
          const price = tokenPricePerMillion(model, entry.kind, row.original.ratio)
          return price === undefined ? '—' : formatModelPrice(price)
        },
        meta: { label: t(entry.labelKey), align: 'right' as const, mono: true },
      })),
    ]
  }, [autoChain, model, priceKinds, shape, t])

  const { table } = useDataTable<GroupPriceRow>({
    columns,
    data: rows,
    defaultPageSize: ALL_ROWS,
    getRowId: (row) => row.group,
    total: rows.length,
  })

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        emptyDescription={t('This model is not enabled for any group the gateway publishes.')}
        emptyTitle={t('No priced groups')}
        label={t('Price by pricing group')}
        minWidthClassName="min-w-[640px]"
        table={table}
      />
      {shape === 'per-token' ? (
        <p className="px-5 pb-1 text-xs text-muted">{t('Token prices are per 1M tokens.')}</p>
      ) : null}
      {shape === 'tiered' ? (
        <p className="px-5 pb-1 text-xs text-muted">
          {t('The tier rate above is multiplied by the group ratio shown here.')}
        </p>
      ) : null}
    </div>
  )
}
