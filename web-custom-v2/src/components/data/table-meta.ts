import type { RowData } from '@tanstack/react-table'

export type DataTableAlign = 'left' | 'center' | 'right'

/** Column alignment vocabulary shared by the header, the body cells and the mobile cards. */
export const alignClasses: Record<DataTableAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

/**
 * Chrome for a column pinned to the right edge of a horizontally scrolling table. The
 * short gradient on its left edge is what stops a column sliding under it from appearing
 * to collide with it; `from-*` is set by the caller so the header and body cells each
 * fade out of their own background.
 */
export const stickyRightClasses =
  'sticky right-0 z-10 before:pointer-events-none before:absolute before:inset-y-0 before:-left-6 before:w-6 before:bg-gradient-to-l before:to-transparent'

/**
 * Per-column presentation declared once on the column definition, so the table
 * chrome, the mobile card list and the cell primitives stay in agreement.
 */
export type DataTableColumnMeta<TData = unknown, TValue = unknown> = {
  /** Short label for MobileCardList; falls back to a string `header`, then the column id. */
  label?: string
  align?: DataTableAlign
  /** Applies `.mono` to the body cell — required for numeric columns so they do not jitter. */
  mono?: boolean
  headerClassName?: string
  cellClassName?: string
  /** Skip this column in MobileCardList. */
  hideOnMobile?: boolean
  /** Render this column as the card title in MobileCardList. */
  mobilePrimary?: boolean
  /** Optional plain-text projection used for card titles and export-style output. */
  toText?: (value: TValue, row: TData) => string
  /**
   * Pins the column to the right edge of the horizontal scroll area. Set it on the row
   * actions column: without it a table that needs more width than the viewport hides its
   * own controls off-screen, and macOS draws no scrollbar to say so.
   */
  sticky?: 'right'
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> extends DataTableColumnMeta<TData, TValue> {}
}
