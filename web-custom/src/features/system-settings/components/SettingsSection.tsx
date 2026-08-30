import CircleCheckIcon from 'lucide-react/dist/esm/icons/circle-check'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, Button, Panel } from '@/components/ui'
import type { OptionSaveMode, OptionSectionFormState } from '@/features/system-settings/section-form'

type SettingsSectionProps = {
  title: string
  /** One sentence saying what the settings in this section actually change. */
  description: string
  form: OptionSectionFormState
  /**
   * 'section' renders Discard + Save and a dirty counter — for forms of text fields.
   * 'field' renders no Save at all, because each control commits itself — for switches.
   */
  saveMode: OptionSaveMode
  /** Extra footnote rendered under the controls, e.g. a caveat about a key. */
  note?: ReactNode
  children: ReactNode
}

/**
 * The wrapper every settings section is built from: heading, description, the controls,
 * a live dirty indicator and — in 'section' mode — the save control.
 *
 * It also owns the partial-failure surface. `useOptionSectionForm` never aborts a run
 * part-way, so a section save of five keys can come back with two refusals; those land
 * in `form.failures` and are rendered here as a destructive alert naming each key and
 * quoting the server's own sentence, above the controls where the operator is looking.
 */
export function SettingsSection(props: SettingsSectionProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const { form } = props

  const dirtyCount = form.dirtyKeys.length

  const statusText = ((): string => {
    if (form.isSaving) return t('Saving…')
    if (props.saveMode === 'field') return t('Each control is saved on its own as you change it.')
    if (dirtyCount === 0) return t('No unsaved changes.')
    return t('{{n}} setting change(s) not saved yet.', { n: dirtyCount })
  })()

  return (
    <Panel aria-labelledby={titleId} as="section">
      <Panel.Header description={props.description} title={props.title} titleId={titleId} />

      <Panel.Body className="flex flex-col gap-5">
        {form.failures.length > 0 ? (
          <Alert
            dismissLabel={t('Dismiss the refusal notice')}
            dismissible
            icon={<TriangleAlertIcon aria-hidden="true" />}
            onDismiss={form.dismissFailures}
            title={t('The server refused some of these settings')}
            tone="destructive"
          >
            <p>
              {t('Each setting is written on its own, so the rest were saved. The refused ones still hold your value — fix them and save again.')}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {form.failures.map((failure) => (
                <li key={failure.key}>
                  <span className="mono text-xs text-foreground">{failure.key}</span>
                  <span aria-hidden="true"> — </span>
                  <span>{failure.message}</span>
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {props.children}

        {props.note ? <p className="text-xs leading-5 text-muted">{props.note}</p> : null}
      </Panel.Body>

      <Panel.Footer align="between">
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          {props.saveMode === 'section' && dirtyCount === 0 && !form.isSaving ? (
            <CircleCheckIcon aria-hidden="true" className="size-3.5 text-success" />
          ) : null}
          {statusText}
        </p>

        {props.saveMode === 'section' ? (
          <div className="flex items-center gap-2">
            <Button
              disabled={dirtyCount === 0 || form.isSaving}
              onClick={form.reset}
              size="sm"
              variant="outline"
            >
              {t('Discard changes')}
            </Button>
            <Button
              aria-busy={form.isSaving}
              disabled={dirtyCount === 0 || form.isSaving}
              onClick={form.save}
              size="sm"
            >
              {t('Save changes')}
            </Button>
          </div>
        ) : null}
      </Panel.Footer>
    </Panel>
  )
}
