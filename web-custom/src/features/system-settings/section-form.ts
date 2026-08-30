import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage, toast } from '@/components/overlay'
import { useInvalidateSystemOptions, writeSystemOption } from '@/features/system-settings/options-store'

/**
 * THE SETTINGS-FORM PATTERN
 * =========================
 * `PUT /api/option/` writes exactly ONE key. A section holding five settings is therefore
 * five sequential requests, and the interesting question is what happens when the third
 * of five is refused.
 *
 * THE ANSWER THIS HOOK IMPLEMENTS: the run does NOT abort. Every dirty key is attempted,
 * in a stable order, and the outcome is recorded per key. Afterwards
 *   - the option store is re-read once, so the UI shows what actually landed;
 *   - keys that saved are rebased and stop being dirty;
 *   - keys that failed STAY dirty and keep the operator's value, so pressing Save again
 *     retries only those;
 *   - the failures are handed back in `failures` for the section to render, and the toast
 *     says "partially saved", never "saved".
 *
 * Aborting on the first failure was rejected: the writes are independent, and stopping
 * would leave the operator unable to tell which of the remaining keys were even
 * attempted. Silence was rejected for the same reason — `SettingsSection` renders
 * `failures` as a destructive alert naming each key and quoting the server.
 *
 * PER-FIELD OR PER-SECTION? Both, and the choice is the section author's:
 *   - `save()` commits every dirty key. Right for a form of text fields, where a partial
 *     commit halfway through typing would be worse than one deliberate Save.
 *   - `commitField(key, value)` writes one key the moment it changes. Right for switches,
 *     where a toggle IS the decision and a Save button only adds a step.
 * `SettingsSection` renders the matching footer for each through its `saveMode` prop.
 *
 * DOTTED KEYS ARE LITERAL. Half the option keys look like `perf_metrics_setting.enabled`.
 * They are flat map keys, not paths, so this hook is keyed by the option key verbatim and
 * does no path splitting at all.
 *
 * NO RESYNC EFFECT. `saved` is re-read from the query on every render and the hook holds
 * only an overlay of the fields the operator has actually edited. A background refetch
 * therefore updates untouched fields immediately and can never clobber an edit in
 * progress — the bug class that a `useEffect(() => form.reset(saved))` invites.
 */

/** Option values a control can hold. Everything is serialised to a string on the way out. */
export type OptionDraftValue = string | number | boolean

export type OptionDraft = Record<string, OptionDraftValue>

/** One key the server refused, with the sentence it refused it in. */
export type OptionSaveFailure = {
  key: string
  message: string
}

/** How a section commits: all dirty keys behind one button, or each control on its own. */
export type OptionSaveMode = 'section' | 'field'

/** The type-erased slice `SettingsSection` needs; the generic form extends it. */
export type OptionSectionFormState = {
  isDirty: boolean
  /** Sorted, so the save order and the failure list are stable. */
  dirtyKeys: readonly string[]
  isSaving: boolean
  /** The key currently in flight, for a per-control busy state. */
  savingKey: string | undefined
  /** Non-empty only after a run in which at least one key was refused. */
  failures: readonly OptionSaveFailure[]
  /** True when a validation message is blocking the save. */
  hasBlockingErrors: boolean
  save: () => void
  reset: () => void
  dismissFailures: () => void
}

export type OptionSectionForm<TDraft extends OptionDraft> = OptionSectionFormState & {
  /** Saved values with the operator's edits laid over them. Always complete. */
  values: TDraft
  /** Only the messages that should be visible right now. */
  errors: Readonly<Partial<Record<keyof TDraft & string, string>>>
  /** Records an edit without contacting the server. Pair with `save()`. */
  setField: <TKey extends keyof TDraft & string>(key: TKey, value: TDraft[TKey]) => void
  /** Records an edit AND writes that one key immediately. The per-field save path. */
  commitField: <TKey extends keyof TDraft & string>(key: TKey, value: TDraft[TKey]) => void
  isFieldDirty: (key: keyof TDraft & string) => boolean
  isFieldSaving: (key: keyof TDraft & string) => boolean
}

export type UseOptionSectionFormOptions<TDraft extends OptionDraft> = {
  /**
   * The section's settings as they stand on the server, already coerced by the
   * `readOption*` helpers. Recreate it freely on every render — it is only read.
   */
  saved: TDraft
  /**
   * Per-key validation messages. Return an empty object when everything is fine. A
   * non-finite number is rejected before this runs, so a validator never sees one.
   */
  validate?: (values: TDraft) => Partial<Record<keyof TDraft & string, string>>
  /**
   * Per-key transform applied on the way to the server — trimming a URL, joining a list.
   * The value shown in the control is untouched.
   */
  serialize?: Partial<Record<keyof TDraft & string, (value: OptionDraftValue) => string | number | boolean>>
}

type SaveEntry = {
  key: string
  value: OptionDraftValue
}

type SaveOptions = {
  /**
   * Drop a refused key from the overlay instead of keeping the operator's value.
   *
   * Set by `commitField` and only there. In 'field' mode the edit WAS the click, and
   * there is no Save button to retry with — a switch left showing a state the server
   * rejected would be a lie. In 'section' mode the opposite is right: the value is kept
   * so the operator can correct it and press Save again.
   */
  revertFailures?: boolean
}

function omitKeys(source: Record<string, OptionDraftValue>, keys: readonly string[]) {
  if (keys.length === 0) return source
  const next: Record<string, OptionDraftValue> = {}
  for (const [key, value] of Object.entries(source)) {
    if (!keys.includes(key)) next[key] = value
  }
  return next
}

/**
 * Exported for its own test: the built-in non-finite guard runs BEFORE the caller's
 * validator, so `String(NaN)` can never reach the server as the literal text "NaN".
 */
export function collectOptionErrors<TDraft extends OptionDraft>(
  values: TDraft,
  numberMessage: string,
  validate?: (values: TDraft) => Partial<Record<keyof TDraft & string, string>>,
): Record<string, string> {
  const collected: Record<string, string> = {}

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'number' && !Number.isFinite(value)) collected[key] = numberMessage
  }

  if (validate !== undefined) {
    for (const [key, message] of Object.entries(validate(values))) {
      if (typeof message === 'string' && message !== '') collected[key] = message
    }
  }

  return collected
}

export function useOptionSectionForm<TDraft extends OptionDraft>(
  options: UseOptionSectionFormOptions<TDraft>,
): OptionSectionForm<TDraft> {
  const { saved, validate, serialize } = options
  const { t } = useTranslation()
  const invalidate = useInvalidateSystemOptions()

  const [overlay, setOverlay] = useState<Record<string, OptionDraftValue>>({})
  const [failures, setFailures] = useState<readonly OptionSaveFailure[]>([])
  const [savingKey, setSavingKey] = useState<string | undefined>(undefined)
  const [isSaving, setIsSaving] = useState(false)
  const [showAllErrors, setShowAllErrors] = useState(false)

  /** Guards against a second run being started from a stale render while one is live. */
  const runningRef = useRef(false)

  const numberMessage = t('Enter a number.')

  const values = useMemo(() => ({ ...saved, ...overlay }) as TDraft, [saved, overlay])

  const dirtyKeys = useMemo(
    () =>
      Object.keys(overlay)
        .filter((key) => overlay[key] !== saved[key])
        .sort(),
    [overlay, saved],
  )

  const allErrors = useMemo(
    () => collectOptionErrors(values, numberMessage, validate),
    [values, numberMessage, validate],
  )

  /**
   * An error is shown once the operator has touched that field, or once a save has been
   * attempted. A pristine section never opens with red text against values the server
   * already holds — those are the server's problem, not the operator's mistake.
   */
  const errors = useMemo(() => {
    const visible: Record<string, string> = {}
    for (const [key, message] of Object.entries(allErrors)) {
      if (showAllErrors || Object.hasOwn(overlay, key)) visible[key] = message
    }
    return visible as Readonly<Partial<Record<keyof TDraft & string, string>>>
  }, [allErrors, overlay, showAllErrors])

  const setField = useCallback(
    <TKey extends keyof TDraft & string>(key: TKey, value: TDraft[TKey]) => {
      setOverlay((previous) => ({ ...previous, [key]: value }))
    },
    [],
  )

  const reset = useCallback(() => {
    setOverlay({})
    setFailures([])
    setShowAllErrors(false)
  }, [])

  const dismissFailures = useCallback(() => setFailures([]), [])

  const runSave = useCallback(
    async (entries: readonly SaveEntry[], saveOptions?: SaveOptions) => {
      if (runningRef.current || entries.length === 0) return

      const candidate = { ...values } as TDraft
      for (const entry of entries) {
        ;(candidate as OptionDraft)[entry.key] = entry.value
      }

      const candidateErrors = collectOptionErrors(candidate, numberMessage, validate)
      if (entries.some((entry) => candidateErrors[entry.key] !== undefined)) {
        setShowAllErrors(true)
        return
      }

      runningRef.current = true
      setIsSaving(true)
      setFailures([])

      const savedKeys: string[] = []
      const failed: OptionSaveFailure[] = []

      for (const entry of entries) {
        setSavingKey(entry.key)
        const transform = serialize?.[entry.key]
        try {
          await writeSystemOption({
            key: entry.key,
            value: transform === undefined ? entry.value : transform(entry.value),
          })
          savedKeys.push(entry.key)
        } catch (error) {
          failed.push({ key: entry.key, message: toErrorMessage(error) })
        }
      }

      setSavingKey(undefined)

      // Re-read BEFORE dropping the saved keys from the overlay, so a control never
      // flashes its pre-save value while the refetch is still in flight.
      await invalidate()

      const settledKeys =
        saveOptions?.revertFailures === true
          ? [...savedKeys, ...failed.map((failure) => failure.key)]
          : savedKeys
      setOverlay((previous) => omitKeys(previous, settledKeys))
      setFailures(failed)
      setShowAllErrors(false)
      setIsSaving(false)
      runningRef.current = false

      if (failed.length === 0) {
        toast.success(t('Settings saved'))
      } else if (savedKeys.length > 0) {
        toast.warning(
          t('Saved {{saved}} of {{total}} settings. {{failed}} were refused.', {
            failed: failed.length,
            saved: savedKeys.length,
            total: entries.length,
          }),
        )
      } else {
        toast.error(t('Nothing was saved.'))
      }
    },
    [invalidate, numberMessage, serialize, t, validate, values],
  )

  const save = useCallback(
    () => void runSave(dirtyKeys.map((key) => ({ key, value: values[key] }))),
    [dirtyKeys, runSave, values],
  )

  const commitField = useCallback(
    <TKey extends keyof TDraft & string>(key: TKey, value: TDraft[TKey]) => {
      setOverlay((previous) => ({ ...previous, [key]: value }))
      if (value === saved[key]) return
      void runSave([{ key, value }], { revertFailures: true })
    },
    [runSave, saved],
  )

  const isFieldDirty = useCallback(
    (key: keyof TDraft & string) => dirtyKeys.includes(key),
    [dirtyKeys],
  )

  const isFieldSaving = useCallback(
    (key: keyof TDraft & string) => savingKey === key,
    [savingKey],
  )

  return {
    commitField,
    dirtyKeys,
    dismissFailures,
    errors,
    failures,
    hasBlockingErrors: dirtyKeys.some((key) => allErrors[key] !== undefined),
    isDirty: dirtyKeys.length > 0,
    isFieldDirty,
    isFieldSaving,
    isSaving,
    reset,
    save,
    savingKey,
    setField,
    values,
  }
}
