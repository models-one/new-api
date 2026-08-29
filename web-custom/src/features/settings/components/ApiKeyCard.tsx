import { useMutation, useQueryClient } from '@tanstack/react-query'
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PowerIcon from 'lucide-react/dist/esm/icons/power'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Collapsible } from '@/components/disclosure'
import { ConfirmDialog, toast } from '@/components/overlay'
import { Button, MaskedValue, StatusBadge, statusToTone } from '@/components/ui'
import { GroupRouteBadge } from '@/features/settings/components/GroupRouteBadge'
import { GroupRouteGrid } from '@/features/settings/components/GroupRouteGrid'
import { NEVER_EXPIRES, isEnabled, toGroupRoutes, tokenGroupNames } from '@/features/settings/routing'
import { TOKEN_STATUS, deleteToken, revealTokenKey, updateTokenStatus, type ApiToken } from '@/lib/api/tokens'
import type { UserGroupMap } from '@/lib/api/user'
import { formatDate, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

type ApiKeyCardProps = {
  token: ApiToken
  /** `/api/user/self/groups`; undefined while it is still loading or has failed. */
  groups: UserGroupMap | undefined
  groupsPending: boolean
  /** The group map actually arrived, so a missing ratio really means "not one of yours". */
  groupsKnown: boolean
  /** `quota_per_unit` from `/api/status` — never hardcode the divisor. */
  quotaPerUnit: number
  expanded: boolean
  onToggleExpanded: () => void
  onEdit: () => void
}

/** `model.Token.Status`; the list endpoint returns all four, not just enabled/disabled. */
const statusLabelKeys: Record<number, string> = {
  [TOKEN_STATUS.enabled]: 'Enabled',
  [TOKEN_STATUS.disabled]: 'Disabled',
  [TOKEN_STATUS.expired]: 'Expired',
  [TOKEN_STATUS.exhausted]: 'Exhausted',
}

/** How many route badges fit in the header row before the rest collapse into a "+N". */
const HEADER_BADGE_LIMIT = 4

export function ApiKeyCard(props: ApiKeyCardProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [fullKey, setFullKey] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const token = props.token
  const groupNames = tokenGroupNames(token)
  const routes = toGroupRoutes(groupNames, props.groups)
  const shownRoutes = routes.slice(0, HEADER_BADGE_LIMIT)
  const hiddenRouteCount = routes.length - shownRoutes.length
  const enabled = isEnabled(token)
  const statusLabelKey = statusLabelKeys[token.status]

  const reveal = useMutation({
    mutationFn: () => revealTokenKey(token.id),
    onSuccess: (key) => setFullKey(key),
  })

  const toggleStatus = useMutation({
    mutationFn: () => updateTokenStatus(
      token.id,
      enabled ? TOKEN_STATUS.disabled : TOKEN_STATUS.enabled,
    ),
    onSuccess: async () => {
      toast.success(enabled ? t('API key disabled') : t('API key enabled'))
      await queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteToken(token.id),
    onSuccess: async () => {
      setConfirmOpen(false)
      toast.success(t('API key deleted'))
      await queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
  })

  const toggleStatusLabel = enabled ? t('Disable key') : t('Enable key')
  const expandLabel = props.expanded ? t('Collapse key details') : t('Expand key details')

  return (
    <article
      className={cn('panel overflow-hidden transition-[border-color]', enabled ? '' : 'opacity-75')}
    >
      <Collapsible onOpenChange={props.onToggleExpanded} open={props.expanded}>
        <header className="flex flex-col gap-4 p-4 lg:p-5">
          <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center">
            <div className="flex min-w-0 items-center gap-3 xl:w-[310px] xl:shrink-0">
              <Collapsible.Trigger
                className="size-8 min-h-8 shrink-0 justify-center"
                render={<Button aria-label={expandLabel} title={expandLabel} variant="quiet" />}
              >
                <ChevronDownIcon
                  aria-hidden="true"
                  className={cn('transition-transform', props.expanded ? 'rotate-180' : '')}
                />
              </Collapsible.Trigger>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-base font-bold text-foreground">{token.name}</h2>
                  <StatusBadge className="shrink-0" tone={statusToTone(token.status)}>
                    {statusLabelKey === undefined ? String(token.status) : t(statusLabelKey)}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {t('Created {{date}}', { date: formatDate(token.created_time) })}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              {routes.length === 0 ? (
                <span className="inline-flex items-center rounded-full border border-border bg-surface-high px-3 py-1 text-xs font-semibold text-muted">
                  {t('Account default group')}
                </span>
              ) : null}
              {shownRoutes.map((route) => (
                <GroupRouteBadge groupsKnown={props.groupsKnown} key={route.name} route={route} />
              ))}
              {hiddenRouteCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-border bg-surface-high px-3 py-1 text-xs font-semibold text-muted">
                  +{hiddenRouteCount}
                </span>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1 xl:justify-end">
              <div className="mr-2 min-w-28 text-left xl:text-right">
                <p className="mono text-sm font-bold text-foreground">
                  {formatQuota(token.used_quota, props.quotaPerUnit)}
                </p>
                <p className="text-[10px] uppercase text-muted">
                  {token.unlimited_quota
                    ? t('Spent · unlimited quota')
                    : t('Spent · {{remaining}} left', {
                      remaining: formatQuota(token.remain_quota, props.quotaPerUnit),
                    })}
                </p>
              </div>
              <Button
                aria-busy={toggleStatus.isPending}
                aria-label={toggleStatusLabel}
                disabled={toggleStatus.isPending}
                onClick={() => toggleStatus.mutate()}
                size="icon-md"
                title={toggleStatusLabel}
                variant="quiet"
              >
                <PowerIcon aria-hidden="true" />
              </Button>
              <Button
                aria-label={t('Edit key')}
                onClick={props.onEdit}
                size="icon-md"
                title={t('Edit key')}
                variant="quiet"
              >
                <PencilIcon aria-hidden="true" />
              </Button>
              <Button
                aria-label={t('Delete key')}
                onClick={() => setConfirmOpen(true)}
                size="icon-md"
                title={t('Delete key')}
                variant="danger"
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
            {/*
              The list endpoint only ever returns `abcd**********wxyz`; the full secret costs a
              separate POST /api/token/{id}/key, so it is fetched on demand and never guessed.
            */}
            {fullKey === null ? (
              <div className="flex min-w-0 items-center gap-1">
                <code className="mono min-w-0 truncate rounded-[4px] border border-border bg-surface-high px-3 py-2 text-sm text-muted">
                  {`sk-${token.key}`}
                </code>
                <Button
                  aria-busy={reveal.isPending}
                  aria-label={t('Retrieve key')}
                  disabled={reveal.isPending}
                  onClick={() => reveal.mutate()}
                  size="icon-md"
                  title={t('Retrieve key')}
                  variant="quiet"
                >
                  <KeyRoundIcon aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <MaskedValue
                copyLabel={t('Copy key')}
                copyable
                hideLabel={t('Hide key')}
                showLabel={t('Show key')}
                value={`sk-${fullKey}`}
              />
            )}
            <p className="text-muted">
              {token.expired_time === NEVER_EXPIRES
                ? t('Never expires')
                : t('Expires {{date}}', { date: formatDate(token.expired_time) })}
            </p>
          </div>
        </header>

        <Collapsible.Panel>
          <GroupRouteGrid
            crossGroupRetry={token.cross_group_retry}
            groupsKnown={props.groupsKnown}
            groupsPending={props.groupsPending}
            onEdit={props.onEdit}
            routes={routes}
          />
        </Collapsible.Panel>
      </Collapsible>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete key')}
        description={t('Deleting {{name}} immediately breaks any application still using it.', {
          name: token.name,
        })}
        destructive
        isLoading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={t('Delete key')}
      />
    </article>
  )
}
