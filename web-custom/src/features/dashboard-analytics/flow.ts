import type { FlowQuotaRow } from '@/features/dashboard-analytics/api'

/**
 * The dimensions `quota_data` can group traffic by. The order is the order
 * traffic actually moves in — a user picks a key, the key resolves to a group,
 * the group routes a model, the model is served by a channel — so a path reads
 * left to right.
 */
export type FlowStageKind = 'user' | 'node' | 'token' | 'group' | 'model' | 'channel'

export const FLOW_STAGE_ORDER: readonly FlowStageKind[] = [
  'user',
  'node',
  'token',
  'group',
  'model',
  'channel',
]

export type FlowMetric = 'quota' | 'tokens' | 'requests'

export type FlowMeasures = {
  quota: number
  tokens: number
  requests: number
}

/**
 * One end of a flow link. `name` is exactly what the server sent — empty when it
 * sent none — and `refId` is the numeric id, 0 when the payload omitted it.
 * The pair is what distinguishes a DELETED token (`refId > 0`, `name` empty,
 * which `fillFlowTokenNames` produces deliberately) from an UNATTRIBUTED one
 * (`refId` 0). Rendering that distinction is the UI's job, not this module's.
 */
export type FlowNode = {
  kind: FlowStageKind
  /** Stable identity within its stage, e.g. `token:3` or `model:gpt-4o`. */
  id: string
  name: string
  refId: number
}

export type FlowNodeTotals = FlowNode & FlowMeasures & {
  /** Percentage of {@link flowTotals}'s quota for the same rows. Derived here. */
  share: number
}

export type FlowStageBreakdown = {
  kind: FlowStageKind
  nodes: FlowNodeTotals[]
}

export type FlowPath = {
  /** Stable React key: every node id joined. */
  key: string
  /** One node per visible stage, in {@link FLOW_STAGE_ORDER}. */
  nodes: FlowNode[]
} & FlowMeasures & { share: number }

/** A node id per stage. An absent stage is unfiltered. */
export type FlowFilters = Partial<Record<FlowStageKind, string>>

function measure(row: FlowQuotaRow): FlowMeasures {
  return { quota: row.quota, tokens: row.token_used, requests: row.count }
}

export function metricOf(measures: FlowMeasures, metric: FlowMetric): number {
  if (metric === 'requests') return measures.requests
  if (metric === 'tokens') return measures.tokens
  return measures.quota
}

/**
 * Builds the node a row occupies at one stage.
 *
 * The id falls back to the NAME when the payload carried no numeric id, so two
 * rows for the same deleted-but-named entity still collapse into one node
 * instead of splitting. Rows with neither become a single `:none` bucket per
 * stage, which is the honest reading: the endpoint could not attribute them.
 */
export function flowNodeAt(row: FlowQuotaRow, kind: FlowStageKind): FlowNode {
  const build = (refId: number, name: string): FlowNode => {
    let key = 'none'
    if (refId > 0) key = String(refId)
    else if (name !== '') key = name
    return { kind, id: `${kind}:${key}`, name, refId }
  }

  switch (kind) {
    case 'user':
      return build(row.user_id ?? 0, row.username ?? '')
    case 'node':
      return build(0, row.node_name ?? '')
    case 'token':
      return build(row.token_id ?? 0, row.token_name ?? '')
    case 'group':
      return build(0, row.use_group ?? '')
    case 'model':
      return build(0, row.model_name ?? '')
    case 'channel':
      return build(row.channel_id ?? 0, row.channel_name ?? '')
  }
}

/** True when the row carries any value at all for this dimension. */
function rowHasStage(row: FlowQuotaRow, kind: FlowStageKind): boolean {
  const node = flowNodeAt(row, kind)
  return node.refId > 0 || node.name !== ''
}

/**
 * The stages the RESPONSE actually populated, in flow order.
 *
 * Derived from the rows rather than from the caller's role because the two are
 * not the same question: `/api/data/flow` for a root user selects `node_name`,
 * but every seeded row leaves it empty, and a stage whose every row reads
 * "unattributed" is a column of noise. A stage appears only once at least one
 * row names something in it.
 */
export function visibleFlowStages(rows: readonly FlowQuotaRow[]): FlowStageKind[] {
  return FLOW_STAGE_ORDER.filter((kind) => rows.some((row) => rowHasStage(row, kind)))
}

export function flowTotals(rows: readonly FlowQuotaRow[]): FlowMeasures {
  return rows.reduce<FlowMeasures>(
    (total, row) => ({
      quota: total.quota + row.quota,
      tokens: total.tokens + row.token_used,
      requests: total.requests + row.count,
    }),
    { quota: 0, tokens: 0, requests: 0 },
  )
}

/** Keeps the rows whose node at each filtered stage matches the selected id. */
export function filterFlowRows(
  rows: readonly FlowQuotaRow[],
  filters: FlowFilters,
): FlowQuotaRow[] {
  const active = Object.entries(filters).filter(([, id]) => id !== undefined && id !== '')
  if (active.length === 0) return [...rows]

  return rows.filter((row) =>
    active.every(([kind, id]) => flowNodeAt(row, kind as FlowStageKind).id === id),
  )
}

/** Every filter except the one belonging to `kind` — see {@link flowStageBreakdown}. */
export function filtersExcept(filters: FlowFilters, kind: FlowStageKind): FlowFilters {
  const rest: FlowFilters = { ...filters }
  delete rest[kind]
  return rest
}

/**
 * Totals per node at one stage, largest first.
 *
 * The filters for the stage's OWN kind are deliberately dropped: selecting one
 * token should narrow the model bars, not collapse the token bars to the single
 * bar you just picked. Every other stage's filter still applies, so each stage
 * answers "given everything else selected, how does this dimension split".
 *
 * `share` is this console's arithmetic — the endpoint reports no percentages —
 * taken against the quota of the rows this breakdown covers.
 */
export function flowStageBreakdown(
  rows: readonly FlowQuotaRow[],
  kind: FlowStageKind,
  filters: FlowFilters = {},
): FlowStageBreakdown {
  const scoped = filterFlowRows(rows, filtersExcept(filters, kind))
  const byNode = new Map<string, FlowNodeTotals>()

  for (const row of scoped) {
    const node = flowNodeAt(row, kind)
    const existing = byNode.get(node.id)
    if (existing) {
      existing.quota += row.quota
      existing.tokens += row.token_used
      existing.requests += row.count
      // Only some rows of a node may carry the name; keep the first that does.
      if (existing.name === '' && node.name !== '') existing.name = node.name
      continue
    }
    byNode.set(node.id, { ...node, ...measure(row), share: 0 })
  }

  const total = flowTotals(scoped).quota
  const nodes = [...byNode.values()]
    .map((node) => ({ ...node, share: total > 0 ? (node.quota / total) * 100 : 0 }))
    .sort((left, right) => right.quota - left.quota || left.id.localeCompare(right.id))

  return { kind, nodes }
}

/**
 * One entry per distinct path across the visible stages.
 *
 * The server has already grouped by its full dimension set, so with every stage
 * visible each row is its own path. Re-aggregating by the path key keeps that
 * true when a stage is hidden and two rows would otherwise appear twice under
 * the same label.
 */
export function flowPaths(
  rows: readonly FlowQuotaRow[],
  stages: readonly FlowStageKind[],
  filters: FlowFilters = {},
): FlowPath[] {
  // With no dimension there is no path to describe, only a grand total, and a
  // single unlabelled row claiming the whole window would read as a real path.
  if (stages.length === 0) return []

  const scoped = filterFlowRows(rows, filters)
  const byPath = new Map<string, FlowPath>()

  for (const row of scoped) {
    const nodes = stages.map((kind) => flowNodeAt(row, kind))
    const key = nodes.map((node) => node.id).join(' > ')
    const existing = byPath.get(key)
    if (existing) {
      existing.quota += row.quota
      existing.tokens += row.token_used
      existing.requests += row.count
      for (const [index, node] of nodes.entries()) {
        const held = existing.nodes[index]
        if (held && held.name === '' && node.name !== '') held.name = node.name
      }
      continue
    }
    byPath.set(key, { key, nodes, ...measure(row), share: 0 })
  }

  const total = flowTotals(scoped).quota
  return [...byPath.values()]
    .map((path) => ({ ...path, share: total > 0 ? (path.quota / total) * 100 : 0 }))
    .sort((left, right) => right.quota - left.quota || left.key.localeCompare(right.key))
}

export function countActiveFilters(filters: FlowFilters): number {
  return Object.values(filters).filter((id) => id !== undefined && id !== '').length
}
