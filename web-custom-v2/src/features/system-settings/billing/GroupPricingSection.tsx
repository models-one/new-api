import { useQuery } from '@tanstack/react-query'
import LayersIcon from 'lucide-react/dist/esm/icons/layers'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTable, useDataTable, type DataTableColumns } from '@/components/data'
import { Checkbox, Input, NumberInput, SwitchRow, Textarea } from '@/components/form'
import { ConfirmDialog, Dialog } from '@/components/overlay'
import { Button, Panel } from '@/components/ui'
import {
  AUTO_GROUPS_KEY,
  applyGroupRows,
  buildGroupRows,
  emptyGroupRow,
  findGroupRowProblem,
  GROUP_PRICING_KEYS,
  GROUP_RATIO_KEY,
  TOPUP_GROUP_RATIO_KEY,
  USER_USABLE_GROUPS_KEY,
  type GroupPricingMaps,
  type GroupRow,
} from '@/features/system-settings/billing/group-pricing'
import { checkJsonShape, formatJsonForEditor, isSameJson } from '@/features/system-settings/billing/option-json'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/billing/group-pricing`
 *
 * Seven keys, all confirmed present in `GET /api/option/`:
 *
 *   GroupRatio        '{"default":1,"svip":1,"vip":1}'
 *   TopupGroupRatio   '{"default":1,"svip":1,"vip":1}'
 *   UserUsableGroups  '{"default":"默认分组","vip":"vip分组"}'
 *   AutoGroups        '["default"]'
 *   DefaultUseAutoGroup                             'false'
 *   GroupGroupRatio                                 '{"vip":{"edit_this":0.9}}'
 *   group_ratio_setting.group_special_usable_group  '{}'
 *
 * The first four describe the same set of groups from four angles, so they are edited as
 * ONE table of groups rather than four JSON blobs — the legacy console's four separate
 * editors made it easy to price a group that no user could select, or to offer a group
 * with no ratio at all.
 *
 * The last two are nested maps (`{userGroup: {targetGroup: ratio}}` and
 * `{group: [groups]}`) with no flat row shape, so they keep a JSON editor. Both are
 * validated here before a write: `GroupGroupRatio` is one of the keys whose refusal
 * arrives only AFTER the raw text has replaced the stored value, so an unchecked write
 * corrupts the setting it failed to change.
 */

type GroupDraft = GroupPricingMaps & {
  DefaultUseAutoGroup: boolean
  GroupGroupRatio: string
  'group_ratio_setting.group_special_usable_group': string
}

function toDraft(options: SystemOptionMap | undefined): GroupDraft {
  return {
    [AUTO_GROUPS_KEY]: readOptionString(options, AUTO_GROUPS_KEY, '[]'),
    DefaultUseAutoGroup: readOptionBoolean(options, 'DefaultUseAutoGroup', false),
    [GROUP_RATIO_KEY]: readOptionString(options, GROUP_RATIO_KEY, '{}'),
    'group_ratio_setting.group_special_usable_group': readOptionString(
      options,
      'group_ratio_setting.group_special_usable_group',
      '{}',
    ),
    GroupGroupRatio: readOptionString(options, 'GroupGroupRatio', '{}'),
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

      const nested = checkJsonShape(values.GroupGroupRatio, 'object')
      if (nested !== undefined) {
        errors.GroupGroupRatio = nested === 'syntax'
          ? t('This is not valid JSON.')
          : t('This must be a JSON object.')
      }

      const special = checkJsonShape(
        values['group_ratio_setting.group_special_usable_group'],
        'object',
      )
      if (special !== undefined) {
        errors['group_ratio_setting.group_special_usable_group'] = special === 'syntax'
          ? t('This is not valid JSON.')
          : t('This must be a JSON object.')
      }

      return errors
    },
  })

  const rows = useMemo(() => buildGroupRows(form.values), [form.values])

  /**
   * Writes the four group keys back, but restores the SERVER'S text for any key whose
   * content did not actually change. Without this, re-serialising all four on every
   * keystroke would mark keys dirty purely because this console sorts them, and Save
   * would rewrite settings nobody touched.
   */
  const commitRows = useCallback(
    (nextRows: readonly GroupRow[]) => {
      const next = applyGroupRows(nextRows)
      for (const key of GROUP_PRICING_KEYS) {
        const value = isSameJson(next[key], saved[key]) ? saved[key] : next[key]
        if (value !== form.values[key]) form.setField(key, value)
      }
    },
    [form, saved],
  )

  const updateRow = useCallback(
    (name: string, patch: Partial<GroupRow>) => {
      commitRows(rows.map((row) => (row.name === name ? { ...row, ...patch } : row)))
    },
    [commitRows, rows],
  )

  const removeRow = (name: string) => {
    commitRows(rows.filter((row) => row.name !== name))
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
          <Checkbox
            checked={row.original.automatic}
            disabled={disabled}
            hideLabel
            label={t('“{{group}}” is in the automatic group pool', { group: row.original.name })}
            onCheckedChange={(checked) => updateRow(row.original.name, { automatic: checked })}
          />
        ),
        header: () => t('Automatic'),
        id: 'automatic',
        meta: { label: t('Automatic') },
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
      <Panel className="overflow-hidden" muted>
        <DataTable
          emptyDescription={t('No groups are configured. Every account will bill at the server default multiplier of 1.')}
          emptyIcon={<LayersIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
          emptyTitle={t('No group pricing configured')}
          isLoading={optionsQuery.isPending}
          label={t('Groups, their multipliers and their visibility')}
          loadingLabel={t('Loading groups')}
          minWidthClassName="min-w-[52rem]"
          table={table}
        />
      </Panel>

      {form.errors[GROUP_RATIO_KEY] ? (
        <p className="text-xs leading-5 text-destructive" role="alert">
          {form.errors[GROUP_RATIO_KEY]}
        </p>
      ) : null}

      <div>
        <Button disabled={disabled} onClick={() => setAddOpen(true)} size="sm" variant="outline">
          <PlusIcon aria-hidden="true" />
          {t('Add a group')}
        </Button>
      </div>

      <SwitchRow
        checked={form.values.DefaultUseAutoGroup}
        description={t('New API keys start with automatic group selection instead of a fixed group.')}
        disabled={disabled}
        label={t('Use the automatic group by default')}
        onCheckedChange={(checked) => form.setField('DefaultUseAutoGroup', checked)}
      />

      <Textarea
        description={t('Per-group overrides, as {"user group": {"target group": multiplier}}. An entry here wins over the group’s own billing multiplier when an account in the outer group uses the inner one.')}
        disabled={disabled}
        error={form.errors.GroupGroupRatio}
        label={t('Group-to-group overrides')}
        onBlur={() => form.setField('GroupGroupRatio', formatJsonForEditor(form.values.GroupGroupRatio))}
        onChange={(event) => form.setField('GroupGroupRatio', event.target.value)}
        rows={5}
        textareaClassName="mono text-xs"
        value={form.values.GroupGroupRatio}
      />

      <Textarea
        description={t('Extra groups a member of one group may also select, as {"group": ["other group"]}. Leave as {} when nobody needs it.')}
        disabled={disabled}
        error={form.errors['group_ratio_setting.group_special_usable_group']}
        label={t('Additional selectable groups')}
        onBlur={() =>
          form.setField(
            'group_ratio_setting.group_special_usable_group',
            formatJsonForEditor(form.values['group_ratio_setting.group_special_usable_group']),
          )}
        onChange={(event) =>
          form.setField('group_ratio_setting.group_special_usable_group', event.target.value)}
        rows={4}
        textareaClassName="mono text-xs"
        value={form.values['group_ratio_setting.group_special_usable_group']}
      />

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
        description={t('“{{group}}” loses its billing multiplier, its top-up multiplier, its label and its place in the automatic pool. Nothing is written until you save the section.', { group: pendingRemoval ?? '' })}
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
