import { useQuery } from '@tanstack/react-query'
import LayersIcon from 'lucide-react/dist/esm/icons/layers'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTable, useDataTable, type DataTableColumns } from '@/components/data'
import { Tabs } from '@/components/disclosure'
import { Checkbox, Input, NumberInput, SwitchRow } from '@/components/form'
import { ConfirmDialog, Dialog } from '@/components/overlay'
import { Button, Panel } from '@/components/ui'
import { AutoGroupOrder, GroupOverrideRules, GroupVisibilityRules } from '@/features/system-settings/billing/components/GroupRuleEditors'
import {
  AUTO_GROUPS_KEY,
  applyGroupRows,
  buildGroupRows,
  dropEmptyGroups,
  emptyGroupRow,
  findGroupOverrideProblem,
  findGroupRowProblem,
  GROUP_GROUP_RATIO_KEY,
  GROUP_PRICING_KEYS,
  GROUP_RATIO_KEY,
  GROUP_VISIBILITY_KEY,
  parseAutoGroups,
  parseGroupOverrides,
  parseGroupVisibility,
  stringifyAutoGroups,
  stringifyGroupOverrides,
  stringifyGroupVisibility,
  TOPUP_GROUP_RATIO_KEY,
  USER_USABLE_GROUPS_KEY,
  type GroupPricingMaps,
  type GroupRow,
} from '@/features/system-settings/billing/group-pricing'
import { checkJsonShape, isSameJson } from '@/features/system-settings/billing/option-json'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/billing/group-pricing`
 *
 * Eight keys, all confirmed present in `GET /api/option/`:
 *
 *   GroupRatio        '{"default":1,"svip":1,"vip":1}'
 *   TopupGroupRatio   '{"default":1,"svip":1,"vip":1}'
 *   UserUsableGroups  '{"default":"默认分组","vip":"vip分组"}'
 *   GroupGroupRatio                                 '{"vip":{"edit_this":0.9}}'
 *   group_ratio_setting.group_special_usable_group  '{}'
 *   AutoGroups        '["default"]'
 *   DefaultUseAutoGroup                             'false'
 *   MaxTokenAutoGroups                              '5'
 *
 * Four tabs, one per question an operator asks:
 *
 *   Pricing groups       the first three keys as ONE table of groups — the legacy console's
 *                        separate editors made it easy to price a group no user could
 *                        select, or to offer a group with no ratio at all
 *   Special ratio rules  GroupGroupRatio, per user group
 *   Group visibility     group_special_usable_group, per user group
 *   Auto group order     AutoGroups in the order they are tried, and the two auto settings
 *
 * `GroupGroupRatio` is one of the keys whose refusal arrives only AFTER the raw text has
 * replaced the stored value, so it is validated here before a write.
 */

type GroupTab = 'pricing' | 'overrides' | 'visibility' | 'auto'

type GroupDraft = GroupPricingMaps & {
  [AUTO_GROUPS_KEY]: string
  DefaultUseAutoGroup: boolean
  MaxTokenAutoGroups: number
  [GROUP_GROUP_RATIO_KEY]: string
  [GROUP_VISIBILITY_KEY]: string
}

function toDraft(options: SystemOptionMap | undefined): GroupDraft {
  return {
    [AUTO_GROUPS_KEY]: readOptionString(options, AUTO_GROUPS_KEY, '[]'),
    DefaultUseAutoGroup: readOptionBoolean(options, 'DefaultUseAutoGroup', false),
    MaxTokenAutoGroups: readOptionNumber(options, 'MaxTokenAutoGroups', 5),
    [GROUP_RATIO_KEY]: readOptionString(options, GROUP_RATIO_KEY, '{}'),
    [GROUP_VISIBILITY_KEY]: readOptionString(options, GROUP_VISIBILITY_KEY, '{}'),
    [GROUP_GROUP_RATIO_KEY]: readOptionString(options, GROUP_GROUP_RATIO_KEY, '{}'),
    [TOPUP_GROUP_RATIO_KEY]: readOptionString(options, TOPUP_GROUP_RATIO_KEY, '{}'),
    [USER_USABLE_GROUPS_KEY]: readOptionString(options, USER_USABLE_GROUPS_KEY, '{}'),
  }
}

export function GroupPricingSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())
  const [pendingRemoval, setPendingRemoval] = useState<string | undefined>(undefined)
  const [addOpen, setAddOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [tab, setTab] = useState<GroupTab>('pricing')

  const saved = toDraft(optionsQuery.data)

  const form = useOptionSectionForm<GroupDraft>({
    saved,
    validate: (values) => {
      const errors: Partial<Record<keyof GroupDraft, string>> = {}

      const rows = buildGroupRows(values)
      const badRow = rows.find((row) => findGroupRowProblem(row) !== undefined)
      if (badRow !== undefined) {
        errors[GROUP_RATIO_KEY] = t('“{{group}}” has a negative multiplier. The server rejects a negative group ratio.', { group: badRow.name })
      }

      if (checkJsonShape(values[GROUP_GROUP_RATIO_KEY], 'object') !== undefined) {
        errors[GROUP_GROUP_RATIO_KEY] = t('The stored special ratio rules are not a JSON object. Remove and re-add the rules.')
      } else {
        const badRule = findGroupOverrideProblem(parseGroupOverrides(values[GROUP_GROUP_RATIO_KEY]))
        if (badRule !== undefined) {
          errors[GROUP_GROUP_RATIO_KEY] = t('The ratio for users in “{{userGroup}}” billed as “{{group}}” must be a number that is not negative.', badRule)
        }
      }

      if (checkJsonShape(values[GROUP_VISIBILITY_KEY], 'object') !== undefined) {
        errors[GROUP_VISIBILITY_KEY] = t('The stored visibility rules are not a JSON object. Remove and re-add the rules.')
      }

      if (!Number.isInteger(values.MaxTokenAutoGroups) || values.MaxTokenAutoGroups <= 0) {
        errors.MaxTokenAutoGroups = t('Enter a whole number greater than 0.')
      }

      return errors
    },
    // A user group left without any rule says nothing, so it is not stored.
    serialize: {
      [GROUP_GROUP_RATIO_KEY]: (value) => dropEmptyGroups(String(value)),
      [GROUP_VISIBILITY_KEY]: (value) => dropEmptyGroups(String(value)),
    },
  })

  const rows = useMemo(() => buildGroupRows(form.values), [form.values])

  const registryNames = useMemo(() => rows.map((row) => row.name), [rows])
  const registryRatios = useMemo(
    () => Object.fromEntries(rows.flatMap((row) => (row.billingRatio === null ? [] : [[row.name, row.billingRatio]]))),
    [rows],
  )
  const overrides = useMemo(() => parseGroupOverrides(form.values[GROUP_GROUP_RATIO_KEY]), [form.values])
  const visibility = useMemo(() => parseGroupVisibility(form.values[GROUP_VISIBILITY_KEY]), [form.values])
  const autoGroups = useMemo(() => parseAutoGroups(form.values[AUTO_GROUPS_KEY]), [form.values])

  /**
   * Stores one JSON-valued key, but restores the SERVER'S text when its content did not
   * actually change. Without this, re-serialising a key on every edit would mark it dirty
   * purely because this console orders or formats it differently, and Save would rewrite
   * settings nobody touched.
   */
  type JsonKey = (typeof GROUP_PRICING_KEYS)[number] | typeof AUTO_GROUPS_KEY | typeof GROUP_GROUP_RATIO_KEY | typeof GROUP_VISIBILITY_KEY
  const setJsonField = useCallback(
    (key: JsonKey, text: string) => {
      const value = isSameJson(text, saved[key]) ? saved[key] : text
      if (value !== form.values[key]) form.setField(key, value)
    },
    [form, saved],
  )

  const commitRows = useCallback(
    (nextRows: readonly GroupRow[]) => {
      const next = applyGroupRows(nextRows)
      for (const key of GROUP_PRICING_KEYS) setJsonField(key, next[key])
    },
    [setJsonField],
  )

  const updateRow = useCallback(
    (name: string, patch: Partial<GroupRow>) => {
      commitRows(rows.map((row) => (row.name === name ? { ...row, ...patch } : row)))
    },
    [commitRows, rows],
  )

  const removeRow = (name: string) => {
    commitRows(rows.filter((row) => row.name !== name))
    // A group that is no longer priced cannot be picked by the auto group either.
    if (autoGroups.includes(name)) setJsonField(AUTO_GROUPS_KEY, stringifyAutoGroups(autoGroups.filter((group) => group !== name)))
    setPendingRemoval(undefined)
  }

  const addRow = () => {
    const name = newGroupName.trim()
    if (name === '' || rows.some((row) => row.name === name)) return
    commitRows([...rows, { ...emptyGroupRow(), label: name, name, selectable: true }])
    setNewGroupName('')
    setAddOpen(false)
  }

  const disabled = optionsQuery.isPending || form.isSaving

  /**
   * Every cell is an input, so the column definitions close over `updateRow` and are
   * rebuilt whenever the draft moves. That is deliberate and cheap: a deployment has a
   * handful of groups, and no column state (sorting, visibility) depends on identity.
   */
  const columns = useMemo<DataTableColumns<GroupRow>>(
    () => [
      {
        accessorKey: 'name',
        cell: ({ row }) => <span className="mono text-xs text-foreground">{row.original.name}</span>,
        header: () => t('Group'),
        id: 'name',
        meta: { label: t('Group'), mono: true },
      },
      {
        cell: ({ row }) => (
          <NumberInput
            disabled={disabled}
            hideLabel
            label={t('Billing multiplier for {{group}}', { group: row.original.name })}
            min={0}
            onValueChange={(value) => updateRow(row.original.name, { billingRatio: value })}
            placeholder="1"
            size="sm"
            step="any"
            value={row.original.billingRatio ?? ''}
          />
        ),
        header: () => t('Billing multiplier'),
        id: 'billing',
        meta: { label: t('Billing multiplier') },
      },
      {
        cell: ({ row }) => (
          <NumberInput
            disabled={disabled}
            hideLabel
            label={t('Top-up multiplier for {{group}}', { group: row.original.name })}
            min={0}
            onValueChange={(value) => updateRow(row.original.name, { topUpRatio: value })}
            placeholder="1"
            size="sm"
            step="any"
            value={row.original.topUpRatio ?? ''}
          />
        ),
        header: () => t('Top-up multiplier'),
        id: 'topup',
        meta: { label: t('Top-up multiplier') },
      },
      {
        cell: ({ row }) => (
          <div className="flex flex-col gap-2">
            <Input
              description={row.original.selectable ? undefined : t('Not selectable')}
              disabled={disabled || !row.original.selectable}
              hideLabel
              label={t('Label shown for {{group}}', { group: row.original.name })}
              onChange={(event) => updateRow(row.original.name, { label: event.target.value })}
              size="sm"
              value={row.original.label ?? ''}
            />
            <Checkbox
              checked={row.original.selectable}
              disabled={disabled}
              label={t('Users may select “{{group}}”', { group: row.original.name })}
              onCheckedChange={(checked) =>
                updateRow(row.original.name, {
                  label: row.original.label ?? row.original.name,
                  selectable: checked,
                })}
            />
          </div>
        ),
        header: () => t('Shown to users as'),
        id: 'label',
        meta: { label: t('Shown to users as') },
      },
      {
        cell: ({ row }) => (
          <Button
            aria-label={t('Remove group {{group}}', { group: row.original.name })}
            disabled={disabled}
            onClick={() => setPendingRemoval(row.original.name)}
            size="icon-sm"
            title={t('Remove group {{group}}', { group: row.original.name })}
            variant="quiet"
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        ),
        header: () => <span className="sr-only">{t('Actions')}</span>,
        id: 'actions',
        meta: { align: 'right', label: t('Actions') },
      },
    ],
    [disabled, t, updateRow],
  )

  const { table } = useDataTable<GroupRow>({
    columns,
    data: rows,
    getRowId: (row) => row.name,
    total: rows.length,
  })

  return (
    <SettingsSection
      description={t('What each group multiplies a charge by, what a top-up costs it, and which groups a user may choose.')}
      form={form}
      note={t('A group with no billing multiplier falls back to the server default of 1. Removing a group here only removes its pricing — accounts already assigned to it keep the assignment.')}
      saveMode="section"
      title={t('Group pricing')}
    >
      <Tabs onValueChange={(value) => setTab(value as GroupTab)} value={tab}>
        <Tabs.List label={t('Group settings')}>
          <Tabs.Tab value="pricing">{t('Pricing groups')}</Tabs.Tab>
          <Tabs.Tab value="overrides">{t('Special ratio rules')}</Tabs.Tab>
          <Tabs.Tab value="visibility">{t('Group visibility')}</Tabs.Tab>
          <Tabs.Tab value="auto">{t('Auto group order')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel className="flex flex-col gap-4 pt-4" value="pricing">
          <Panel className="overflow-hidden" muted>
            <DataTable
              emptyDescription={t('No groups are configured. Every account will bill at the server default multiplier of 1.')}
              emptyIcon={<LayersIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={t('No group pricing configured')}
              isLoading={optionsQuery.isPending}
              label={t('Groups, their multipliers and their visibility')}
              loadingLabel={t('Loading groups')}
              minWidthClassName="min-w-[46rem]"
              table={table}
            />
          </Panel>
          <div>
            <Button disabled={disabled} onClick={() => setAddOpen(true)} size="sm" variant="outline">
              <PlusIcon aria-hidden="true" />
              {t('Add a group')}
            </Button>
          </div>
        </Tabs.Panel>

        <Tabs.Panel className="pt-4" value="overrides">
          <GroupOverrideRules
            disabled={disabled}
            names={registryNames}
            onChange={(next) => setJsonField(GROUP_GROUP_RATIO_KEY, stringifyGroupOverrides(next))}
            overrides={overrides}
            ratios={registryRatios}
          />
        </Tabs.Panel>

        <Tabs.Panel className="pt-4" value="visibility">
          <GroupVisibilityRules
            disabled={disabled}
            names={registryNames}
            onChange={(next) => setJsonField(GROUP_VISIBILITY_KEY, stringifyGroupVisibility(next))}
            visibility={visibility}
          />
        </Tabs.Panel>

        <Tabs.Panel className="grid gap-6 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]" value="auto">
          <AutoGroupOrder
            disabled={disabled}
            groups={autoGroups}
            names={registryNames}
            onChange={(next) => setJsonField(AUTO_GROUPS_KEY, stringifyAutoGroups(next))}
          />
          <div className="flex flex-col gap-4 self-start">
            <SwitchRow
              checked={form.values.DefaultUseAutoGroup}
              description={t('New API keys start with automatic group selection instead of a fixed group.')}
              disabled={disabled}
              label={t('Use the automatic group by default')}
              onCheckedChange={(checked) => form.setField('DefaultUseAutoGroup', checked)}
            />
            <NumberInput
              description={t('How many groups a single API key may list for its own auto order.')}
              disabled={disabled}
              error={form.errors.MaxTokenAutoGroups}
              label={t('Maximum custom groups per token')}
              min={1}
              onValueChange={(value) => form.setField('MaxTokenAutoGroups', value ?? Number.NaN)}
              step={1}
              value={Number.isFinite(form.values.MaxTokenAutoGroups) ? form.values.MaxTokenAutoGroups : ''}
            />
          </div>
        </Tabs.Panel>
      </Tabs>

      {/* A problem is shown whichever tab is open, so a blocked save always says why. */}
      {[GROUP_RATIO_KEY, GROUP_GROUP_RATIO_KEY, GROUP_VISIBILITY_KEY].map((key) =>
        form.errors[key as keyof GroupDraft] ? (
          <p className="text-xs leading-5 text-destructive" key={key} role="alert">
            {form.errors[key as keyof GroupDraft]}
          </p>
        ) : null,
      )}

      <Dialog
        footer={(
          <>
            <Button onClick={() => setAddOpen(false)} variant="quiet">
              {t('Cancel')}
            </Button>
            <Button
              disabled={
                newGroupName.trim() === '' || rows.some((row) => row.name === newGroupName.trim())
              }
              onClick={addRow}
            >
              {t('Add group')}
            </Button>
          </>
        )}
        description={t('The name is the identifier the gateway matches against. It cannot be changed afterwards — remove the group and add it again instead.')}
        onOpenChange={setAddOpen}
        open={addOpen}
        size="sm"
        title={t('Add a group')}
      >
        <Input
          error={
            rows.some((row) => row.name === newGroupName.trim())
              ? t('A group with this name already exists.')
              : undefined
          }
          inputClassName="mono"
          label={t('Group name')}
          onChange={(event) => setNewGroupName(event.target.value)}
          placeholder="vip"
          value={newGroupName}
        />
      </Dialog>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Remove group')}
        description={t('“{{group}}” loses its billing multiplier, its top-up multiplier, its label and its place in the auto group order. Rules that name it stay and are marked. Nothing is written until you save the section.', { group: pendingRemoval ?? '' })}
        destructive
        onConfirm={() => {
          if (pendingRemoval !== undefined) removeRow(pendingRemoval)
        }}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(undefined)
        }}
        open={pendingRemoval !== undefined}
        title={t('Remove this group from pricing?')}
      />
    </SettingsSection>
  )
}
