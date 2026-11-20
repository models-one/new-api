import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import RouteIcon from 'lucide-react/dist/esm/icons/route'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTable,
  DataTableColumnHeader,
  MonoCell,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { Input, NumberInput, RadioGroup, SwitchRow, Textarea } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Panel, Separator } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { AffinityRuleDialog, globalModeLabel } from '@/features/system-settings/request-policy/AffinityRuleDialog'
import {
  effectiveSessionMode,
  newAffinityRule,
  readAffinityRules,
  writeAffinityRules,
  type AffinityRule,
} from '@/features/system-settings/request-policy/affinity-rules'
import { usePolicySectionForm } from '@/features/system-settings/request-policy/api'
import { parseStatusCodeRules } from '@/features/system-settings/models-operations/status-code-rules'
import {
  channelAffinityCacheQuery,
  clearChannelAffinityCache,
} from '@/features/system-settings/models-operations/api'
import {
  compactJson,
  formatJsonForEditing,
  jsonErrorMessage,
  validateJsonText,
} from '@/features/system-settings/models-operations/json-text'
import { formatCompactNumber } from '@/lib/format'

/**
 * `/system-settings/request-policies/routing`
 *
 * Sticky routing: once a request identified by some key has been served by a channel, the
 * next request carrying the same key goes back to that channel. Six keys, all present in
 * `GET /api/option/`, plus the cache endpoints:
 *
 *   GET    /api/option/channel_affinity_cache
 *          → {enabled, total, unknown, by_rule_name, cache_capacity, cache_algo}
 *   DELETE /api/option/channel_affinity_cache?all=true      → {deleted}
 *   DELETE /api/option/channel_affinity_cache?rule_name=…   → {deleted}
 * All three verified live; the dev server answers
 * `{"enabled":true,"total":0,"unknown":0,"by_rule_name":{"claude cli trace":0,"codex cli
 * trace":0},"cache_capacity":100000,"cache_algo":"lru"}`.
 *
 * WHY THE RULE LIST IS VALIDATED HERE AND NOT ON THE SERVER: `channel_affinity_setting.rules`
 * is NOT one of the keys `controller.UpdateOption` checks. Writing the literal text
 * `not json` to it returns `{"success":true}` and is stored verbatim (verified live, and
 * restored afterwards). The gateway then parses nothing and every affinity rule silently
 * stops matching, with no error anywhere. The array-of-objects check below is the only
 * thing standing between a typo and that outcome.
 *
 * `by_rule_name` only counts rules whose `include_rule_name` is true; everything else is
 * folded into `unknown`, which is why the per-rule counts below say so rather than showing
 * a zero that would read as "this rule is idle".
 */

type RawRule = {
  name?: unknown
  model_regex?: unknown
  path_regex?: unknown
  key_sources?: unknown
  ttl_seconds?: unknown
  skip_retry_on_failure?: unknown
  include_rule_name?: unknown
}

/** Total: a malformed blob yields an empty list, and the editor still shows the raw text. */
function parseRules(raw: string): RawRule[] {
  const trimmed = raw.trim()
  if (trimmed === '') return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is RawRule =>
        typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    )
  } catch {
    return []
  }
}

function readRuleName(rule: RawRule): string {
  return typeof rule.name === 'string' && rule.name.trim() !== '' ? rule.name : ''
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function describeKeySources(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) return '—'
    const source = entry as { type?: unknown; key?: unknown; path?: unknown }
    const type = typeof source.type === 'string' ? source.type : '?'
    // `gjson` sources carry a `path`, the rest carry a `key`; either identifies the source.
    const path = typeof source.path === 'string' ? source.path : ''
    const key = typeof source.key === 'string' ? source.key : ''
    const detail = path !== '' ? path : key
    return detail === '' ? type : `${type}:${detail}`
  })
}

/** One row of the rule table: what the blob says, joined to what the live cache reports. */
type AffinityRuleRow = {
  index: number
  name: string
  models: string[]
  keySources: string[]
  ttlSeconds: number
  skipRetry: boolean
  /** The mode the rule runs in, as the server resolves it. */
  mode: 'off' | 'prefer' | 'strict'
  /** True when the rule tags its cache entries, which is what makes a per-rule clear possible. */
  tracked: boolean
  /** Undefined when the rule is not tracked — a 0 there would read as "idle", not "unknown". */
  entries: number | undefined
}

type AffinityDraft = {
  'channel_affinity_setting.enabled': boolean
  /** off | prefer | strict; '' (never saved) runs as prefer. */
  'channel_affinity_setting.session_mode': string
  RetryTimes: number
  AutomaticRetryStatusCodes: string
  'channel_affinity_setting.switch_on_success': boolean
  'channel_affinity_setting.keep_on_channel_disabled': boolean
  'channel_affinity_setting.max_entries': number
  'channel_affinity_setting.default_ttl_seconds': number
  'channel_affinity_setting.rules': string
}

function toDraft(options: SystemOptionMap | undefined): AffinityDraft {
  return {
    AutomaticRetryStatusCodes: readOptionString(options, 'AutomaticRetryStatusCodes'),
    RetryTimes: readOptionNumber(options, 'RetryTimes'),
    'channel_affinity_setting.session_mode': readOptionString(options, 'channel_affinity_setting.session_mode'),
    'channel_affinity_setting.default_ttl_seconds': readOptionNumber(
      options,
      'channel_affinity_setting.default_ttl_seconds',
      3600,
    ),
    'channel_affinity_setting.enabled': readOptionBoolean(
      options,
      'channel_affinity_setting.enabled',
    ),
    'channel_affinity_setting.keep_on_channel_disabled': readOptionBoolean(
      options,
      'channel_affinity_setting.keep_on_channel_disabled',
    ),
    'channel_affinity_setting.max_entries': readOptionNumber(
      options,
      'channel_affinity_setting.max_entries',
      100000,
    ),
    'channel_affinity_setting.rules': formatJsonForEditing(
      readOptionString(options, 'channel_affinity_setting.rules', '[]'),
    ),
    'channel_affinity_setting.switch_on_success': readOptionBoolean(
      options,
      'channel_affinity_setting.switch_on_success',
      true,
    ),
  }
}

const serializeAffinity = {
  AutomaticRetryStatusCodes: (value: string | number | boolean) => parseStatusCodeRules(String(value)).normalized,
  'channel_affinity_setting.rules': (value: string | number | boolean) =>
    compactJson(String(value), '[]'),
}

export function SessionsRetriesSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [ruleToClear, setRuleToClear] = useState<string | undefined>(undefined)

  const [editing, setEditing] = useState<{ index: number | null; rule: AffinityRule } | null>(null)
  const [jsonView, setJsonView] = useState(false)

  const { form, isPending } = usePolicySectionForm<AffinityDraft>({
    serialize: serializeAffinity,
    toDraft,
    validate: (values) => {
      const errors: Partial<Record<keyof AffinityDraft, string>> = {}
      const retryRules = parseStatusCodeRules(values.AutomaticRetryStatusCodes)
      if (!retryRules.ok) {
        errors.AutomaticRetryStatusCodes = t('Not a status code or range: {{tokens}}', { tokens: retryRules.invalidTokens.join(', ') })
      }
      if (!Number.isInteger(values.RetryTimes) || values.RetryTimes < 0 || values.RetryTimes > 10) {
        errors.RetryTimes = t('Enter a whole number between 0 and 10.')
      }

      errors['channel_affinity_setting.rules'] = jsonErrorMessage(
        validateJsonText(values['channel_affinity_setting.rules'], 'object-array'),
        t,
      )

      if (errors['channel_affinity_setting.rules'] === undefined) {
        const rules = parseRules(values['channel_affinity_setting.rules'])
        const unnamed = rules.some((rule) => readRuleName(rule) === '')
        if (unnamed) {
          errors['channel_affinity_setting.rules'] = t('Every rule needs a non-empty "name".')
        } else {
          const names = rules.map((rule) => readRuleName(rule))
          if (new Set(names).size !== names.length) {
            errors['channel_affinity_setting.rules'] = t('Two rules share the same "name". Cache entries are keyed by rule name, so the names must be unique.')
          }
        }
      }

      if (values['channel_affinity_setting.max_entries'] < 0) {
        errors['channel_affinity_setting.max_entries'] = t('Enter zero or more entries.')
      }
      if (values['channel_affinity_setting.default_ttl_seconds'] < 0) {
        errors['channel_affinity_setting.default_ttl_seconds'] = t('Enter zero or more seconds.')
      }
      return errors
    },
  })

  const affinityEnabled = form.values['channel_affinity_setting.enabled']
  const cacheQuery = useQuery(channelAffinityCacheQuery(!isPending))

  const clearMutation = useMutation({
    mutationFn: (target: { all: true } | { ruleName: string }) => clearChannelAffinityCache(target),
    onError: (error) => toast.error(toErrorMessage(error)),
    onSuccess: async (result) => {
      toast.success(t('{{count}} affinity entries dropped.', { count: result.deleted }))
      await queryClient.invalidateQueries({
        queryKey: ['system-settings', 'channel-affinity', 'cache'],
      })
    },
  })

  const disabled = isPending || form.isSaving
  const globalMode = form.values['channel_affinity_setting.session_mode'] || 'prefer'
  const editableRules = readAffinityRules(form.values['channel_affinity_setting.rules'])
  const setRules = (next: AffinityRule[]) => form.setField('channel_affinity_setting.rules', formatJsonForEditing(writeAffinityRules(next)))
  // The rule columns are memoised; they reach the current setter through this ref.
  const setRulesRef = useRef(setRules)
  setRulesRef.current = setRules
  const rules = parseRules(form.values['channel_affinity_setting.rules'])
  const cache = cacheQuery.data

  const ruleRows = useMemo<AffinityRuleRow[]>(
    () =>
      rules.map((rule, index) => {
        const name = readRuleName(rule)
        // `include_rule_name` is what makes the gateway tag its cache entries with the rule,
        // so without it there is no per-rule count and no per-rule clear.
        const tracked = rule.include_rule_name === true && name !== ''
        const typed = editableRules?.[index]
        return {
          entries: tracked ? (cache?.by_rule_name[name] ?? 0) : undefined,
          index,
          mode: typed === undefined ? 'prefer' : effectiveSessionMode(typed, globalMode),
          keySources: describeKeySources(rule.key_sources),
          models: readStringList(rule.model_regex),
          name,
          skipRetry: rule.skip_retry_on_failure === true,
          tracked,
          ttlSeconds: typeof rule.ttl_seconds === 'number' ? rule.ttl_seconds : 0,
        }
      }),
    [cache, editableRules, globalMode, rules],
  )

  const ruleColumns = useMemo<DataTableColumns<AffinityRuleRow>>(
    () => [
      {
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="mono font-semibold text-foreground">
              {row.original.name === '' ? t('(unnamed)') : row.original.name}
            </span>
            <Badge size="sm" tone={row.original.mode === 'strict' ? 'warning' : 'muted'}>
              {t(globalModeLabel(row.original.mode))}
            </Badge>
          </span>
        ),
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Rule')} />,
        id: 'name',
        meta: { label: t('Rule'), mobilePrimary: true },
      },
      {
        cell: ({ row }) => <MonoCell value={row.original.models.join(', ') || '—'} />,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Models')} />,
        id: 'models',
        meta: { label: t('Models'), mono: true },
      },
      {
        cell: ({ row }) => <MonoCell value={row.original.keySources.join(', ') || '—'} />,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Key sources')} />,
        id: 'key-sources',
        meta: { label: t('Key sources'), mono: true },
      },
      {
        cell: ({ row }) =>
          row.original.ttlSeconds > 0
            ? t('{{count}} seconds', { count: row.original.ttlSeconds })
            : t('Section default'),
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Lifetime')} />,
        id: 'ttl',
        meta: { label: t('Lifetime') },
      },
      {
        cell: ({ row }) =>
          row.original.entries === undefined ? (
            <span className="text-muted">{t('Not counted')}</span>
          ) : (
            <MonoCell value={formatCompactNumber(row.original.entries)} />
          ),
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader align="right" column={column} title={t('Entries')} />
        ),
        id: 'entries',
        meta: { align: 'right', label: t('Entries') },
      },
      {
        cell: ({ row }) => (
          <span className="flex justify-end gap-1">
          <Button
            aria-label={t('Edit rule {{rule}}', { rule: row.original.name })}
            disabled={disabled || editableRules === null}
            onClick={() => editableRules && setEditing({ index: row.original.index, rule: editableRules[row.original.index] })}
            size="sm"
            variant="quiet"
          >
            {t('Edit')}
          </Button>
          <Button
            aria-label={t('Remove rule {{rule}}', { rule: row.original.name })}
            disabled={disabled || editableRules === null}
            onClick={() => editableRules && setRulesRef.current(editableRules.filter((_, at) => at !== row.original.index))}
            size="sm"
            variant="quiet"
          >
            {t('Remove')}
          </Button>
          <Button
            disabled={!row.original.tracked || clearMutation.isPending}
            onClick={() => setRuleToClear(row.original.name)}
            size="sm"
            title={
              row.original.tracked
                ? t('Clear the entries remembered under this rule')
                : t('This rule does not tag its cache entries, so they cannot be cleared on their own.')
            }
            variant="quiet"
          >
            {t('Clear')}
          </Button>
          </span>
        ),
        enableSorting: false,
        header: () => <span className="sr-only">{t('Actions')}</span>,
        id: 'actions',
        meta: { align: 'right', label: t('Actions') },
      },
    ],
    [clearMutation.isPending, disabled, editableRules, t],
  )

  const { table: ruleTable } = useDataTable<AffinityRuleRow>({
    columns: ruleColumns,
    data: ruleRows,
    getRowId: (row) => `${row.index}-${row.name}`,
  })

  /**
   * Three states apart: a cache read that failed must not render as an empty cache, because
   * "nothing is remembered" and "we could not ask" call for opposite reactions.
   */
  const cachePanel = ((): ReactNode => {
    if (cacheQuery.isPending) {
      return (
        <p className="text-xs text-muted" role="status">
          {t('Reading the affinity cache…')}
        </p>
      )
    }

    if (cacheQuery.isError) {
      return (
        <Alert
          action={
            <Button
              aria-busy={cacheQuery.isFetching}
              disabled={cacheQuery.isFetching}
              onClick={() => void cacheQuery.refetch()}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('The affinity cache could not be read')}
          tone="destructive"
        >
          {toErrorMessage(cacheQuery.error)}
        </Alert>
      )
    }

    return (
            <>
              {cache !== undefined && !cache.enabled ? (
                <Alert title={t('Affinity is switched off')} tone="warning">
                  {t('The gateway reports affinity as disabled, so nothing is being remembered and no rule below is being applied.')}
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge size="sm" tone="muted">
                  {t('{{used}} of {{capacity}} entries', {
                    capacity: formatCompactNumber(cache?.cache_capacity ?? 0),
                    used: formatCompactNumber(cache?.total ?? 0),
                  })}
                </Badge>
                <Badge size="sm" tone="muted">
                  {t('Eviction: {{algorithm}}', { algorithm: cache?.cache_algo ?? '—' })}
                </Badge>
                <Badge size="sm" tone="muted">
                  {t('{{count}} not attributed to a rule', { count: cache?.unknown ?? 0 })}
                </Badge>
              </div>

              <p className="text-xs leading-5 text-muted">
                {t('A rule is only counted separately when its include_rule_name flag is set; without it the entries are pooled and can only be cleared all at once.')}
              </p>
            </>
    )
  })()

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        description={t('Sends a conversation back to the channel that already served it, and decides how a failed request is retried.')}
        form={form}
        note={t('Saved together with retries and channel health as one policy: the server checks all of it, every rule and pattern included, before storing any of it.')}
        atomic
      saveMode="section"
        title={t('Sessions and retries')}
      >
        <SwitchRow
          checked={affinityEnabled}
          description={t('The master switch. With it off, every request is routed as if no affinity rule existed and the cache is ignored.')}
          disabled={disabled}
          label={t('Route repeat requests back to the same channel')}
          onCheckedChange={(checked) => form.setField('channel_affinity_setting.enabled', checked)}
        />

        <SwitchRow
          checked={form.values['channel_affinity_setting.switch_on_success']}
          description={t('When the remembered channel fails and a retry succeeds elsewhere, the entry is moved to the channel that worked. With this off the entry keeps pointing at the failing channel.')}
          disabled={disabled || !affinityEnabled}
          label={t('Follow a successful retry to its new channel')}
          onCheckedChange={(checked) =>
            form.setField('channel_affinity_setting.switch_on_success', checked)
          }
        />

        <SwitchRow
          checked={form.values['channel_affinity_setting.keep_on_channel_disabled']}
          description={t('Keeps the entry when its channel is disabled or is no longer usable for that group and model. With this off the entry is dropped and the next request picks a channel normally.')}
          disabled={disabled || !affinityEnabled}
          label={t('Keep the entry when its channel goes away')}
          onCheckedChange={(checked) =>
            form.setField('channel_affinity_setting.keep_on_channel_disabled', checked)
          }
        />

        <div className="grid gap-5 md:grid-cols-2">
          <NumberInput
            description={t('The cache holds this many entries at most, evicted least-recently-used first. The live cache reports {{used}} of {{capacity}} in use.', {
              capacity: formatCompactNumber(cache?.cache_capacity ?? 0),
              used: formatCompactNumber(cache?.total ?? 0),
            })}
            disabled={disabled || !affinityEnabled}
            error={form.errors['channel_affinity_setting.max_entries']}
            invalid={form.errors['channel_affinity_setting.max_entries'] !== undefined}
            label={t('Maximum remembered conversations')}
            min={0}
            onValueChange={(value) =>
              form.setField('channel_affinity_setting.max_entries', value ?? Number.NaN)
            }
            step={1}
            value={form.values['channel_affinity_setting.max_entries']}
          />
          <NumberInput
            description={t('How long an entry survives without being used, when its rule does not set a lifetime of its own. 0 means it never expires on time alone.')}
            disabled={disabled || !affinityEnabled}
            error={form.errors['channel_affinity_setting.default_ttl_seconds']}
            invalid={form.errors['channel_affinity_setting.default_ttl_seconds'] !== undefined}
            label={t('Default entry lifetime (seconds)')}
            min={0}
            onValueChange={(value) =>
              form.setField('channel_affinity_setting.default_ttl_seconds', value ?? Number.NaN)
            }
            step={1}
            value={form.values['channel_affinity_setting.default_ttl_seconds']}
          />
        </div>

        <RadioGroup<string>
          description={t('Used by every rule set to “Same as global”.')}
          disabled={disabled || !affinityEnabled}
          label={t('Global session mode')}
          onValueChange={(mode) => form.setField('channel_affinity_setting.session_mode', mode)}
          options={[
            { description: t('Rules match but never remember or reuse a channel.'), label: t('Off'), value: 'off' },
            { description: t('Reuse the remembered channel while it is usable; otherwise another channel serves and retries work as usual. Fewer cache hits upstream than strict.'), label: t('Prefer'), value: 'prefer' },
            { description: t('Only the remembered channel. If it cannot serve, the request fails with 503 and is not retried elsewhere.'), label: t('Strict'), value: 'strict' },
          ]}
          orientation="horizontal"
          value={globalMode}
          variant="card"
        />

        <Separator />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">{t('Affinity rules')}</p>
              <p className="text-xs leading-5 text-muted">{t('Which requests stick to a channel, and the request value that identifies them. The first matching rule applies.')}</p>
            </div>
            <span className="flex gap-2">
              <Button disabled={disabled || editableRules === null} onClick={() => setEditing({ index: null, rule: newAffinityRule() })} size="sm" variant="outline">
                {t('Add rule')}
              </Button>
              <Button onClick={() => setJsonView(!jsonView)} size="sm" variant="quiet">
                {jsonView ? t('Hide JSON') : t('Edit as JSON')}
              </Button>
            </span>
          </div>
          {editableRules === null && !jsonView ? (
            <Alert tone="warning">{t('The stored rules are not a JSON array of objects. Fix them as JSON.')}</Alert>
          ) : null}
                <DataTable
                  columns={ruleColumns}
                  emptyDescription={t('No affinity rule is configured, so every request is routed normally. Add a rule above to start pinning conversations to a channel.')}
                  emptyIcon={<RouteIcon aria-hidden="true" />}
                  emptyTitle={t('No affinity rules')}
                  isFetching={cacheQuery.isFetching}
                  label={t('Affinity rules and their cached entries')}
                  minWidthClassName="min-w-[46rem]"
                  table={ruleTable}
                />
          {jsonView || editableRules === null ? (
            <Textarea
              description={t('A JSON array of rule objects: name, model_regex, path_regex, key_sources, ttl_seconds and the include_* flags that decide what the cache key is built from. Each rule must carry a unique name.')}
              disabled={disabled}
              error={form.errors['channel_affinity_setting.rules']}
              invalid={form.errors['channel_affinity_setting.rules'] !== undefined}
              label={t('Affinity rules')}
              onChange={(event) => form.setField('channel_affinity_setting.rules', event.target.value)}
              rows={14}
              spellCheck={false}
              textareaClassName="mono text-xs"
              value={form.values['channel_affinity_setting.rules']}
            />
          ) : null}
          {form.errors['channel_affinity_setting.rules'] && !jsonView ? (
            <p className="text-xs text-destructive" role="alert">{form.errors['channel_affinity_setting.rules']}</p>
          ) : null}
        </div>
        <Separator />

        <div className="flex flex-col gap-4">
          <p className="eyebrow">{t('Request retry')}</p>
          <div className="grid gap-5 md:grid-cols-2">
            <NumberInput
              description={t('How many other channels one failed request may be re-sent to before the caller gets the error. 0 means the first failure is returned. Requests under a strict rule are never retried.')}
              disabled={disabled}
              error={form.errors.RetryTimes}
              invalid={form.errors.RetryTimes !== undefined}
              label={t('Retry attempts')}
              max={10}
              min={0}
              onValueChange={(value) => form.setField('RetryTimes', value ?? Number.NaN)}
              step={1}
              value={form.values.RetryTimes}
            />
            <Input
              description={t('Comma separated codes and inclusive ranges, e.g. 429,500-599. A response in this set is retried on another channel; it does not disable anything.')}
              disabled={disabled}
              error={form.errors.AutomaticRetryStatusCodes}
              invalid={form.errors.AutomaticRetryStatusCodes !== undefined}
              label={t('Status codes that trigger a retry')}
              onChange={(event) => form.setField('AutomaticRetryStatusCodes', event.target.value)}
              placeholder="429,500-599"
              value={form.values.AutomaticRetryStatusCodes}
            />
          </div>
        </div>
      </SettingsSection>

      {editing === null || editableRules === null ? null : (
        <AffinityRuleDialog
          globalMode={globalMode}
          isNew={editing.index === null}
          onCancel={() => setEditing(null)}
          onDone={(rule) => {
            setRules(editing.index === null ? [...editableRules, rule] : editableRules.map((item, at) => (at === editing.index ? rule : item)))
            setEditing(null)
          }}
          others={editableRules.filter((_, at) => at !== editing.index)}
          rule={editing.rule}
        />
      )}

      <Panel as="section">
        <Panel.Header
          actions={
            <Button
              aria-busy={cacheQuery.isFetching}
              aria-label={t('Refresh the affinity cache')}
              disabled={cacheQuery.isFetching}
              onClick={() => void cacheQuery.refetch()}
              size="icon-md"
              title={t('Refresh the affinity cache')}
              variant="quiet"
            >
              <RefreshCwIcon aria-hidden="true" />
            </Button>
          }
          description={t('What the running gateway is currently remembering. These entries live in memory, not in the option store.')}
          title={t('Live affinity cache')}
        />

        <Panel.Body className="flex flex-col gap-4">
          {cachePanel}
        </Panel.Body>

        <Panel.Footer align="end">
          <Button
            aria-busy={clearMutation.isPending}
            disabled={clearMutation.isPending || cacheQuery.isPending}
            onClick={() => setClearAllOpen(true)}
            size="sm"
            variant="danger"
          >
            {t('Clear every entry')}
          </Button>
        </Panel.Footer>
      </Panel>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Clear every entry')}
        description={t('Every remembered conversation is dropped, across all rules. In-flight requests are unaffected; the next request from each conversation simply picks a channel again.')}
        destructive
        isLoading={clearMutation.isPending}
        onConfirm={() => {
          setClearAllOpen(false)
          clearMutation.mutate({ all: true })
        }}
        onOpenChange={setClearAllOpen}
        open={clearAllOpen}
        title={t('Clear the whole affinity cache?')}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Clear this rule')}
        description={t('Drops every conversation remembered under “{{rule}}”. Other rules keep their entries.', { rule: ruleToClear ?? '' })}
        destructive
        isLoading={clearMutation.isPending}
        onConfirm={() => {
          const name = ruleToClear
          setRuleToClear(undefined)
          if (name !== undefined) clearMutation.mutate({ ruleName: name })
        }}
        onOpenChange={(open) => {
          if (!open) setRuleToClear(undefined)
        }}
        open={ruleToClear !== undefined}
        title={t('Clear this rule’s entries?')}
      />
    </div>
  )
}
