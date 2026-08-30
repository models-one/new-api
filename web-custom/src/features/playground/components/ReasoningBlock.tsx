import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right'
import BrainIcon from 'lucide-react/dist/esm/icons/brain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Collapsible } from '@/components/disclosure'
import { Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

type ReasoningBlockProps = {
  reasoning: string
  /** Keeps the spinner up while `reasoning_content` is still arriving. */
  isStreaming: boolean
}

/**
 * The model's chain of thought, collapsed by default.
 *
 * Content arrives from `delta.reasoning_content` and from inline `<think>` blocks
 * (see `think-tags.ts`). It is rendered as PLAIN TEXT, not Markdown: reasoning is
 * frequently half-formed and full of stray backticks and angle brackets, and running it
 * through a Markdown renderer garbles it. `whitespace-pre-wrap` keeps its shape.
 */
export function ReasoningBlock(props: ReasoningBlockProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (props.reasoning.trim() === '' && !props.isStreaming) return null

  return (
    <Collapsible className="mb-3" onOpenChange={setOpen} open={open}>
      <Collapsible.Trigger className="text-xs text-muted hover:text-foreground">
        {props.isStreaming ? (
          <Spinner decorative size="xs" />
        ) : (
          <BrainIcon aria-hidden="true" className="size-3.5" />
        )}
        <span>{props.isStreaming ? t('Thinking…') : t('Reasoning')}</span>
        <ChevronRightIcon
          aria-hidden="true"
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
        />
      </Collapsible.Trigger>

      <Collapsible.Panel>
        <pre className="mono mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[4px] border border-border bg-canvas p-3 text-xs leading-6 text-muted">
          {props.reasoning}
        </pre>
      </Collapsible.Panel>
    </Collapsible>
  )
}
