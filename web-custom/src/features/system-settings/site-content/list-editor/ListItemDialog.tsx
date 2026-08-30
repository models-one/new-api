import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NativeSelect, Textarea } from '@/components/form'
import { Dialog } from '@/components/overlay'
import { Button } from '@/components/ui'
import { fromDateTimeLocal, toDateTimeLocal } from '@/features/system-settings/site-content/datetime'
import type { ListEditorSpec, ListFields } from '@/features/system-settings/site-content/list-editor/list-model'

type ListItemDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  spec: ListEditorSpec
  /** Dialog heading — "Add an announcement" or "Edit announcement". */
  title: string
  description: string
  submitLabel: string
  /** The row being edited, or a blank row for an add. */
  initialFields: ListFields
  /** Every message that applies to this row right now, keyed by field name. */
  validate: (fields: ListFields) => Readonly<Record<string, string>>
  onSubmit: (fields: ListFields) => void
}

/**
 * The add/edit form for one row of a list option.
 *
 * It is deliberately a DRAFT: nothing here contacts the server. Submitting hands the row
 * back to the editor, which folds it into the blob; the blob is written only when the
 * section is saved. That keeps a five-row edit to one `PUT /api/option/` instead of five,
 * and it means an operator can back out of the whole thing with "Discard changes".
 *
 * Errors appear on a field once it has been touched, or on everything once Submit has
 * been pressed — an add dialog does not open with four red messages against empty fields.
 */
export function ListItemDialog(props: ListItemDialogProps) {
  const { t } = useTranslation()
  const [fields, setFields] = useState<ListFields>(props.initialFields)
  const [touched, setTouched] = useState<Record<string, true>>({})
  const [submitted, setSubmitted] = useState(false)

  // The dialog is remounted per open by its `key` in the editor, but a parent re-render
  // while it is closed must not leave a stale row behind.
  useEffect(() => {
    if (props.open) return
    setFields(props.initialFields)
    setTouched({})
    setSubmitted(false)
  }, [props.open, props.initialFields])

  const allErrors = props.validate(fields)
  const visibleError = (name: string): string | undefined => {
    if (!submitted && touched[name] !== true) return undefined
    return allErrors[name]
  }

  const setField = (name: string, value: string) => {
    setFields((previous) => ({ ...previous, [name]: value }))
    setTouched((previous) => ({ ...previous, [name]: true }))
  }

  const submit = () => {
    setSubmitted(true)
    if (Object.keys(allErrors).length > 0) return
    props.onSubmit(fields)
  }

  return (
    <Dialog
      description={props.description}
      footer={(
        <>
          <Button onClick={() => props.onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button onClick={submit}>{props.submitLabel}</Button>
        </>
      )}
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="md"
      title={props.title}
    >
      <div className="flex flex-col gap-5">
        {props.spec.fields.map((field) => {
          const value = fields[field.name] ?? ''
          const error = visibleError(field.name)
          const shared = {
            description: field.description,
            error,
            invalid: error !== undefined,
            label: field.label,
            required: field.required,
          }

          if (field.kind === 'select') {
            return (
              <NativeSelect
                {...shared}
                key={field.name}
                onChange={(event) => setField(field.name, event.target.value)}
                options={field.options ?? []}
                placeholder={field.placeholder}
                value={value}
              />
            )
          }

          if (field.kind === 'textarea') {
            return (
              <Textarea
                {...shared}
                key={field.name}
                onChange={(event) => setField(field.name, event.target.value)}
                placeholder={field.placeholder}
                rows={field.rows ?? 4}
                value={value}
              />
            )
          }

          if (field.kind === 'datetime') {
            return (
              <Input
                {...shared}
                key={field.name}
                onChange={(event) => setField(field.name, fromDateTimeLocal(event.target.value))}
                type="datetime-local"
                value={toDateTimeLocal(value)}
              />
            )
          }

          return (
            <Input
              {...shared}
              key={field.name}
              onChange={(event) => setField(field.name, event.target.value)}
              placeholder={field.placeholder}
              value={value}
            />
          )
        })}
      </div>
    </Dialog>
  )
}
