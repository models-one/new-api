import SendIcon from 'lucide-react/dist/esm/icons/send-horizontal'
import SquareIcon from 'lucide-react/dist/esm/icons/square'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { NativeSelect, Textarea } from '@/components/form'
import { Button } from '@/components/ui'
import type { PlaygroundGroup } from '@/features/playground/types'

type ComposerProps = {
  models: string[]
  groups: PlaygroundGroup[]
  model: string
  group: string
  isGenerating: boolean
  isLoadingModels: boolean
  hasMessages: boolean
  /** No model can be selected: the group offers none. Sending is impossible. */
  disabled: boolean
  onModelChange: (model: string) => void
  onGroupChange: (group: string) => void
  onSubmit: (text: string) => void
  onStop: () => void
  onClear: () => void
}

export function Composer(props: ComposerProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  const canSend = !props.isGenerating && !props.disabled && text.trim() !== ''

  // Distinct from the transcript's "No models in this group" empty state on purpose:
  // two controls reading identically makes the page ambiguous to describe and to test.
  let modelPlaceholder: string | undefined
  if (props.isLoadingModels) modelPlaceholder = t('Loading models…')
  else if (props.models.length === 0) modelPlaceholder = t('No models available')

  const submit = () => {
    if (!canSend) return
    props.onSubmit(text)
    setText('')
  }

  /** Enter sends, Shift+Enter inserts a newline — the convention for chat composers. */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    submit()
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <NativeSelect
          disabled={props.isGenerating}
          label={t('Billing group')}
          onChange={(event) => props.onGroupChange(event.target.value)}
          options={props.groups.map((group) => ({
            label: group.desc === '' ? group.value : `${group.value} — ${group.desc}`,
            value: group.value,
          }))}
          size="sm"
          value={props.group}
        />

        <NativeSelect
          disabled={props.isGenerating || props.isLoadingModels || props.models.length === 0}
          label={t('Model')}
          onChange={(event) => props.onModelChange(event.target.value)}
          options={props.models.map((model) => ({ label: model, value: model }))}
          placeholder={modelPlaceholder}
          size="sm"
          value={props.model}
        />
      </div>

      <Textarea
        autoResize
        disabled={props.disabled}
        hideLabel
        label={t('Message')}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('Send a message. Enter to send, Shift+Enter for a new line.')}
        rows={3}
        value={text}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button
          aria-label={t('Clear conversation')}
          disabled={!props.hasMessages || props.isGenerating}
          onClick={props.onClear}
          size="sm"
          title={t('Clear conversation')}
          variant="quiet"
        >
          <Trash2Icon aria-hidden="true" />
          {t('Clear')}
        </Button>

        {props.isGenerating ? (
          <Button
            aria-label={t('Stop generating')}
            onClick={props.onStop}
            size="sm"
            title={t('Stop generating')}
            variant="outline"
          >
            <SquareIcon aria-hidden="true" />
            {t('Stop')}
          </Button>
        ) : (
          <Button
            aria-label={t('Send message')}
            disabled={!canSend}
            onClick={submit}
            size="sm"
            title={t('Send message')}
          >
            <SendIcon aria-hidden="true" />
            {t('Send')}
          </Button>
        )}
      </div>
    </div>
  )
}
