import { cn } from '@/lib/utils'

type TruncatedCellProps = {
  value: string
  /** Defaults to `value`, so the full text is always reachable on hover. */
  title?: string
  mono?: boolean
  /** Defaults to `max-w-[220px]`. */
  maxWidthClassName?: string
  className?: string
}

export function TruncatedCell(props: TruncatedCellProps) {
  return (
    <span
      className={cn(
        'block truncate',
        props.mono ? 'mono' : '',
        props.maxWidthClassName ?? 'max-w-[220px]',
        props.className,
      )}
      title={props.title ?? props.value}
    >
      {props.value}
    </span>
  )
}
