import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'
import CopyIcon from 'lucide-react/dist/esm/icons/copy'
import EyeIcon from 'lucide-react/dist/esm/icons/eye'
import EyeOffIcon from 'lucide-react/dist/esm/icons/eye-off'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PowerIcon from 'lucide-react/dist/esm/icons/power'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { GroupRouteBadge } from '@/features/settings/components/GroupRouteBadge'
import { ProviderGroupGrid } from '@/features/settings/components/ProviderGroupGrid'
import { modelGroupById } from '@/features/settings/data'
import type { ApiKeyRecord } from '@/features/settings/types'
import { cn } from '@/lib/utils'

type ApiKeyCardProps = {
  apiKey: ApiKeyRecord
  expanded: boolean
  secretVisible: boolean
  onToggleExpanded: () => void
  onToggleSecret: () => void
  onToggleActive: () => void
  onEdit: () => void
  onDelete: () => void
}

function maskSecret(secret: string): string {
  if (secret.length < 10) return '••••••••'
  return `${secret.slice(0, 7)}••••••••${secret.slice(-4)}`
}

export function ApiKeyCard(props: ApiKeyCardProps) {
  const { t } = useTranslation()
  const visibleGroups = props.apiKey.groupIds
    .map((groupId) => modelGroupById.get(groupId))
    .filter((group) => group !== undefined)
  const shownGroups = visibleGroups.slice(0, 4)
  const remainingGroupCount = visibleGroups.length - shownGroups.length
  const secret = props.secretVisible ? props.apiKey.secret : maskSecret(props.apiKey.secret)
  const toggleStatusLabel = props.apiKey.active ? t('Disable key') : t('Enable key')
  const expires = props.apiKey.expires === 'Never' ? t('Never') : props.apiKey.expires

  return (
    <article className={cn('panel overflow-hidden transition-[border-color]', props.apiKey.active ? '' : 'opacity-75')}>
      <header className="flex flex-col gap-4 p-4 lg:p-5">
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex min-w-0 items-center gap-3 xl:w-[310px] xl:shrink-0">
            <Button
              aria-expanded={props.expanded}
              aria-label={props.expanded ? t('Collapse key details') : t('Expand key details')}
              className="size-8 min-h-8 shrink-0 px-0"
              onClick={props.onToggleExpanded}
              title={props.expanded ? t('Collapse key details') : t('Expand key details')}
              variant="quiet"
            >
              <ChevronDownIcon aria-hidden="true" className={cn('transition-transform', props.expanded ? 'rotate-180' : '')} />
            </Button>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-base font-bold text-foreground">{props.apiKey.name}</h2>
                <Badge className="shrink-0" tone={props.apiKey.active ? 'success' : 'muted'}>
                  {t(props.apiKey.active ? 'Enabled' : 'Disabled')}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                {t('Created {{date}}', { date: props.apiKey.created })}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            {shownGroups.map((group) => <GroupRouteBadge group={group} key={group.id} />)}
            {remainingGroupCount > 0 ? (
              <span className="inline-flex items-center rounded-full border border-border bg-surface-high px-3 py-1 text-xs font-semibold text-muted">
                +{remainingGroupCount}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1 xl:justify-end">
            <div className="mr-2 min-w-24 text-left xl:text-right">
              <p className="mono text-sm font-bold text-foreground">${props.apiKey.spent.toFixed(2)}</p>
              <p className="text-[10px] uppercase text-muted">{props.apiKey.unlimitedQuota ? t('Unlimited') : t('Limited quota')}</p>
            </div>
            <Button aria-label={toggleStatusLabel} className="size-9 min-h-9 px-0" onClick={props.onToggleActive} title={toggleStatusLabel} variant="quiet">
              <PowerIcon aria-hidden="true" />
            </Button>
            <Button aria-label={t('Edit key')} className="size-9 min-h-9 px-0" onClick={props.onEdit} title={t('Edit key')} variant="quiet">
              <PencilIcon aria-hidden="true" />
            </Button>
            <Button aria-label={t('Delete key')} className="size-9 min-h-9 px-0" onClick={props.onDelete} title={t('Delete key')} variant="danger">
              <Trash2Icon aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-1">
            <code className="mono min-w-0 truncate rounded-[4px] border border-border bg-surface-high px-3 py-2 text-sm text-foreground">{secret}</code>
            <Button
              aria-label={props.secretVisible ? t('Hide secret') : t('Show secret')}
              className="size-9 min-h-9 px-0"
              onClick={props.onToggleSecret}
              title={props.secretVisible ? t('Hide secret') : t('Show secret')}
              variant="quiet"
            >
              {props.secretVisible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
            </Button>
            <Button
              aria-label={t('Copy key')}
              className="size-9 min-h-9 px-0"
              onClick={() => void navigator.clipboard?.writeText(props.apiKey.secret)}
              title={t('Copy key')}
              variant="quiet"
            >
              <CopyIcon aria-hidden="true" />
            </Button>
          </div>
          <p className="text-muted">{t('Expires {{date}}', { date: expires })}</p>
        </div>
      </header>

      {props.expanded ? <ProviderGroupGrid groupIds={props.apiKey.groupIds} onEdit={props.onEdit} /> : null}
    </article>
  )
}
