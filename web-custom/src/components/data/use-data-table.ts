import {
  functionalUpdate,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ExpandedState,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table,
  type TableOptions,
  type Updater,
  type VisibilityState,
} from '@tanstack/react-table'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { PageInfo, PageQuery } from '@/lib/api/types'

/**
 * The column array type, borrowed from the library so the project never has to
 * write `ColumnDef<TData, any>` itself. Heterogeneous accessor columns fit it.
 */
export type DataTableColumns<TData> = TableOptions<TData>['columns']

/** Re-exported so a page only imports from `components/data`. */
export type { PageInfo, PageQuery }

export type DataTableSortQuery = {
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

/** Everything DataTablePagination needs; `useDataTable` returns it pre-wired. */
export type DataTablePaginationControls = {
  /** 1-based, matching the API `p` parameter. */
  page: number
  pageSize: number
  total: number
  pageCount: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export type UseDataTableOptions<TData> = {
  columns: DataTableColumns<TData>
  /** Rows of the current page, straight from `PageInfo.items`. */
  data: TData[] | undefined
  /** `PageInfo.total`. Omit only when the endpoint does not report a total. */
  total?: number
  /** Controlled 1-based page. Pass together with `pageSize` and `onPageChange`. */
  page?: number
  /** Controlled page size. Pass together with `page` and `onPageChange`. */
  pageSize?: number
  defaultPage?: number
  defaultPageSize?: number
  /** Receives the next `{ p, page_size }` — feed it straight back into the query key. */
  onPageChange?: (query: PageQuery) => void
  sorting?: SortingState
  defaultSorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
  columnVisibility?: VisibilityState
  defaultColumnVisibility?: VisibilityState
  onColumnVisibilityChange?: (columnVisibility: VisibilityState) => void
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (rowSelection: RowSelectionState) => void
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean)
  /** Enables `row.toggleExpanded()` so DataTable can render `renderExpandedRow`. */
  enableExpanding?: boolean
  /** Controlled expansion, keyed by row id. Leave out to let the hook own it. */
  expanded?: ExpandedState
  defaultExpanded?: ExpandedState
  onExpandedChange?: (expanded: ExpandedState) => void
  /** Stable row identity; without it TanStack falls back to the row index. */
  getRowId?: (row: TData, index: number) => string
  /** Default true: the server sorts. Set false to sort the current page in the browser. */
  manualSorting?: boolean
  /** Default false: one sorted column at a time, which is what the API accepts. */
  enableMultiSort?: boolean
}

export type UseDataTableResult<TData> = {
  table: Table<TData>
  /** Send this to the API verbatim: `{ p, page_size }`. */
  query: PageQuery
  /** Derived from the sorting state; empty when nothing is sorted. */
  sortQuery: DataTableSortQuery
  page: number
  pageSize: number
  total: number
  pageCount: number
  sorting: SortingState
  expanded: ExpandedState
  columnVisibility: VisibilityState
  rowSelection: RowSelectionState
  selectedRows: TData[]
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  setSorting: (sorting: SortingState) => void
  clearRowSelection: () => void
  collapseAllRows: () => void
  /** Back to page 1 with sorting and selection cleared — the toolbar reset. */
  reset: () => void
  paginationControls: DataTablePaginationControls
}

const emptySorting: SortingState = []
const emptyExpanded: ExpandedState = {}
const emptyVisibility: VisibilityState = {}
const emptySelection: RowSelectionState = {}

/**
 * State that the caller may own (pass value + onChange) or leave to the hook.
 * Both paths notify `onChange`, so a page can mirror the value into the URL
 * without becoming the source of truth.
 */
function useOptionallyControlledState<T>(
  controlledValue: T | undefined,
  onChange: ((next: T) => void) | undefined,
  initialValue: T,
): [T, OnChangeFn<T>] {
  const [internalValue, setInternalValue] = useState(initialValue)
  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : internalValue

  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const setValue = useCallback(
    (updater: Updater<T>) => {
      const next = functionalUpdate(updater, valueRef.current)
      if (!isControlled) setInternalValue(next)
      onChangeRef.current?.(next)
    },
    [isControlled],
  )

  return [value, setValue]
}

/**
 * Wraps `useReactTable` with this console's conventions: server pagination on a
 * 1-based `p` plus `page_size`, server sorting, column visibility and row
 * selection. The API response maps on with no glue beyond
 * `data: page?.items, total: page?.total`.
 */
export function useDataTable<TData>(options: UseDataTableOptions<TData>): UseDataTableResult<TData> {
  const {
    columns,
    data,
    total,
    page,
    pageSize,
    defaultPage = 1,
    defaultPageSize = 20,
    onPageChange,
    sorting: controlledSorting,
    defaultSorting = emptySorting,
    onSortingChange,
    columnVisibility: controlledVisibility,
    defaultColumnVisibility = emptyVisibility,
    onColumnVisibilityChange,
    rowSelection: controlledSelection,
    onRowSelectionChange,
    enableRowSelection = false,
    enableExpanding = false,
    expanded: controlledExpanded,
    defaultExpanded = emptyExpanded,
    onExpandedChange,
    getRowId,
    manualSorting = true,
    enableMultiSort = false,
  } = options

  const controlledQuery = page !== undefined && pageSize !== undefined
    ? { p: page, page_size: pageSize }
    : undefined
  const [query, setQuery] = useOptionallyControlledState<PageQuery>(controlledQuery, onPageChange, {
    p: defaultPage,
    page_size: defaultPageSize,
  })
  const [sorting, setSortingState] = useOptionallyControlledState(controlledSorting, onSortingChange, defaultSorting)
  const [columnVisibility, setColumnVisibility] = useOptionallyControlledState(
    controlledVisibility,
    onColumnVisibilityChange,
    defaultColumnVisibility,
  )
  const [rowSelection, setRowSelection] = useOptionallyControlledState(
    controlledSelection,
    onRowSelectionChange,
    emptySelection,
  )
  const [expanded, setExpanded] = useOptionallyControlledState(
    controlledExpanded,
    onExpandedChange,
    defaultExpanded,
  )

  const rows = useMemo(() => data ?? [], [data])
  const rowCount = total ?? rows.length
  const pageCount = Math.max(1, Math.ceil(rowCount / Math.max(1, query.page_size)))

  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: query.p - 1, pageSize: query.page_size }),
    [query.p, query.page_size],
  )
  const paginationRef = useRef(pagination)
  paginationRef.current = pagination

  const handlePaginationChange = useCallback<OnChangeFn<PaginationState>>(
    (updater) => {
      const next = functionalUpdate(updater, paginationRef.current)
      setQuery({ p: next.pageIndex + 1, page_size: next.pageSize })
    },
    [setQuery],
  )

  /** Server-sorted tables must return to page 1 whenever the order changes. */
  const handleSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      setSortingState(updater)
      if (manualSorting) setQuery((current) => ({ ...current, p: 1 }))
    },
    [manualSorting, setQuery, setSortingState],
  )

  const table = useReactTable<TData>({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    ...(manualSorting ? {} : { getSortedRowModel: getSortedRowModel() }),
    manualPagination: true,
    manualSorting,
    manualFiltering: true,
    pageCount,
    rowCount,
    enableSortingRemoval: true,
    enableMultiSort,
    sortDescFirst: false,
    enableRowSelection,
    enableExpanding,
    ...(enableExpanding ? { getRowCanExpand: () => true } : {}),
    ...(getRowId ? { getRowId } : {}),
    state: { pagination, sorting, columnVisibility, rowSelection, expanded },
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
  })

  const setPage = useCallback(
    (nextPage: number) => {
      setQuery((current) => ({ ...current, p: Math.max(1, nextPage) }))
    },
    [setQuery],
  )

  const setPageSize = useCallback(
    (nextPageSize: number) => {
      setQuery({ p: 1, page_size: Math.max(1, nextPageSize) })
    },
    [setQuery],
  )

  const setSorting = useCallback(
    (nextSorting: SortingState) => {
      handleSortingChange(nextSorting)
    },
    [handleSortingChange],
  )

  const clearRowSelection = useCallback(() => setRowSelection(emptySelection), [setRowSelection])

  const collapseAllRows = useCallback(() => setExpanded(emptyExpanded), [setExpanded])

  const reset = useCallback(() => {
    setQuery((current) => ({ ...current, p: 1 }))
    setSortingState(emptySorting)
    setRowSelection(emptySelection)
    setExpanded(emptyExpanded)
  }, [setExpanded, setQuery, setRowSelection, setSortingState])

  /** Cheap enough to recompute: a page holds at most `page_size` rows. */
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)

  const sortQuery = useMemo<DataTableSortQuery>(() => {
    const [first] = sorting
    if (!first) return {}
    return { sort_by: first.id, sort_order: first.desc ? 'desc' : 'asc' }
  }, [sorting])

  return {
    table,
    query,
    sortQuery,
    page: query.p,
    pageSize: query.page_size,
    total: rowCount,
    pageCount,
    sorting,
    expanded,
    columnVisibility,
    rowSelection,
    selectedRows,
    setPage,
    setPageSize,
    setSorting,
    clearRowSelection,
    collapseAllRows,
    reset,
    paginationControls: {
      page: query.p,
      pageSize: query.page_size,
      total: rowCount,
      pageCount,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    },
  }
}
