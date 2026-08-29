import CircleIcon from 'lucide-react/dist/esm/icons/circle'
import { useTranslation } from 'react-i18next'

import type { GroupRoute } from '@/features/settings/types'
import { cn } from '@/lib/utils'

type GroupRouteBadgeProps = {
  route: GroupRoute
  /**
   * `/api/user/self/groups` answered. While it has not (still loading, or it failed) a
   * missing ratio means "not known yet", NOT "not one of your groups" — so the badge must
   * stay silent about availability instead of guessing.
   */
  groupsKnown: boolean
  className?: string
  compact?: boolean
}

/**
 * A group carries no vendor or provider in the schema, so the only honest colour split is
 * "this group is one of yours" (from /api/user/self/groups) versus "this key names a group
 * you cannot use", which the ratio being unknown already tells us.
 */
export function GroupRouteBadge(props: GroupRouteBadgeProps) {
  const { t } = useTranslation()
  const usable = props.groupsKnown && props.route.ratio !== null
  const unusable = props.groupsKnown && props.route.ratio === null

  let title = props.route.name
  if (usable) title = `${props.route.name} x${props.route.ratio}`
  if (unusable) {
    title = t('{{group}} is not one of your available groups', { group: props.route.name })
  }

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
        props.compact ? 'gap-1.5 px-2 py-1 text-[11px] [&_svg]:size-1.5' : '',
        unusable
          ? 'border-warning/30 bg-warning/8 text-warning'
          : 'border-primary/30 bg-primary/8 text-primary',
        props.className,
      )}
      title={title}
    >
      <CircleIcon aria-hidden="true" className="size-2 fill-current stroke-none" />
      <span className="truncate text-foreground">{props.route.name}</span>
      {usable ? <span className="mono shrink-0 opacity-90">x{props.route.ratio}</span> : null}
      {unusable ? <span className="shrink-0 opacity-90">{t('Unavailable')}</span> : null}
    </span>
  )
}
