import { useMutation, useQueryClient } from '@tanstack/react-query'
import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down'
import ArrowUpIcon from 'lucide-react/dist/esm/icons/arrow-up'
import CheckIcon from 'lucide-react/dist/esm/icons/check'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NumberInput } from '@/components/form'
import { Dialog, toast } from '@/components/overlay'
import { Button, Skeleton } from '@/components/ui'
import { GroupRouteBadge } from '@/features/settings/components/GroupRouteBadge'
import { LoadErrorAlert } from '@/features/settings/components/LoadErrorAlert'
import {
  NEVER_EXPIRES,
  groupFieldsFor,
  toGroupRoutes,
  tokenGroupNames,
  usesAutoRouting,
} from '@/features/settings/routing'
import type { ApiKeyEditorTarget } from '@/features/settings/types'
import { createToken, updateToken, type TokenDraft } from '@/lib/api/tokens'
import type { UserGroupMap } from '@/lib/api/user'
import { formatNumber, fromUnixSeconds, quotaToCurrency, toUnixSeconds } from '@/lib/format'
import { cn } from '@/lib/utils'

type GroupsState = {
  data: UserGroupMap | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  isFetching: boolean
  refetch: () => void
}

type ApiKeyEditorDialogProps = {
  target: ApiKeyEditorTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `/api/user/self/groups` — the only real source of selectable groups. */
  groups: GroupsState
  /** `quota_per_unit` from `/api/status`. */
  quotaPerUnit: number
}

/** `model.Token.Name` is rejected by the backend beyond this length. */
const MAX_NAME_LENGTH = 50

/** `<input type="datetime-local">` wants local wall-clock time, not an ISO instant. */
function toDateTimeLocal(seconds: number): string {
  const date = fromUnixSeconds(seconds)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function ToggleField(props: {
  checked: boolean
  description?: string
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  const inputId = useId()

  return (
    <div className="flex items-start gap-3">
      <input
        checked={props.checked}
        className="field mt-0.5 size-4 min-h-4 shrink-0 accent-primary"
        disabled={props.disabled}
        id={inputId}
        onChange={(event) => props.onChange(event.target.checked)}
        type="checkbox"
      />
      <div className="min-w-0">
        <label className="text-sm font-semibold text-foreground" htmlFor={inputId}>
          {props.label}
        </label>
        {props.description ? (
          <p className="mt-1 text-xs leading-5 text-muted">{props.description}</p>
        ) : null}
      </div>
    </div>
  )
}

export function ApiKeyEditorDialog(props: ApiKeyEditorDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const existing = props.target.mode === 'edit' ? props.target.token : undefined

  const [name, setName] = useState(existing?.name ?? '')
  const [selectedGroups, setSelectedGroups] = useState(() => (
    existing ? tokenGroupNames(existing) : []
  ))
  const [crossGroupRetry, setCrossGroupRetry] = useState(existing?.cross_group_retry ?? false)
  const [unlimitedQuota, setUnlimitedQuota] = useState(existing?.unlimited_quota ?? true)
  const [quotaAmount, setQuotaAmount] = useState(() => (
    existing ? String(quotaToCurrency(existing.remain_quota, props.quotaPerUnit)) : ''
  ))
  const [neverExpires, setNeverExpires] = useState(
    existing === undefined || existing.expired_time === NEVER_EXPIRES,
  )
  const [expiresAt, setExpiresAt] = useState(() => (
    existing && existing.expired_time !== NEVER_EXPIRES ? toDateTimeLocal(existing.expired_time) : ''
  ))

  const groupOptions = Object.entries(props.groups.data ?? {})
  const quotaUnits = Math.round(Number(quotaAmount) * props.quotaPerUnit)
  const autoRouting = usesAutoRouting(selectedGroups)

  const nameValid = name.trim().length > 0 && name.trim().length <= MAX_NAME_LENGTH
  const quotaValid = unlimitedQuota || (quotaAmount !== '' && Number.isFinite(quotaUnits) && quotaUnits >= 0)
  const expiryValid = neverExpires || Number.isFinite(new Date(expiresAt).getTime())

  const save = useMutation({
    mutationFn: () => {
      const groupFields = groupFieldsFor(selectedGroups)
      const draft: TokenDraft = {
        name: name.trim(),
        remain_quota: unlimitedQuota ? 0 : quotaUnits,
        expired_time: neverExpires ? NEVER_EXPIRES : toUnixSeconds(new Date(expiresAt)),
        unlimited_quota: unlimitedQuota,
        // Not editable here — carried over so the update does not silently clear them.
        model_limits_enabled: existing?.model_limits_enabled ?? false,
        model_limits: existing?.model_limits ?? '',
        allow_ips: existing?.allow_ips ?? '',
        group: groupFields.group,
        auto_groups: groupFields.auto_groups,
        // The relay reads this flag only in `auto` mode, so storing it otherwise is a lie.
        cross_group_retry: autoRouting && crossGroupRetry,
      }
      if (existing) return updateToken({ ...draft, id: existing.id })
      return createToken(draft)
    },
    onSuccess: async () => {
      toast.success(existing ? t('API key updated') : t('API key created'))
      props.onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
  })

  const toggleGroup = (groupName: string) => {
    setSelectedGroups((current) => (
      current.includes(groupName)
        ? current.filter((candidate) => candidate !== groupName)
        : [...current, groupName]
    ))
  }

  const moveGroup = (groupName: string, offset: -1 | 1) => {
    setSelectedGroups((current) => {
      const index = current.indexOf(groupName)
      const target = index + offset
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      next[index] = next[target]
      next[target] = groupName
      return next
    })
  }

  const canSave = nameValid && quotaValid && expiryValid && !save.isPending

  return (
    <Dialog
      footer={(
        <>
          <Button disabled={save.isPending} onClick={() => props.onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button aria-busy={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
            {existing ? t('Update key') : t('Create key')}
          </Button>
        </>
      )}
      onOpenChange={(nextOpen) => {
        if (save.isPending && !nextOpen) return
        props.onOpenChange(nextOpen)
      }}
      open={props.open}
      size="lg"
      title={existing ? t('Edit API key') : t('New API key')}
    >
      <Input
        autoFocus
        label={t('Key name')}
        maxLength={MAX_NAME_LENGTH}
        onChange={(event) => setName(event.target.value)}
        placeholder={t('API key name')}
        required
        value={name}
      />

      <section className="mt-6 border-t border-border pt-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-bold">{t('Group priority')}</h3>
          <span className="mono text-xs text-muted">
            {t('{{count}} groups selected', { count: selectedGroups.length })}
          </span>
        </div>

        {selectedGroups.length > 0 ? (
          <ol className="mt-3 flex flex-col gap-2">
            {toGroupRoutes(selectedGroups, props.groups.data).map((route, index) => (
              <li
                className="flex min-w-0 items-center gap-2 rounded-[4px] border border-border bg-surface-high/40 p-2"
                key={route.name}
              >
                <span className="mono grid size-7 shrink-0 place-items-center text-xs text-muted">
                  {index + 1}
                </span>
                <GroupRouteBadge
                  className="min-w-0"
                  groupsKnown={props.groups.data !== undefined}
                  route={route}
                />
                <div className="ml-auto flex shrink-0 gap-1">
                  <Button
                    aria-label={`${t('Move group up')}: ${route.name}`}
                    disabled={index === 0}
                    onClick={() => moveGroup(route.name, -1)}
                    size="icon-sm"
                    title={t('Move group up')}
                    variant="quiet"
                  >
                    <ArrowUpIcon aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={`${t('Move group down')}: ${route.name}`}
                    disabled={index === selectedGroups.length - 1}
                    onClick={() => moveGroup(route.name, 1)}
                    size="icon-sm"
                    title={t('Move group down')}
                    variant="quiet"
                  >
                    <ArrowDownIcon aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-muted">
            {t('No group selected: this key routes through your account default group.')}
          </p>
        )}

        <div className="mt-4">
          <ToggleField
            checked={autoRouting && crossGroupRetry}
            description={autoRouting
              ? t('Retries the next group in this list when the current one has no channel for the model.')
              : t('Only has an effect once a key routes through two or more groups.')}
            disabled={!autoRouting}
            label={t('Cross-group retry')}
            onChange={setCrossGroupRetry}
          />
        </div>
      </section>

      <section className="mt-5 border-t border-border pt-5">
        <h3 className="text-sm font-bold">{t('Available groups')}</h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          {t('A group is a billing label your operator configured: a name, a description and a ratio.')}
        </p>

        {props.groups.isError ? (
          <LoadErrorAlert
            className="mt-3"
            error={props.groups.error}
            isRetrying={props.groups.isFetching}
            onRetry={props.groups.refetch}
          />
        ) : null}

        {props.groups.isPending ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Skeleton height={40} label={t('Loading groups')} variant="block" width={160} />
            <Skeleton height={40} variant="block" width={160} />
          </div>
        ) : null}

        {!props.groups.isPending && !props.groups.isError && groupOptions.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('Your account has no selectable groups.')}</p>
        ) : null}

        {groupOptions.length > 0 ? (
          <div aria-label={t('Available groups')} className="mt-3 flex flex-wrap gap-2" role="group">
            {groupOptions.map(([groupName, group]) => {
              const selected = selectedGroups.includes(groupName)
              return (
                <button
                  aria-checked={selected}
                  aria-label={`${groupName} x${group.ratio}`}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-2 rounded-[4px] border px-3 py-2 text-left text-xs font-semibold transition-colors',
                    selected
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border bg-surface-high/40 text-muted hover:border-border-strong hover:text-foreground',
                  )}
                  key={groupName}
                  onClick={() => toggleGroup(groupName)}
                  role="checkbox"
                  title={group.desc}
                  type="button"
                >
                  <span
                    className={cn(
                      'grid size-4 place-items-center border',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-surface',
                    )}
                  >
                    {selected ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
                  </span>
                  <span>{groupName}</span>
                  <span className="mono text-[10px] opacity-80">x{group.ratio}</span>
                </button>
              )
            })}
          </div>
        ) : null}
      </section>

      <section className="mt-5 flex flex-col gap-4 border-t border-border pt-5">
        <h3 className="text-sm font-bold">{t('Quota and expiry')}</h3>

        <ToggleField
          checked={unlimitedQuota}
          description={t('An unlimited key draws on your account balance instead of its own budget.')}
          label={t('Unlimited quota')}
          onChange={setUnlimitedQuota}
        />

        {unlimitedQuota ? null : (
          <NumberInput
            description={t('Stored as {{units}} quota units, using the divisor from /api/status.', {
              units: formatNumber(quotaUnits),
            })}
            label={t('Remaining quota')}
            min={0}
            onChange={(event) => setQuotaAmount(event.target.value)}
            prefix="$"
            step="any"
            value={quotaAmount}
          />
        )}

        <ToggleField
          checked={neverExpires}
          label={t('Never expires')}
          onChange={setNeverExpires}
        />

        {neverExpires ? null : (
          <Input
            label={t('Expires at')}
            onChange={(event) => setExpiresAt(event.target.value)}
            type="datetime-local"
            value={expiresAt}
          />
        )}
      </section>
    </Dialog>
  )
}
