import CheckIcon from 'lucide-react/dist/esm/icons/check'
import CopyIcon from 'lucide-react/dist/esm/icons/copy'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Textarea } from '@/components/form'
import { Badge, Button, Spinner } from '@/components/ui'
import { ReasoningBlock } from '@/features/playground/components/ReasoningBlock'
import { RelayErrorNotice } from '@/features/playground/components/RelayErrorNotice'
import { ReplyMarkdown } from '@/features/playground/components/ReplyMarkdown'
import { splitReply } from '@/features/playground/think-tags'
import type { PlaygroundMessage } from '@/features/playground/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatTokens } from '@/lib/format'
import { cn } from '@/lib/utils'

type MessageTurnProps = {
  message: PlaygroundMessage
  role: number | undefined
  isGenerating: boolean
  onRegenerate: (id: string) => void
  onEdit: (id: string, content: string, resend: boolean) => void
  onDelete: (id: string) => void
}

/** Elapsed wall-clock time for a finished turn, from the local clock. */
function elapsedSeconds(message: PlaygroundMessage): number | null {
  if (message.startedAt === undefined || message.completedAt === undefined) return null
  return Math.max(0, message.completedAt - message.startedAt) / 1000
}

export function MessageTurn(props: MessageTurnProps) {
  const { t } = useTranslation()
  const { message } = props
  const { copied, copy } = useCopyToClipboard()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)

  const isUser = message.role === 'user'
  const isPending = message.status === 'loading' || message.status === 'streaming'
  const { reasoning, streamingThink, visible } = splitReply(message.content, message.reasoning)
  const elapsed = elapsedSeconds(message)

  const startEditing = () => {
    setDraft(message.content)
    setIsEditing(true)
  }

  const commitEdit = (resend: boolean) => {
    setIsEditing(false)
    props.onEdit(message.id, draft, resend)
  }

  return (
    <article
      aria-label={isUser ? t('Your message') : t('Model reply')}
      className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}
    >
      <div className="flex items-center gap-2">
        <span className="eyebrow">{isUser ? t('You') : t('Assistant')}</span>
        {message.model && !isUser ? (
          <span className="mono text-[11px] text-muted">{message.model}</span>
        ) : null}
        {message.status === 'aborted' ? (
          <Badge size="sm" tone="warning">{t('Stopped')}</Badge>
        ) : null}
      </div>

      <div
        className={cn(
          'min-w-0 max-w-full rounded-[4px] border px-4 py-3',
          isUser
            ? 'border-primary/30 bg-primary/5'
            : 'border-border bg-surface',
        )}
      >
        {isEditing ? (
          <div className="flex w-full min-w-0 flex-col gap-3 sm:w-[32rem]">
            <Textarea
              autoResize
              hideLabel
              label={t('Edit message')}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              value={draft}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => commitEdit(false)} size="sm" variant="outline">
                {t('Save')}
              </Button>
              {isUser ? (
                <Button disabled={props.isGenerating} onClick={() => commitEdit(true)} size="sm">
                  {t('Save and resend')}
                </Button>
              ) : null}
              <Button onClick={() => setIsEditing(false)} size="sm" variant="quiet">
                {t('Cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {!isUser ? (
              <ReasoningBlock
                isStreaming={
                  (isPending && reasoning !== '' && visible === '') || streamingThink
                }
                reasoning={reasoning}
              />
            ) : null}

            {isUser ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {message.content}
              </p>
            ) : (
              <ReplyMarkdown content={visible} />
            )}

            {isPending && visible === '' && reasoning === '' ? (
              <Spinner label={t('Waiting for the model')} size="sm" />
            ) : null}

            {message.status === 'error' && message.error ? (
              <RelayErrorNotice
                error={message.error}
                onRetry={props.isGenerating ? undefined : () => props.onRegenerate(message.id)}
                role={props.role}
              />
            ) : null}
          </>
        )}
      </div>

      {/*
        Actions stay mounted (never conditionally removed) so focus is not lost mid-turn;
        they are disabled instead while a generation is running.
      */}
      {isEditing ? null : (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            aria-label={copied ? t('Copied') : t('Copy message')}
            disabled={message.content === ''}
            onClick={() => void copy(message.content)}
            size="icon-xs"
            title={copied ? t('Copied') : t('Copy message')}
            variant="quiet"
          >
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          </Button>

          <Button
            aria-label={t('Edit message')}
            disabled={props.isGenerating || isPending}
            onClick={startEditing}
            size="icon-xs"
            title={t('Edit message')}
            variant="quiet"
          >
            <PencilIcon aria-hidden="true" />
          </Button>

          <Button
            aria-label={t('Regenerate from here')}
            disabled={props.isGenerating || isPending}
            onClick={() => props.onRegenerate(message.id)}
            size="icon-xs"
            title={t('Regenerate from here')}
            variant="quiet"
          >
            <RefreshCwIcon aria-hidden="true" />
          </Button>

          <Button
            aria-label={t('Delete message')}
            className="hover:text-destructive"
            disabled={props.isGenerating || isPending}
            onClick={() => props.onDelete(message.id)}
            size="icon-xs"
            title={t('Delete message')}
            variant="quiet"
          >
            <Trash2Icon aria-hidden="true" />
          </Button>

          {message.usage ? (
            <span className="mono ml-1 text-[11px] text-muted">
              {t('{{prompt}} in / {{completion}} out', {
                completion: formatTokens(message.usage.completion_tokens),
                prompt: formatTokens(message.usage.prompt_tokens),
              })}
            </span>
          ) : null}

          {elapsed !== null && !isUser ? (
            <span className="mono text-[11px] text-muted">{elapsed.toFixed(1)}s</span>
          ) : null}
        </div>
      )}
    </article>
  )
}
