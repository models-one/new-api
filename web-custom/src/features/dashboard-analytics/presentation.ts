import type { TFunction } from 'i18next'

import type { FlowNode, FlowStageKind } from '@/features/dashboard-analytics/flow'
import { formatCompactNumber, formatCurrency, formatTokens, quotaToCurrency } from '@/lib/format'

/**
 * English source strings (which double as the i18n keys) for the six dimensions
 * `quota_data` can group by.
 */
export const FLOW_STAGE_LABEL_KEYS: Readonly<Record<FlowStageKind, string>> = {
  user: 'User',
  node: 'Node',
  token: 'API key',
  group: 'Group',
  model: 'Model',
  channel: 'Channel',
}

export function flowStageLabel(kind: FlowStageKind, t: TFunction): string {
  return t(FLOW_STAGE_LABEL_KEYS[kind])
}

/**
 * How a node reads when the server named it, and what it reads instead when it
 * did not. Three cases, and they mean different things:
 *
 *   name present            the server's own label — shown verbatim.
 *   name empty, id > 0      the row exists, the entity does not any more. The
 *                           backend leaves `token_name`/`channel_name` empty on
 *                           purpose for a soft-deleted row so the console can
 *                           say "deleted", which it does here.
 *   name empty, id 0        the field was omitted from the payload entirely;
 *                           this traffic carries no value for the dimension.
 */
export function flowNodeLabel(node: FlowNode, t: TFunction): string {
  if (node.name !== '') return node.name

  if (node.refId > 0) {
    if (node.kind === 'token') return t('Deleted key #{{id}}', { id: node.refId })
    if (node.kind === 'channel') return t('Deleted channel #{{id}}', { id: node.refId })
    if (node.kind === 'user') return t('Deleted user #{{id}}', { id: node.refId })
    return t('#{{id}}', { id: node.refId })
  }

  return t('Unattributed')
}

/** True when the node stands for traffic the endpoint could not attribute. */
export function isUnattributed(node: FlowNode): boolean {
  return node.name === '' && node.refId === 0
}

/** English source strings for the three measures every panel can switch between. */
export const METRIC_LABEL_KEYS = {
  quota: 'Spend',
  tokens: 'Tokens',
  requests: 'Requests',
} as const

export type AnalyticsMetric = keyof typeof METRIC_LABEL_KEYS

export type MetricProjection = {
  /** Pulls the metric out of a measures record, converting quota to currency. */
  toValue: (measures: { quota: number; tokens: number; requests: number }) => number
  format: (value: number) => string
  label: string
}

/**
 * Spend is the only measure that needs converting: quota is an integer and the
 * divisor is `quota_per_unit` from `/api/status`, never a literal.
 */
export function metricProjection(
  metric: AnalyticsMetric,
  quotaPerUnit: number,
  t: TFunction,
): MetricProjection {
  if (metric === 'requests') {
    return {
      toValue: (measures) => measures.requests,
      format: formatCompactNumber,
      label: t(METRIC_LABEL_KEYS.requests),
    }
  }
  if (metric === 'tokens') {
    return {
      toValue: (measures) => measures.tokens,
      format: formatTokens,
      label: t(METRIC_LABEL_KEYS.tokens),
    }
  }
  return {
    toValue: (measures) => quotaToCurrency(measures.quota, quotaPerUnit),
    format: (value) => formatCurrency(value),
    label: t(METRIC_LABEL_KEYS.quota),
  }
}
