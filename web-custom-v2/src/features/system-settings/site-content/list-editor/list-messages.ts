import type { useTranslation } from 'react-i18next'

import type { ListEditorSpec, ListIssue } from '@/features/system-settings/site-content/list-editor/list-model'

type Translate = ReturnType<typeof useTranslation>['t']

/**
 * One issue → one sentence, used in two places that must agree: the alert above the table
 * and the section form's per-key validation message. Keeping the mapping here is what
 * stops the table saying "entry 2 is too long" while the Save button reports something
 * else about the same blob.
 *
 * Every message names the 1-BASED position, matching the server's own "第N个…" wording, so
 * an operator comparing this message with a refusal from the server is looking at the
 * same entry number.
 */
export function describeListIssue(issue: ListIssue, spec: ListEditorSpec, t: Translate): string {
  const fieldLabel = (name: string) =>
    spec.fields.find((field) => field.name === name)?.label ?? name

  switch (issue.kind) {
    case 'invalid-json':
      return t('This setting is not valid JSON, so its entries cannot be listed. Repair it on the JSON tab.')
    case 'not-array':
      return t('This setting must be a JSON array of entries.')
    case 'entry-unreadable':
      return t('Entry {{position}} is not shaped like an entry this editor understands, so nothing is shown rather than risk dropping it. Repair it on the JSON tab.', { position: issue.position })
    case 'too-many':
      return t('The server accepts at most {{max}} entries here, and this list has {{count}}.', { count: issue.count, max: issue.max })
    case 'field-required':
      return t('Entry {{position}}: “{{field}}” is required.', { field: fieldLabel(issue.field), position: issue.position })
    case 'field-too-long':
      return t('Entry {{position}}: “{{field}}” is longer than the {{bytes}} bytes the server allows.', { bytes: issue.maxBytes, field: fieldLabel(issue.field), position: issue.position })
    case 'field-duplicate':
      return t('Entry {{position}}: “{{field}}” is already used by another entry, and the server requires it to be unique.', { field: fieldLabel(issue.field), position: issue.position })
    default: {
      const message = spec.fields.find((field) => field.name === issue.field)?.checkMessage
      if (message !== undefined) {
        return t('Entry {{position}}: {{message}}', { message, position: issue.position })
      }
      return t('Entry {{position}}: “{{field}}” is not a value the server accepts.', { field: fieldLabel(issue.field), position: issue.position })
    }
  }
}
