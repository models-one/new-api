import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import RouteOffIcon from 'lucide-react/dist/esm/icons/route-off'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import type { GroupRoute } from '@/features/settings/types'

type GroupRouteGridProps = {
  /** Group names in the stored priority order. */
  routes: GroupRoute[]
  /** `/api/user/self/groups` still in flight — descriptions and ratios are not known yet. */
  groupsPending: boolean
  /**
   * `/api/user/self/groups` answered. When it has not (loading, or the request failed) a
   * cell shows the group name alone rather than claiming the group is unavailable.
   */
  groupsKnown: boolean
  crossGroupRetry: boolean
  onEdit: () => void
}

/**
 * The routing order of one key. Each cell is a group the relay tries, in order, before
 * falling through to the next one. Groups are billing labels — the backend stores a name,
 * a description and a ratio for each and nothing else, so that is all a cell can show.
 */
export function GroupRouteGrid(props: GroupRouteGridProps) {
  const { t } = useTranslation()
  const multiGroup = props.routes.length > 1

  return (
    <div className="border-t border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <h3 className="text-sm font-bold text-foreground">{t('Group priority')}</h3>
        {multiGroup ? (
          <Badge tone={props.crossGroupRetry ? 'info' : 'muted'}>
            {props.crossGroupRetry ? t('Cross-group retry on') : t('Cross-group retry off')}
          </Badge>
        ) : null}
        <Button
          aria-label={t('Edit group routes')}
          className="ml-auto"
          onClick={props.onEdit}
          size="icon-xs"
          title={t('Edit group routes')}
          variant="quiet"
        >
          <PencilIcon aria-hidden="true" />
        </Button>
      </div>

      {props.routes.length === 0 ? (
        <p className="flex items-center gap-2 border-t border-border px-3 py-4 text-sm text-muted">
          <RouteOffIcon aria-hidden="true" className="size-4" />
          {t('No group set: this key routes through your account default group.')}
        </p>
      ) : (
        <div className="grid grid-cols-1 border-t border-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {props.routes.map((route, index) => (
            <section
              className="min-w-0 border-b border-border bg-surface px-3 py-2.5 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0 xl:[&:nth-child(3n)]:border-r xl:[&:nth-child(4n)]:border-r-0"
              key={route.name}
            >
              <div className="flex min-h-7 items-center gap-2">
                <span className="mono grid size-6 shrink-0 place-items-center rounded-[4px] border border-border bg-surface-high text-[11px] text-muted">
                  {index + 1}
                </span>
                <h4 className="truncate text-sm font-semibold text-foreground">{route.name}</h4>
                {props.groupsPending ? <Skeleton className="ml-auto h-4 w-10" variant="block" /> : null}
                {!props.groupsPending && props.groupsKnown ? (
                  <span className="mono ml-auto shrink-0 text-xs text-primary">
                    {route.ratio === null ? t('Unavailable') : `x${route.ratio}`}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 min-h-6 truncate text-xs text-muted" title={route.desc}>
                {props.groupsPending ? <Skeleton className="h-3 w-24" variant="block" /> : route.desc}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
