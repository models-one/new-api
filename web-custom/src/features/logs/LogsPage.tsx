import { useQuery } from '@tanstack/react-query'
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'
import ChevronUpIcon from 'lucide-react/dist/esm/icons/chevron-up'
import ScrollTextIcon from 'lucide-react/dist/esm/icons/scroll-text'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BadgeCell,
  DataTable,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  MobileCardList,
  MonoCell,
  TruncatedCell,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { NativeSelect, SearchInput, type NativeSelectOption } from '@/components/form'
import { toErrorMessage } from '@/components/overlay'
import {
  Alert,
  Button,
  CopyButton,
  DescriptionList,
  PageHeader,
  Panel,
  type DescriptionListItem,
} from '@/components/ui'
import { scopedLogsQuery, type AdminLogFilters, type LogScope } from '@/features/logs/api'
import { LogScopeControl } from '@/features/logs/components/LogScopeControl'
import { LogStatsStrip } from '@/features/logs/components/LogStatsStrip'
import {
  LOG_OTHER_COUNT_KEYS,
  LOG_TYPE_FILTER_VALUES,
  LOG_TYPE_LABEL_KEYS,
  logAdminOtherEntries,
  logOtherEntries,
  logRequestId,
  logRowId,
  logTypeTone,
  useTimeIsSubSecond,
  type LogOtherEntry,
} from '@/features/logs/log-presentation'
import { useLogScope } from '@/features/logs/use-log-scope'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { LOG_TYPE, type UserLog } from '@/lib/api/logs'
import { userGroupsQuery } from '@/lib/api/user'
import {
  formatDateTime,
  formatLatencyMs,
  formatNumber,
  formatQuota,
  formatTime,
  formatTokens,
  toUnixSeconds,
} from '@/lib/format'

/**
 * The only text filters the two listings accept, and how each is matched (see
 * `model.GetUserLogs` / `model.GetAllLogs` / `applyExplicitLogTextFilter`):
 *   request_id  — `=`, exact                     both scopes
 *   token_name  — `=`, exact                     both scopes
 *   model_name  — `=` unless the value contains a literal `%`, then `LIKE`
 *   username    — same rule as model_name        `everyone` scope only; `/api/log/self`
 *                                                does not parse it, verified live
 * There is no free-text search across columns, so the box is bound to one field at
 * a time and says so.
 */
type SearchField = 'request_id' | 'token_name' | 'model_name' | 'username'

/** The one search field `GET /api/log/self` ignores; dropped when the scope narrows. */
const ADMIN_ONLY_SEARCH_FIELD: SearchField = 'username'

type TimeRangeId = 'all' | '24h' | '7d' | '30d'

/**
 * Window lengths in seconds for the `start_timestamp` filter. The cut-off is read
 * from the browser clock once, when the range changes, so the query key stays stable
 * between renders instead of moving with every tick.
 */
const TIME_RANGE_SECONDS: Readonly<Record<TimeRangeId, number>> = {
  all: 0,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
}

const DEFAULT_PAGE_SIZE = 20

function LogDetailPanel(props: { log: UserLog; isAdminView: boolean }) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const { isAdminView, log } = props

  const renderOtherValue = (entry: LogOtherEntry): string => {
    const { rawKey, value } = entry
    if (rawKey === 'frt' && typeof value === 'number') return formatLatencyMs(value)
    if (typeof value === 'boolean') return value ? t('Yes') : t('No')
    if (typeof value === 'number') {
      // Ratios and prices are floats — rounding them would misstate the billing inputs.
      return LOG_OTHER_COUNT_KEYS.has(rawKey) ? formatNumber(value) : String(value)
    }
    if (typeof value === 'string') return value
    return JSON.stringify(value) ?? ''
  }

  const requestItems: DescriptionListItem[] = []

  if (log.content !== '') {
    requestItems.push({ id: 'content', term: t('Message'), description: log.content })
  }

  if (isAdminView) {
    requestItems.push({
      id: 'user',
      term: t('Username'),
      description: (
        <span className="mono">
          {log.username === '' ? t('User ID {{id}}', { id: log.user_id }) : log.username}
        </span>
      ),
    })
  }

  /**
   * `channel` is the raw `logs.channel_id`, and `model.formatUserLogs` does NOT strip
   * it — a `/api/log/self` row carries the real id, verified live. Only the NAME is
   * admin-only, so the id is shown to everyone and the name joins it when the payload
   * carries one. 0 means the row was never routed to a channel (a sign-in or top-up).
   */
  if (log.channel !== 0) {
    requestItems.push({
      id: 'channel',
      term: t('Channel'),
      description: (
        <span className="mono">
          {log.channel_name === ''
            ? `#${log.channel}`
            : `${log.channel_name} · #${log.channel}`}
        </span>
      ),
    })
  }

  const requestId = logRequestId(log)
  if (requestId !== '') {
    requestItems.push({
      id: 'request_id',
      term: t('Request ID'),
      description: (
        <span className="flex items-center justify-end gap-1">
          <span className="mono truncate" title={requestId}>{requestId}</span>
          <CopyButton label={t('Copy request ID')} size="icon-xs" value={requestId} />
        </span>
      ),
    })
  }

  requestItems.push({
    id: 'created_at',
    term: t('Logged at'),
    description: <span className="mono">{formatDateTime(log.created_at, locale)}</span>,
  })

  requestItems.push({
    id: 'use_time',
    term: t('Duration'),
    description: (
      <span className="mono">
        {useTimeIsSubSecond(log.use_time)
          ? t('Under 1s')
          : t('{{seconds}}s', { seconds: log.use_time })}
      </span>
    ),
  })

  requestItems.push({
    id: 'prompt_tokens',
    term: t('Prompt tokens'),
    description: <span className="mono">{formatNumber(log.prompt_tokens)}</span>,
  })

  requestItems.push({
    id: 'completion_tokens',
    term: t('Completion tokens'),
    description: <span className="mono">{formatNumber(log.completion_tokens)}</span>,
  })

  if (log.ip !== '') {
    requestItems.push({
      id: 'ip',
      term: t('IP address'),
      description: <span className="mono">{log.ip}</span>,
    })
  }

  const toMetadataItem = (entry: LogOtherEntry): DescriptionListItem => ({
    id: entry.rawKey,
    term: entry.labelKey === undefined ? entry.displayKey : t(entry.labelKey),
    description: (
      <span className="mono truncate" title={renderOtherValue(entry)}>{renderOtherValue(entry)}</span>
    ),
  })

  const metadataItems = logOtherEntries(log).map(toMetadataItem)
  // Empty outside the everyone scope: `/api/log/self` deletes all three roots.
  const adminMetadataItems = logAdminOtherEntries(log).map(toMetadataItem)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <p className="eyebrow">{t('Request details')}</p>
        <DescriptionList className="mt-3" items={requestItems} label={t('Request details')} />
      </div>
      <div className="min-w-0">
        <p className="eyebrow">{t('Recorded metadata')}</p>
        {metadataItems.length > 0 ? (
          <DescriptionList className="mt-3" items={metadataItems} label={t('Recorded metadata')} />
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted">
            {t('The backend recorded no extra metadata for this entry.')}
          </p>
        )}
      </div>
      {adminMetadataItems.length > 0 ? (
        <div className="min-w-0 lg:col-span-2">
          <p className="eyebrow">{t('Admin-only metadata')}</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t('Only the all-users scope carries these keys — /api/log/self strips them. Shown under their raw backend paths.')}
          </p>
          <DescriptionList
            className="mt-3"
            items={adminMetadataItems}
            label={t('Admin-only metadata')}
          />
        </div>
      ) : null}
    </div>
  )
}

export function LogsPage() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const quotaPerUnit = useQuotaPerUnit()
  const { canViewEveryone, isResolving, scope, setScope, effectiveScope } = useLogScope()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [logType, setLogType] = useState<number>(LOG_TYPE.all)
  const [group, setGroup] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRangeId>('all')
  const [startTimestamp, setStartTimestamp] = useState(0)
  const [searchField, setSearchField] = useState<SearchField>('request_id')
  const [searchValue, setSearchValue] = useState('')
  /**
   * Text filters are committed on an explicit action, never on keystroke. These listings
   * scan the log table, so firing one per character is expensive at real data volumes —
   * the draft holds what is typed and only Search (or Enter) promotes it.
   */
  const [searchDraft, setSearchDraft] = useState('')
  const [channelDraft, setChannelDraft] = useState('')
  const [channelId, setChannelId] = useState('')

  const isAdminView = effectiveScope === 'everyone'
  const groupsQuery = useQuery(userGroupsQuery())

  /**
   * `controller.GetAllLogs` reads `channel` through `strconv.Atoi`, and
   * `model.GetAllLogs` skips the clause when the result is 0 — so a non-numeric or
   * zero value is not a filter at all and must not be sent as one.
   */
  const channelFilter = useMemo(() => {
    const parsed = Number.parseInt(channelId.trim(), 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }, [channelId])

  /** Promotes both text drafts into the state the query actually reads. */
  const commitSearch = () => {
    setSearchValue(searchDraft)
    setChannelId(channelDraft)
    setPage(1)
  }

  const filters = useMemo<AdminLogFilters>(() => {
    const next: AdminLogFilters = {}
    if (logType !== LOG_TYPE.all) next.type = logType
    if (group !== '') next.group = group
    if (startTimestamp > 0) next.start_timestamp = startTimestamp
    const term = searchValue.trim()
    // `username` is only parsed by the admin listing; sending it to /self would be a
    // filter the user could see in the URL and that the server silently ignores.
    if (term !== '' && (searchField !== ADMIN_ONLY_SEARCH_FIELD || isAdminView)) {
      next[searchField] = term
    }
    if (isAdminView && channelFilter !== undefined) next.channel = channelFilter
    return next
  }, [channelFilter, group, isAdminView, logType, searchField, searchValue, startTimestamp])

  const logsQuery = useQuery(scopedLogsQuery(filters, page, pageSize, effectiveScope))
  const logs = logsQuery.data?.items
  const total = logsQuery.data?.total

  const hasActiveFilters =
    logType !== LOG_TYPE.all
    || group !== ''
    || timeRange !== 'all'
    || searchValue !== ''
    || (isAdminView && channelId !== '')

  const columns = useMemo<DataTableColumns<UserLog>>(() => {
    /**
     * Three columns that only carry information in the everyone scope.
     *
     * `username` and `channel` ARE present on a `/api/log/self` row — the server does
     * not strip either — but there they are constants: the username is always the
     * signed-in account, and the channel id has no name to go with it because
     * `model.formatUserLogs` blanks `channel_name` unconditionally. The id is still
     * offered to every user in the expanded row detail; only the columns are gated.
     */
    const adminColumns: DataTableColumns<UserLog> = isAdminView
      ? [
        {
          id: 'username',
          enableSorting: false,
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Username')} />,
          cell: ({ row }) => (
            <MonoCell
              title={t('User ID {{id}}', { id: row.original.user_id })}
              value={row.original.username === '' ? null : row.original.username}
            />
          ),
          meta: { label: t('Username'), mono: true },
        },
        {
          id: 'channel',
          enableSorting: false,
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Channel')} />,
          // 0 is "never routed to a channel" — a sign-in or top-up row, not channel zero.
          cell: ({ row }) => <MonoCell value={row.original.channel === 0 ? null : row.original.channel} />,
          meta: { label: t('Channel'), mono: true },
        },
        {
          id: 'channel_name',
          enableSorting: false,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title={t('Channel name')} />
          ),
          // Joined from the channels table by `model.GetAllLogs`; a blank name beside a
          // non-zero id means that channel no longer exists.
          cell: ({ row }) =>
            row.original.channel_name === '' ? (
              <MonoCell value={null} />
            ) : (
              <TruncatedCell maxWidthClassName="max-w-[10rem]" mono value={row.original.channel_name} />
            ),
          meta: { label: t('Channel name'), mono: true },
        },
      ]
      : []

    return [
      {
        id: 'created_at',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Time')} />,
        cell: ({ row }) => (
          <MonoCell
            title={formatDateTime(row.original.created_at, locale)}
            value={formatTime(row.original.created_at, locale)}
          />
        ),
        meta: { label: t('Time'), mono: true },
      },
      {
        id: 'type',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Type')} />,
        cell: ({ row }) => {
          const labelKey = LOG_TYPE_LABEL_KEYS[row.original.type]
          return (
            <BadgeCell
              label={labelKey === undefined ? t('Type {{type}}', { type: row.original.type }) : t(labelKey)}
              tone={logTypeTone(row.original.type)}
            />
          )
        },
        meta: { label: t('Type') },
      },
      {
        id: 'request_id',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Request ID')} />,
        cell: ({ row }) => {
          const requestId = logRequestId(row.original)
          return requestId === '' ? (
            <MonoCell value={null} />
          ) : (
            <TruncatedCell maxWidthClassName="max-w-[10rem]" mono value={requestId} />
          )
        },
        // The card title on narrow viewports: a request id is present on every relay
        // and account row, while model_name is empty for sign-in and top-up entries.
        meta: { label: t('Request ID'), mobilePrimary: true, mono: true },
      },
      {
        id: 'model_name',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Model')} />,
        cell: ({ row }) => <MonoCell value={row.original.model_name} />,
        meta: { label: t('Model'), mono: true },
      },
      {
        id: 'token_name',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('API key')} />,
        cell: ({ row }) => <MonoCell value={row.original.token_name} />,
        meta: { label: t('API key'), mono: true },
      },
      ...adminColumns,
      {
        id: 'tokens',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader align="right" column={column} title={t('Tokens (in / out)')} />
        ),
        cell: ({ row }) => (
          <MonoCell
            align="right"
            title={`${formatNumber(row.original.prompt_tokens)} / ${formatNumber(row.original.completion_tokens)}`}
            value={`${formatTokens(row.original.prompt_tokens)} / ${formatTokens(row.original.completion_tokens)}`}
          />
        ),
        meta: { align: 'right', label: t('Tokens (in / out)'), mono: true },
      },
      {
        id: 'quota',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader align="right" column={column} title={t('Cost')} />
        ),
        cell: ({ row }) => (
          <MonoCell align="right" value={formatQuota(row.original.quota, quotaPerUnit)} />
        ),
        meta: { align: 'right', label: t('Cost'), mono: true },
      },
      {
        id: 'group',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Group')} />,
        cell: ({ row }) => <MonoCell value={row.original.group} />,
        meta: { label: t('Group'), mono: true },
      },
      {
        id: 'is_stream',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Stream')} />,
        cell: ({ row }) => (
          <BadgeCell
            label={row.original.is_stream ? t('Yes') : t('No')}
            tone={row.original.is_stream ? 'info' : 'muted'}
          />
        ),
        meta: { label: t('Stream') },
      },
      {
        id: 'expander',
        enableSorting: false,
        header: () => <span className="sr-only">{t('Details')}</span>,
        cell: ({ row }) => (
          <Button
            aria-expanded={row.getIsExpanded()}
            aria-label={t('Toggle request details')}
            onClick={() => row.toggleExpanded()}
            size="icon-md"
            title={t('Toggle request details')}
            variant="quiet"
          >
            {row.getIsExpanded() ? (
              <ChevronUpIcon aria-hidden="true" />
            ) : (
              <ChevronDownIcon aria-hidden="true" />
            )}
          </Button>
        ),
        meta: { align: 'right', label: t('Details') },
      },
    ]
  }, [isAdminView, locale, quotaPerUnit, t])

  const { table, paginationControls } = useDataTable<UserLog>({
    columns,
    data: logs,
    enableExpanding: true,
    getRowId: logRowId,
    onPageChange: (query) => {
      setPage(query.p)
      setPageSize(query.page_size)
    },
    page,
    pageSize,
    total,
  })

  const typeOptions: NativeSelectOption[] = [
    { value: String(LOG_TYPE.all), label: t('All types') },
    ...LOG_TYPE_FILTER_VALUES.map((value) => {
      const labelKey = LOG_TYPE_LABEL_KEYS[value]
      return {
        value: String(value),
        label: labelKey === undefined ? t('Type {{type}}', { type: value }) : t(labelKey),
      }
    }),
  ]

  const groupOptions: NativeSelectOption[] = [
    { value: '', label: t('All groups') },
    ...Object.keys(groupsQuery.data ?? {}).map((name) => ({ value: name, label: name })),
  ]

  const timeRangeOptions: NativeSelectOption[] = [
    { value: 'all', label: t('All time') },
    { value: '24h', label: t('Last 24 hours') },
    { value: '7d', label: t('Last 7 days') },
    { value: '30d', label: t('Last 30 days') },
  ]

  const searchFieldOptions: NativeSelectOption[] = [
    { value: 'request_id', label: t('Request ID') },
    { value: 'token_name', label: t('API key') },
    { value: 'model_name', label: t('Model') },
    // Only `GetAllLogs` reads `username`; offering it in the mine scope would be a
    // control the server answers by ignoring.
    ...(isAdminView ? [{ value: ADMIN_ONLY_SEARCH_FIELD, label: t('Username') }] : []),
  ]

  const searchLabels: Record<SearchField, string> = {
    request_id: t('Request ID'),
    token_name: t('API key'),
    model_name: t('Model'),
    username: t('Username'),
  }

  const searchPlaceholders: Record<SearchField, string> = {
    request_id: t('Exact request ID'),
    token_name: t('Exact API key name'),
    model_name: t('Exact model name'),
    username: t('Exact username'),
  }

  const searchDescriptions: Record<SearchField, string> = {
    request_id: t('Exact match only.'),
    token_name: t('Exact match only.'),
    model_name: t('Exact match. Add % as a wildcard, for example gpt%.'),
    username: t('Exact match. Add % as a wildcard, for example ro%.'),
  }

  const handleTimeRangeChange = (next: TimeRangeId) => {
    setTimeRange(next)
    const windowSeconds = TIME_RANGE_SECONDS[next]
    setStartTimestamp(windowSeconds === 0 ? 0 : toUnixSeconds(new Date()) - windowSeconds)
    setPage(1)
  }

  /**
   * Leaving the everyone scope has to drop the two admin-only filters as well as the
   * rows: `GET /api/log/self` parses neither, so keeping them would leave a filled-in
   * control that changes nothing.
   */
  const handleScopeChange = (next: LogScope) => {
    setScope(next)
    setPage(1)
    if (next === 'everyone') return
    setChannelId('')
    setChannelDraft('')
    if (searchField === ADMIN_ONLY_SEARCH_FIELD) {
      setSearchField('request_id')
      setSearchValue('')
      setSearchDraft('')
    }
  }

  const emptyTitle = hasActiveFilters ? t('No matching request logs') : t('No request logs yet')

  let emptyDescription = t('Requests you send through the API appear here.')
  if (hasActiveFilters) {
    emptyDescription = t('No request logs match these filters.')
  } else if (isAdminView) {
    emptyDescription = t('Nothing has been logged on this deployment yet. Requests from every account appear here.')
  }

  const handleReset = () => {
    setLogType(LOG_TYPE.all)
    setGroup('')
    setSearchField('request_id')
    setSearchValue('')
    setSearchDraft('')
    setChannelId('')
    setChannelDraft('')
    handleTimeRangeChange('all')
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description={
          isAdminView
            ? t('Every request, error, and account event new-api recorded, across every account on this deployment.')
            : t('Every request, error, and account event new-api recorded for your account.')
        }
        title={t('API logs')}
      />

      <LogStatsStrip filters={filters} scope={effectiveScope} />

      <Panel className="overflow-hidden">
        <DataTableToolbar
          actions={
            canViewEveryone ? (
              <LogScopeControl
                disabled={isResolving}
                label={t('Log scope')}
                onChange={handleScopeChange}
                scope={scope}
              />
            ) : undefined
          }
          filters={
            <>
              <NativeSelect
                className="w-40"
                hideLabel
                label={t('Log type')}
                onChange={(event) => {
                  setLogType(Number(event.target.value))
                  setPage(1)
                }}
                options={typeOptions}
                size="sm"
                value={String(logType)}
              />
              <NativeSelect
                className="w-40"
                disabled={groupsQuery.isLoading}
                hideLabel
                label={t('Group')}
                onChange={(event) => {
                  setGroup(event.target.value)
                  setPage(1)
                }}
                options={groupOptions}
                size="sm"
                value={group}
              />
              <NativeSelect
                className="w-40"
                hideLabel
                label={t('Time range')}
                onChange={(event) => handleTimeRangeChange(event.target.value as TimeRangeId)}
                options={timeRangeOptions}
                size="sm"
                value={timeRange}
              />
              {isAdminView ? (
                <SearchInput
                  className="w-40"
                  hideLabel
                  label={t('Channel ID')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitSearch()
                    }
                  }}
                  onValueChange={setChannelDraft}
                  placeholder={t('Channel ID')}
                  size="sm"
                  value={channelDraft}
                />
              ) : null}
            </>
          }
          filtersLabel={t('Request log filters')}
          isResetDisabled={!hasActiveFilters}
          label={t('Request log filters')}
          search={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <NativeSelect
                className="sm:w-36 sm:shrink-0"
                hideLabel
                label={t('Search field')}
                onChange={(event) => {
                  setSearchField(event.target.value as SearchField)
                  setSearchDraft('')
                  setSearchValue('')
                  setPage(1)
                }}
                options={searchFieldOptions}
                size="sm"
                value={searchField}
              />
              <SearchInput
                className="min-w-0 sm:flex-1"
                description={searchDescriptions[searchField]}
                hideLabel
                label={searchLabels[searchField]}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitSearch()
                  }
                }}
                onValueChange={setSearchDraft}
                placeholder={searchPlaceholders[searchField]}
                size="sm"
                value={searchDraft}
              />
              <Button onClick={commitSearch} size="sm" variant="outline">
                {t('Search')}
              </Button>
            </div>
          }
          onReset={handleReset}
        />

        {logsQuery.isError ? (
          <div className="p-5">
            <Alert
              action={
                <Button
                  aria-busy={logsQuery.isFetching}
                  disabled={logsQuery.isFetching}
                  onClick={() => void logsQuery.refetch()}
                  variant="outline"
                >
                  {t('Try again')}
                </Button>
              }
              icon={<TriangleAlertIcon aria-hidden="true" />}
              title={t('Could not load request logs')}
              tone="destructive"
            >
              {toErrorMessage(logsQuery.error)}
            </Alert>
          </div>
        ) : (
          <>
            <DataTable
              className="hidden md:block"
              emptyDescription={emptyDescription}
              emptyIcon={<ScrollTextIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={emptyTitle}
              isFetching={logsQuery.isFetching}
              isLoading={logsQuery.isLoading}
              label={t('Request logs')}
              loadingLabel={t('Loading request logs')}
              minWidthClassName={isAdminView ? 'min-w-[86rem]' : 'min-w-[68rem]'}
              renderExpandedRow={(row) => (
                <LogDetailPanel isAdminView={isAdminView} log={row.original} />
              )}
              table={table}
            />

            <div className="p-4 md:hidden">
              <MobileCardList
                emptyDescription={emptyDescription}
                emptyIcon={<ScrollTextIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
                emptyTitle={emptyTitle}
                isFetching={logsQuery.isFetching}
                isLoading={logsQuery.isLoading}
                label={t('Request log cards')}
                loadingLabel={t('Loading request logs')}
                renderExpandedRow={(row) => (
                  <LogDetailPanel isAdminView={isAdminView} log={row.original} />
                )}
                table={table}
              />
            </div>

            <DataTablePagination
              {...paginationControls}
              isFetching={logsQuery.isFetching}
              label={t('Request log pages')}
            />
          </>
        )}
      </Panel>
    </div>
  )
}
