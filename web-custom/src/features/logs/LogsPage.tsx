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
import {
  LOG_OTHER_COUNT_KEYS,
  LOG_TYPE_FILTER_VALUES,
  LOG_TYPE_LABEL_KEYS,
  logOtherEntries,
  logRequestId,
  logRowId,
  logTypeTone,
  useTimeIsSubSecond,
  type LogOtherEntry,
} from '@/features/logs/log-presentation'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { LOG_TYPE, userLogsQuery, type LogFilters, type UserLog } from '@/lib/api/logs'
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
 * The only three text filters `GET /api/log/self` accepts, and how it matches them
 * (see `model.GetUserLogs` / `applyExplicitLogTextFilter`):
 *   request_id  — `=`, exact
 *   token_name  — `=`, exact
 *   model_name  — `=` unless the value contains a literal `%`, then `LIKE`
 * There is no free-text search across columns, so the box is bound to one field at
 * a time and says so.
 */
type SearchField = 'request_id' | 'token_name' | 'model_name'

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

function LogDetailPanel(props: { log: UserLog }) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const { log } = props

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

  const otherEntries = logOtherEntries(log)
  const metadataItems: DescriptionListItem[] = otherEntries.map((entry) => ({
    id: entry.rawKey,
    term: entry.labelKey === undefined ? entry.displayKey : t(entry.labelKey),
    description: (
      <span className="mono truncate" title={renderOtherValue(entry)}>{renderOtherValue(entry)}</span>
    ),
  }))

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
    </div>
  )
}

export function LogsPage() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const quotaPerUnit = useQuotaPerUnit()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [logType, setLogType] = useState<number>(LOG_TYPE.all)
  const [group, setGroup] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRangeId>('all')
  const [startTimestamp, setStartTimestamp] = useState(0)
  const [searchField, setSearchField] = useState<SearchField>('request_id')
  const [searchValue, setSearchValue] = useState('')

  const groupsQuery = useQuery(userGroupsQuery())

  const filters = useMemo<LogFilters>(() => {
    const next: LogFilters = {}
    if (logType !== LOG_TYPE.all) next.type = logType
    if (group !== '') next.group = group
    if (startTimestamp > 0) next.start_timestamp = startTimestamp
    const term = searchValue.trim()
    if (term !== '') next[searchField] = term
    return next
  }, [group, logType, searchField, searchValue, startTimestamp])

  const logsQuery = useQuery(userLogsQuery(filters, page, pageSize))
  const logs = logsQuery.data?.items
  const total = logsQuery.data?.total

  const hasActiveFilters =
    logType !== LOG_TYPE.all || group !== '' || timeRange !== 'all' || searchValue !== ''

  const columns = useMemo<DataTableColumns<UserLog>>(
    () => [
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
    ],
    [locale, quotaPerUnit, t],
  )

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
  ]

  const searchLabels: Record<SearchField, string> = {
    request_id: t('Request ID'),
    token_name: t('API key'),
    model_name: t('Model'),
  }

  const searchPlaceholders: Record<SearchField, string> = {
    request_id: t('Exact request ID'),
    token_name: t('Exact API key name'),
    model_name: t('Exact model name'),
  }

  const searchDescriptions: Record<SearchField, string> = {
    request_id: t('Exact match only.'),
    token_name: t('Exact match only.'),
    model_name: t('Exact match. Add % as a wildcard, for example gpt%.'),
  }

  const handleTimeRangeChange = (next: TimeRangeId) => {
    setTimeRange(next)
    const windowSeconds = TIME_RANGE_SECONDS[next]
    setStartTimestamp(windowSeconds === 0 ? 0 : toUnixSeconds(new Date()) - windowSeconds)
    setPage(1)
  }

  const handleReset = () => {
    setLogType(LOG_TYPE.all)
    setGroup('')
    setSearchField('request_id')
    setSearchValue('')
    handleTimeRangeChange('all')
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description={t('Every request, error, and account event new-api recorded for your account.')}
        title={t('API logs')}
      />

      <Panel className="overflow-hidden">
        <DataTableToolbar
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
                  setSearchValue('')
                  setPage(1)
                }}
                options={searchFieldOptions}
                size="sm"
                value={searchField}
              />
              <SearchInput
                className="min-w-0 sm:flex-1"
                debounceMs={300}
                description={searchDescriptions[searchField]}
                hideLabel
                label={searchLabels[searchField]}
                onValueChange={(next) => {
                  setSearchValue(next)
                  setPage(1)
                }}
                placeholder={searchPlaceholders[searchField]}
                size="sm"
                value={searchValue}
              />
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
              emptyDescription={
                hasActiveFilters
                  ? t('No request logs match these filters.')
                  : t('Requests you send through the API appear here.')
              }
              emptyIcon={<ScrollTextIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={hasActiveFilters ? t('No matching request logs') : t('No request logs yet')}
              isFetching={logsQuery.isFetching}
              isLoading={logsQuery.isLoading}
              label={t('Request logs')}
              loadingLabel={t('Loading request logs')}
              minWidthClassName="min-w-[68rem]"
              renderExpandedRow={(row) => <LogDetailPanel log={row.original} />}
              table={table}
            />

            <div className="p-4 md:hidden">
              <MobileCardList
                emptyDescription={
                  hasActiveFilters
                    ? t('No request logs match these filters.')
                    : t('Requests you send through the API appear here.')
                }
                emptyIcon={<ScrollTextIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
                emptyTitle={hasActiveFilters ? t('No matching request logs') : t('No request logs yet')}
                isFetching={logsQuery.isFetching}
                isLoading={logsQuery.isLoading}
                label={t('Request log cards')}
                loadingLabel={t('Loading request logs')}
                renderExpandedRow={(row) => <LogDetailPanel log={row.original} />}
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
