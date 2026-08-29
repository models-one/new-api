import { cn } from '@/lib/utils'

type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg'

type SpinnerBaseProps = {
  size?: SpinnerSize
  className?: string
}

type SpinnerProps = SpinnerBaseProps &
  (
    | {
        /** Announced by the `role="status"` wrapper. */
        label: string
        decorative?: false
      }
    | {
        /** Use inside a control that already announces its busy state. */
        decorative: true
        label?: never
      }
  )

const sizeClasses: Record<SpinnerSize, string> = {
  xs: 'size-3 border',
  sm: 'size-4 border-2',
  md: 'size-5 border-2',
  lg: 'size-7 border-2',
}

export function Spinner(props: SpinnerProps) {
  const { size = 'md', className, decorative = false, label } = props

  const circle = (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent',
        sizeClasses[size],
        className,
      )}
    />
  )

  if (decorative) return circle

  return (
    <span className="inline-flex items-center" role="status">
      {circle}
      <span className="sr-only">{label}</span>
    </span>
  )
}
