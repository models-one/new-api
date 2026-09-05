import type { Tone } from '@/components/ui'
import type {
  RegistryModel,
  RegistryModelPayload,
  SyncConflict,
  Vendor,
} from '@/features/model-registry/api'

/** `model.NameRule*` (model/model_meta.go). The order is the numeric order. */
export const NAME_RULE = {
  exact: 0,
  prefix: 1,
  contains: 2,
  suffix: 3,
} as const

export type NameRule = (typeof NAME_RULE)[keyof typeof NAME_RULE]

export const NAME_RULES: readonly NameRule[] = [
  NAME_RULE.exact,
  NAME_RULE.prefix,
  NAME_RULE.contains,
  NAME_RULE.suffix,
]

export function isNameRule(value: number): value is NameRule {
  return (NAME_RULES as readonly number[]).includes(value)
}

/**
 * English source strings for `t()`. Kept as literals so every one of them is visible to
 * the extractor; the page translates them at the call site.
 */
const NAME_RULE_LABELS: Record<NameRule, string> = {
  [NAME_RULE.exact]: 'Exact',
  [NAME_RULE.prefix]: 'Prefix',
  [NAME_RULE.contains]: 'Contains',
  [NAME_RULE.suffix]: 'Suffix',
}

const NAME_RULE_DESCRIPTIONS: Record<NameRule, string> = {
  [NAME_RULE.exact]: 'Applies to one published model whose name matches exactly.',
  [NAME_RULE.prefix]: 'Applies to every published model whose name starts with this text.',
  [NAME_RULE.contains]: 'Applies to every published model whose name contains this text.',
  [NAME_RULE.suffix]: 'Applies to every published model whose name ends with this text.',
}

const NAME_RULE_TONES: Record<NameRule, Tone> = {
  [NAME_RULE.exact]: 'muted',
  [NAME_RULE.prefix]: 'info',
  [NAME_RULE.contains]: 'warning',
  [NAME_RULE.suffix]: 'primary',
}

/** The untranslated label for a rule; an unknown number keeps its digits. */
export function nameRuleLabel(rule: number): string {
  return isNameRule(rule) ? NAME_RULE_LABELS[rule] : ''
}

export function nameRuleDescription(rule: number): string {
  return isNameRule(rule) ? NAME_RULE_DESCRIPTIONS[rule] : ''
}

export function nameRuleTone(rule: number): Tone {
  return isNameRule(rule) ? NAME_RULE_TONES[rule] : 'muted'
}

/**
 * `model.parseModelStatusFilter` maps the UI's words onto the column: "enabled" is 1 and
 * "disabled" is 0. The column is a plain int, so a row can hold something else — the
 * table shows that verbatim rather than pretending it is one of the two.
 */
export const MODEL_STATUS = { disabled: 0, enabled: 1 } as const

export type ModelStatusKind = 'enabled' | 'disabled' | 'other'

export function modelStatusKind(status: number): ModelStatusKind {
  if (status === MODEL_STATUS.enabled) return 'enabled'
  if (status === MODEL_STATUS.disabled) return 'disabled'
  return 'other'
}

/**
 * The untranslated label for the status column. An unrecognised integer returns '' so
 * the caller can print the number rather than mislabel it as one of the two known ones.
 */
export function modelStatusLabel(status: number): string {
  const kind = modelStatusKind(status)
  if (kind === 'enabled') return 'Enabled'
  if (kind === 'disabled') return 'Disabled'
  return ''
}

export function modelStatusTone(status: number): Tone {
  const kind = modelStatusKind(status)
  if (kind === 'enabled') return 'success'
  if (kind === 'disabled') return 'muted'
  return 'warning'
}

/** `pricing.QuotaType` (model/pricing.go): 0 token-based, 1 a flat per-request price. */
export const QUOTA_TYPE = { perRequest: 1, tokenBased: 0 } as const

export function quotaTypeLabel(quotaType: number): string {
  if (quotaType === QUOTA_TYPE.tokenBased) return 'Per token'
  if (quotaType === QUOTA_TYPE.perRequest) return 'Per request'
  return ''
}

/** Splits the comma-separated `tags` column, dropping blanks left by trailing commas. */
export function parseTags(tags: string | undefined): string[] {
  if (tags === undefined) return []
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')
}

export function joinTags(tags: string[]): string {
  return tags.map((tag) => tag.trim()).filter((tag) => tag !== '').join(',')
}

/**
 * The ten `types.EndpointType` values (relaykit/types/endpoint_type.go). The server does
 * NOT validate what is written into the column, so this is an offer, not a constraint —
 * `endpointOptions` unions it with whatever a row already holds.
 */
export const ENDPOINT_TYPES = [
  'openai',
  'openai-response',
  'openai-response-compact',
  'openai-alpha-search',
  'anthropic',
  'gemini',
  'jina-rerank',
  'image-generation',
  'embeddings',
  'openai-video',
] as const

/**
 * Reads the `endpoints` column, which is a JSON array string such as `["openai"]`.
 * Anything that is not an array of strings yields an empty list rather than throwing —
 * the column is free text as far as the server is concerned.
 */
export function parseEndpoints(endpoints: string | undefined): string[] {
  if (endpoints === undefined || endpoints.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(endpoints)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

/** The inverse. An empty selection serialises to '' so the server derives the value. */
export function serialiseEndpoints(endpoints: string[]): string {
  return endpoints.length === 0 ? '' : JSON.stringify(endpoints)
}

/** The known types plus anything this row already carries, so nothing is silently lost. */
export function endpointOptions(selected: string[]): string[] {
  const known = new Set<string>(ENDPOINT_TYPES)
  const extra = selected.filter((entry) => !known.has(entry))
  return [...ENDPOINT_TYPES, ...extra]
}

/** The vendor's name, or undefined when the id is 0/absent or names no known vendor. */
export function vendorName(vendors: Vendor[], vendorId: number | undefined): string | undefined {
  if (vendorId === undefined || vendorId === 0) return undefined
  return vendors.find((vendor) => vendor.id === vendorId)?.name
}

export type RegistryFormValues = {
  model_name: string
  description: string
  icon: string
  tags: string
  vendor_id: string
  endpoints: string[]
  name_rule: number
  status: boolean
  sync_official: boolean
}

export function emptyRegistryForm(modelName = ''): RegistryFormValues {
  return {
    description: '',
    endpoints: [],
    icon: '',
    model_name: modelName,
    name_rule: NAME_RULE.exact,
    status: true,
    sync_official: true,
    tags: '',
    vendor_id: '',
  }
}

export function modelToForm(model: RegistryModel): RegistryFormValues {
  return {
    description: model.description ?? '',
    endpoints: parseEndpoints(model.endpoints),
    icon: model.icon ?? '',
    model_name: model.model_name,
    name_rule: model.name_rule,
    status: model.status === MODEL_STATUS.enabled,
    sync_official: model.sync_official !== 0,
    tags: model.tags ?? '',
    vendor_id: model.vendor_id === undefined || model.vendor_id === 0 ? '' : String(model.vendor_id),
  }
}

export type RegistryFormErrors = {
  model_name?: string
}

/**
 * Mirrors the two checks `CreateModelMeta`/`UpdateModelMeta` make before touching the
 * database: a non-empty name, and — server side only — no other row holding it. The
 * duplicate is left to the server, which owns the answer.
 */
export function validateRegistryForm(values: RegistryFormValues): RegistryFormErrors {
  const errors: RegistryFormErrors = {}
  if (values.model_name.trim() === '') {
    errors.model_name = 'A model name is required.'
  }
  return errors
}

export function formToPayload(values: RegistryFormValues): RegistryModelPayload {
  const vendorId = Number.parseInt(values.vendor_id, 10)
  return {
    description: values.description,
    endpoints: serialiseEndpoints(values.endpoints),
    icon: values.icon.trim(),
    model_name: values.model_name.trim(),
    name_rule: values.name_rule,
    status: values.status ? MODEL_STATUS.enabled : MODEL_STATUS.disabled,
    sync_official: values.sync_official ? 1 : 0,
    tags: joinTags(parseTags(values.tags)),
    vendor_id: Number.isFinite(vendorId) ? vendorId : 0,
  }
}

/** The six field keys `SyncUpstreamModels` reads out of an `overwrite` entry. */
export const OVERWRITABLE_FIELDS = [
  'description',
  'icon',
  'tags',
  'vendor',
  'name_rule',
  'status',
] as const

export type OverwritableField = (typeof OVERWRITABLE_FIELDS)[number]

export function isOverwritableField(field: string): field is OverwritableField {
  return (OVERWRITABLE_FIELDS as readonly string[]).includes(field)
}

const FIELD_LABELS: Record<OverwritableField, string> = {
  description: 'Description',
  icon: 'Icon name',
  name_rule: 'Match rule',
  status: 'Status',
  tags: 'Tags',
  vendor: 'Vendor',
}

/** The untranslated label for a conflict field; an unrecognised key keeps its own name. */
export function conflictFieldLabel(field: string): string {
  return isOverwritableField(field) ? FIELD_LABELS[field] : ''
}

/**
 * Renders one side of a conflict for display. `name_rule` and `status` arrive as numbers
 * and mean nothing on their own; everything else is a string that may be empty.
 */
export function conflictValueText(field: string, value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    if (field === 'name_rule') return nameRuleLabel(value)
    if (field === 'status') return ''
    return String(value)
  }
  return ''
}

/** True when the raw conflict value is a number that needs translating, not printing. */
export function isCodedConflictValue(field: string, value: unknown): value is number {
  return typeof value === 'number' && (field === 'name_rule' || field === 'status')
}

/** Every `model_name`/`field` pair a conflict list offers, as `"model field"` keys. */
export function overwriteKey(modelName: string, field: string): string {
  return `${modelName} ${field}`
}

/**
 * Turns the checked `model field` keys back into the API's `overwrite` payload,
 * keeping the order of the preview and dropping models with nothing selected.
 */
export function buildOverwritePayload(
  conflicts: SyncConflict[],
  selected: ReadonlySet<string>,
): { model_name: string; fields: string[] }[] {
  const payload: { model_name: string; fields: string[] }[] = []
  for (const conflict of conflicts) {
    const fields = conflict.fields
      .map((entry) => entry.field)
      .filter((field) => selected.has(overwriteKey(conflict.model_name, field)))
    if (fields.length > 0) payload.push({ fields, model_name: conflict.model_name })
  }
  return payload
}

/**
 * The locales `controller.normalizeLocale` actually honours.
 *
 * Its switch compares a LOWER-CASED input against `"en"`, `"zh-CN"`, `"zh-TW"` and
 * `"ja"`, so the two Chinese arms can never match and the request silently falls back to
 * the default files — verified on the dev server, where `?locale=zh-CN` still resolved to
 * `…/api/newapi/models.json`. Only the three values below change anything, so only they
 * are offered; every preview also shows the URL that was actually read.
 */
export const SYNC_LOCALES = ['', 'en', 'ja'] as const

export type SyncLocale = (typeof SYNC_LOCALES)[number]

export function isSyncLocale(value: string): value is SyncLocale {
  return (SYNC_LOCALES as readonly string[]).includes(value)
}

export type SyncPlan = {
  /** Names the apply call will create, exactly as the preview reported them. */
  create: string[]
  /** Existing rows that differ from upstream. Applied only where a field is ticked. */
  conflicts: SyncConflict[]
  /**
   * DERIVED, not reported: names in `GET /api/models/missing` that the preview's
   * `missing` list does not contain, i.e. the ones upstream has no definition for. The
   * apply call reports the same set back as `skipped_models`.
   */
  skip: string[]
}

/**
 * `skip = MISSING_MODELS − PREVIEW_MISSING`, where MISSING_MODELS is
 * `GET /api/models/missing` and PREVIEW_MISSING is the preview's own `missing` array.
 * The subtraction is done here, in the browser; the UI says so beside the list.
 */
export function buildSyncPlan(
  previewMissing: string[] | null,
  previewConflicts: SyncConflict[] | null,
  missingModels: string[] | undefined,
): SyncPlan {
  const create = previewMissing ?? []
  const creatable = new Set(create)
  return {
    conflicts: previewConflicts ?? [],
    create,
    skip: (missingModels ?? []).filter((name) => !creatable.has(name)),
  }
}

/**
 * DERIVED: registry rows the preview found no upstream difference for.
 * `untouched = REGISTRY_TOTAL − conflicts`, so it counts rows that are identical to
 * upstream, rows upstream does not publish, and rows with `sync_official = 0` alike —
 * the preview excludes all three from `conflicts`. Negative results are clamped to 0
 * because the two numbers come from two separate requests.
 */
export function untouchedCount(registryTotal: number | undefined, conflicts: number): number {
  if (registryTotal === undefined) return 0
  return Math.max(0, registryTotal - conflicts)
}
