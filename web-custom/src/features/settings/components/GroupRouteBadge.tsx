import CircleIcon from 'lucide-react/dist/esm/icons/circle'

import { cn } from '@/lib/utils'
import type { ModelGroup } from '@/features/settings/types'

const toneClasses: Record<ModelGroup['tone'], string> = {
  primary: 'border-primary/30 bg-primary/8 text-primary',
  secondary: 'border-secondary/30 bg-secondary/8 text-secondary',
  info: 'border-info/30 bg-info/8 text-info',
  success: 'border-success/30 bg-success/8 text-success',
  warning: 'border-warning/30 bg-warning/8 text-warning',
  muted: 'border-border bg-surface-high text-muted',
}

type GroupRouteBadgeProps = {
  group: ModelGroup
  className?: string
  compact?: boolean
}

export function GroupRouteBadge(props: GroupRouteBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
        props.compact ? 'gap-1.5 px-2 py-1 text-[11px] [&_svg]:size-1.5' : '',
        toneClasses[props.group.tone],
        props.className,
      )}
      title={`${props.group.name} x${props.group.ratio}`}
    >
      <CircleIcon aria-hidden="true" className="size-2 fill-current stroke-none" />
      <span className="truncate text-foreground">{props.group.name}</span>
      <span className="mono shrink-0 opacity-90">x{props.group.ratio}</span>
    </span>
  )
}
