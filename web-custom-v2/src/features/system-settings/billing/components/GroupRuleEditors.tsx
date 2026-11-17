import { useTranslation } from 'react-i18next'
import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down'
import ArrowUpIcon from 'lucide-react/dist/esm/icons/arrow-up'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import XIcon from 'lucide-react/dist/esm/icons/x'

import { Input, NativeSelect, NumberInput } from '@/components/form'
import { Badge, Button, Panel } from '@/components/ui'
import type { GroupOverride, GroupVisibility } from '@/features/system-settings/billing/group-pricing'

/**
 * The three editors that refer to groups by name: special ratio rules, group visibility
 * and the automatic group order. Each one is a pure view over a parsed list — it reports
 * the next list and the section turns it back into the option's JSON text.
 */

type GroupRegistry = {
  /** Groups of the pricing table, in table order. */
  names: readonly string[]
  /** The billing multiplier of each priced group, to show what a rule replaces. */
  ratios: Readonly<Record<string, number>>
}

/** A name used by a rule but missing from the pricing table still works; it is worth flagging. */
function UnknownGroupBadge(props: { name: string; names: readonly string[] }) {
  const { t } = useTranslation()
  if (props.names.includes(props.name)) return null
  return <Badge tone="warning">{t('Not in pricing table')}</Badge>
}

/** Options for a group picker: the table's groups, plus the current value when it is not one of them. */
function groupOptions(names: readonly string[], current: string, taken: readonly string[]) {
  const offered = names.filter((name) => name === current || !taken.includes(name))
  const all = current !== '' && !offered.includes(current) ? [current, ...offered] : offered
  return all.map((name) => ({ label: name, value: name }))
}

function AddGroupSelect(props: { label: string; candidates: readonly string[]; disabled: boolean; onAdd: (name: string) => void }) {
  const { t } = useTranslation()
  return (
    <NativeSelect
      className="max-w-sm"
      disabled={props.disabled || props.candidates.length === 0}
      hideLabel
      label={props.label}
      onChange={(event) => {
        if (event.target.value !== '') props.onAdd(event.target.value)
      }}
      options={[
        { label: props.candidates.length === 0 ? t('No more groups to add') : props.label, value: '' },
        ...props.candidates.map((name) => ({ label: name, value: name })),
      ]}
      value=""
    />
  )
}

type GroupOverrideRulesProps = GroupRegistry & {
  overrides: readonly GroupOverride[]
  disabled: boolean
  onChange: (overrides: GroupOverride[]) => void
}

/** `GroupGroupRatio`: for users of one group, the ratio that replaces a billing group's own. */
export function GroupOverrideRules(props: GroupOverrideRulesProps) {
  const { t } = useTranslation()
  const { overrides } = props

  const updateRules = (userGroup: string, rules: GroupOverride['rules']) =>
    props.onChange(overrides.map((entry) => (entry.userGroup === userGroup ? { ...entry, rules } : entry)))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted">
        {t('A call is billed at the ratio of the group it runs as. A rule here replaces that ratio for users who belong to a particular group.')}
      </p>

      {overrides.length === 0 ? <p className="text-sm text-muted">{t('No special ratios configured')}</p> : null}

      {overrides.map((entry) => {
        const taken = entry.rules.map((rule) => rule.group)
        const free = props.names.filter((name) => !taken.includes(name))
        return (
          <Panel className="flex flex-col gap-3 p-4" key={entry.userGroup} muted>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">{t('Users in {{group}}', { group: entry.userGroup })}</h4>
              <UnknownGroupBadge name={entry.userGroup} names={props.names} />
              <span className="text-xs text-muted">{t('{{count}} rules', { count: entry.rules.length })}</span>
              <Button
                aria-label={t('Remove the rules for {{group}}', { group: entry.userGroup })}
                className="ml-auto"
                disabled={props.disabled}
                onClick={() => props.onChange(overrides.filter((item) => item.userGroup !== entry.userGroup))}
                size="icon-sm"
                variant="quiet"
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </div>

            {entry.rules.map((rule, index) => {
              const own = props.ratios[rule.group]
              return (
                // Keyed by position: picking another group must not remount the row and drop focus.
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-start" key={index}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <NativeSelect
                      disabled={props.disabled}
                      hideLabel
                      label={t('Billing group of rule {{index}} for {{group}}', { group: entry.userGroup, index: index + 1 })}
                      onChange={(event) =>
                        updateRules(entry.userGroup, entry.rules.map((item, position) => (position === index ? { ...item, group: event.target.value } : item)))
                      }
                      options={groupOptions(props.names, rule.group, taken)}
                      size="sm"
                      value={rule.group}
                    />
                    <UnknownGroupBadge name={rule.group} names={props.names} />
                  </div>
                  <NumberInput
                    description={own === undefined ? undefined : t('(instead of {{ratio}})', { ratio: own })}
                    disabled={props.disabled}
                    hideLabel
                    label={t('Ratio when users in {{userGroup}} are billed as {{group}}', { group: rule.group, userGroup: entry.userGroup })}
                    min={0}
                    onValueChange={(ratio) =>
                      updateRules(entry.userGroup, entry.rules.map((item, position) => (position === index ? { ...item, ratio } : item)))
                    }
                    size="sm"
                    step="any"
                    value={rule.ratio ?? ''}
                  />
                  <Button
                    aria-label={t('Remove the {{group}} rule for {{userGroup}}', { group: rule.group, userGroup: entry.userGroup })}
                    disabled={props.disabled}
                    onClick={() => updateRules(entry.userGroup, entry.rules.filter((_, position) => position !== index))}
                    size="icon-sm"
                    variant="quiet"
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </div>
              )
            })}

            <div>
              <Button
                disabled={props.disabled || free.length === 0}
                onClick={() => updateRules(entry.userGroup, [...entry.rules, { group: free[0], ratio: 1 }])}
                size="sm"
                variant="outline"
              >
                {t('Add ratio override')}
              </Button>
            </div>
          </Panel>
        )
      })}

      <AddGroupSelect
        candidates={props.names.filter((name) => !overrides.some((entry) => entry.userGroup === name))}
        disabled={props.disabled}
        label={t('Add rules for a user group')}
        onAdd={(userGroup) => props.onChange([...overrides, { rules: [], userGroup }])}
      />
    </div>
  )
}

type GroupVisibilityRulesProps = {
  names: readonly string[]
  visibility: readonly GroupVisibility[]
  disabled: boolean
  onChange: (visibility: GroupVisibility[]) => void
}

/** `group_special_usable_group`: groups shown to, or hidden from, users of one group. */
export function GroupVisibilityRules(props: GroupVisibilityRulesProps) {
  const { t } = useTranslation()
  const { visibility } = props

  const updateRules = (userGroup: string, rules: GroupVisibility['rules']) =>
    props.onChange(visibility.map((entry) => (entry.userGroup === userGroup ? { ...entry, rules } : entry)))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted">
        {t('Every user can pick the groups marked selectable in the pricing table. A rule here shows one more group to the users of a particular group, or hides one from them.')}
      </p>

      {visibility.length === 0 ? <p className="text-sm text-muted">{t('No visibility rules configured')}</p> : null}

      {visibility.map((entry) => {
        const taken = entry.rules.map((rule) => rule.group)
        const free = props.names.filter((name) => !taken.includes(name))
        return (
          <Panel className="flex flex-col gap-3 p-4" key={entry.userGroup} muted>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">{t('Users in {{group}}', { group: entry.userGroup })}</h4>
              <UnknownGroupBadge name={entry.userGroup} names={props.names} />
              <span className="text-xs text-muted">{t('{{count}} rules', { count: entry.rules.length })}</span>
              <Button
                aria-label={t('Remove the rules for {{group}}', { group: entry.userGroup })}
                className="ml-auto"
                disabled={props.disabled}
                onClick={() => props.onChange(visibility.filter((item) => item.userGroup !== entry.userGroup))}
                size="icon-sm"
                variant="quiet"
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </div>

            {entry.rules.map((rule, index) => {
              const patch = (next: Partial<GroupVisibility['rules'][number]>) =>
                updateRules(entry.userGroup, entry.rules.map((item, position) => (position === index ? { ...item, ...next } : item)))
              return (
                <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start" key={index}>
                  <NativeSelect
                    disabled={props.disabled}
                    hideLabel
                    label={t('Visibility of {{group}} for users in {{userGroup}}', { group: rule.group, userGroup: entry.userGroup })}
                    onChange={(event) => patch({ bare: false, visible: event.target.value === 'visible' })}
                    options={[
                      { label: t('Extra visible'), value: 'visible' },
                      { label: t('Hidden'), value: 'hidden' },
                    ]}
                    size="sm"
                    value={rule.visible ? 'visible' : 'hidden'}
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    <NativeSelect
                      disabled={props.disabled}
                      hideLabel
                      label={t('Group of rule {{index}} for {{group}}', { group: entry.userGroup, index: index + 1 })}
                      onChange={(event) => patch({ group: event.target.value })}
                      options={groupOptions(props.names, rule.group, taken)}
                      size="sm"
                      value={rule.group}
                    />
                    <UnknownGroupBadge name={rule.group} names={props.names} />
                  </div>
                  <Input
                    disabled={props.disabled || !rule.visible}
                    hideLabel
                    label={t('Label of {{group}} for users in {{userGroup}}', { group: rule.group, userGroup: entry.userGroup })}
                    onChange={(event) => patch({ description: event.target.value })}
                    placeholder={rule.visible ? t('Description') : t('Not shown')}
                    size="sm"
                    value={rule.visible ? rule.description : ''}
                  />
                  <Button
                    aria-label={t('Remove the {{group}} rule for {{userGroup}}', { group: rule.group, userGroup: entry.userGroup })}
                    disabled={props.disabled}
                    onClick={() => updateRules(entry.userGroup, entry.rules.filter((_, position) => position !== index))}
                    size="icon-sm"
                    variant="quiet"
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </div>
              )
            })}

            <div>
              <Button
                disabled={props.disabled || free.length === 0}
                onClick={() => updateRules(entry.userGroup, [...entry.rules, { description: '', group: free[0], visible: true }])}
                size="sm"
                variant="outline"
              >
                {t('Add rule')}
              </Button>
            </div>
          </Panel>
        )
      })}

      <AddGroupSelect
        candidates={props.names.filter((name) => !visibility.some((entry) => entry.userGroup === name))}
        disabled={props.disabled}
        label={t('Add rules for a user group')}
        onAdd={(userGroup) => props.onChange([...visibility, { rules: [], userGroup }])}
      />
    </div>
  )
}

type AutoGroupOrderProps = {
  names: readonly string[]
  groups: readonly string[]
  disabled: boolean
  onChange: (groups: string[]) => void
}

/** `AutoGroups`: the groups a token in the `auto` group tries, from top to bottom. */
export function AutoGroupOrder(props: AutoGroupOrderProps) {
  const { t } = useTranslation()
  const { groups } = props

  function move(index: number, offset: -1 | 1) {
    const next = [...groups]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    props.onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-6 text-muted">
        {t('Priority order for tokens in the auto group. The system tries groups from top to bottom.')}
      </p>
      {groups.length === 0 ? (
        <p className="text-sm text-muted">{t('No auto groups configured')}</p>
      ) : (
        <ol aria-label={t('Auto group order')} className="flex flex-col gap-2">
          {groups.map((group, index) => (
            <li className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5" key={group}>
              <span className="w-5 text-center text-xs text-muted tabular-nums">{index + 1}</span>
              <span className="mono min-w-0 flex-1 truncate text-sm text-foreground">{group}</span>
              <UnknownGroupBadge name={group} names={props.names} />
              <Button
                aria-label={t('Move {{name}} up', { name: group })}
                disabled={props.disabled || index === 0}
                onClick={() => move(index, -1)}
                size="icon-sm"
                variant="quiet"
              >
                <ArrowUpIcon aria-hidden="true" />
              </Button>
              <Button
                aria-label={t('Move {{name}} down', { name: group })}
                disabled={props.disabled || index === groups.length - 1}
                onClick={() => move(index, 1)}
                size="icon-sm"
                variant="quiet"
              >
                <ArrowDownIcon aria-hidden="true" />
              </Button>
              <Button
                aria-label={t('Remove {{name}}', { name: group })}
                disabled={props.disabled}
                onClick={() => props.onChange(groups.filter((item) => item !== group))}
                size="icon-sm"
                variant="quiet"
              >
                <XIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <AddGroupSelect
        candidates={props.names.filter((name) => !groups.includes(name))}
        disabled={props.disabled}
        label={t('Add a group to the auto order')}
        onAdd={(name) => props.onChange([...groups, name])}
      />
    </div>
  )
}
