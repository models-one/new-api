import type { RowData } from '@tanstack/react-table'

export type DataTableAlign = 'left' | 'center' | 'right'

/** Column alignment vocabulary shared by the header, the body cells and the mobile cards. */
export const alignClasses: Record<DataTableAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

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
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> extends DataTableColumnMeta<TData, TValue> {}
}
