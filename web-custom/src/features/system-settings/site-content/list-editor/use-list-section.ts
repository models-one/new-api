import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  readOptionBoolean,
  readOptionString,
  systemOptionsQuery,
} from '@/features/system-settings/options-store'
import {
  useOptionSectionForm,
  type OptionDraft,
  type OptionDraftValue,
  type OptionSectionForm,
} from '@/features/system-settings/section-form'
import { describeListIssue } from '@/features/system-settings/site-content/list-editor/list-messages'
import { inspectList, type ListEditorSpec } from '@/features/system-settings/site-content/list-editor/list-model'
import { compactJson } from '@/features/system-settings/site-content/option-json'

type UseListSectionOptions = {
  spec: ListEditorSpec
  /**
   * The companion `console_setting.*_enabled` flag, when the list has one. `Chats` has no
   * such flag: the chat launcher is always available and the empty list is how it is
   * turned off.
   */
  enabledKey?: string
}

export type ListSection = {
  form: OptionSectionForm<OptionDraft>
  /** The serialised list, ready for `OptionListEditor`. */
  blob: string
  setBlob: (next: string) => void
  /** The panel flag, or `true` when this list has none. */
  enabled: boolean
  setEnabled: (next: boolean) => void
  /** True while the shared option payload has not arrived. */
  isPending: boolean
  /** Controls disabled while loading or while a write is in flight. */
  disabled: boolean
}

/**
 * The wiring every list section repeats: read the blob and its panel flag out of the
 * shared option payload, validate the blob against the server's own rules, and compact it
 * on the way out.
 *
 * TWO KEYS, ONE SAVE. The blob and the flag are two option rows and therefore two
 * `PUT /api/option/` calls, and `useOptionSectionForm` makes them one Save that attempts
 * both. If the server refuses the blob — a colour it does not recognise, a duplicate
 * category — the flag still lands, the blob stays dirty holding the operator's text, and
 * the section names the refusal. That is better than an all-or-nothing save here, because
 * the two settings are genuinely independent: turning the panel off is a valid thing to
 * do while its contents are still being fixed.
 *
 * The draft is keyed by the OPTION KEYS themselves — `'console_setting.faq'`, dots and
 * all — because that is what the write endpoint takes. Nothing here splits a dotted key.
 */
export function useListSection(options: UseListSectionOptions): ListSection {
  const { t } = useTranslation()
  const { enabledKey, spec } = options
  const optionsQuery = useQuery(systemOptionsQuery())

  const saved = useMemo<OptionDraft>(() => {
    const draft: OptionDraft = { [spec.optionKey]: readOptionString(optionsQuery.data, spec.optionKey) }
    if (enabledKey !== undefined) {
      // `defaultConsoleSetting` in `setting/console_setting/config.go` has every panel
      // flag ON, so an unset key means enabled, not disabled.
      draft[enabledKey] = readOptionBoolean(optionsQuery.data, enabledKey, true)
    }
    return draft
  }, [enabledKey, optionsQuery.data, spec.optionKey])

  const validate = useCallback(
    (values: OptionDraft) => {
      const raw = values[spec.optionKey]
      const issue = inspectList(spec, typeof raw === 'string' ? raw : '')
      if (issue === undefined) return {}
      return { [spec.optionKey]: describeListIssue(issue, spec, t) }
    },
    [spec, t],
  )

  const serialize = useMemo(
    () => ({ [spec.optionKey]: (value: OptionDraftValue) => compactJson(String(value)) }),
    [spec.optionKey],
  )

  const form = useOptionSectionForm<OptionDraft>({ saved, serialize, validate })

  const rawBlob = form.values[spec.optionKey]
  const rawEnabled = enabledKey === undefined ? true : form.values[enabledKey]

  return {
    blob: typeof rawBlob === 'string' ? rawBlob : '',
    disabled: optionsQuery.isPending || form.isSaving,
    enabled: typeof rawEnabled === 'boolean' ? rawEnabled : true,
    form,
    isPending: optionsQuery.isPending,
    setBlob: (next: string) => form.setField(spec.optionKey, next),
    setEnabled: (next: boolean) => {
      if (enabledKey === undefined) return
      form.setField(enabledKey, next)
    },
  }
}
