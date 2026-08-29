import SearchIcon from 'lucide-react/dist/esm/icons/search'
import XIcon from 'lucide-react/dist/esm/icons/x'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, type InputProps } from '@/components/form/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export type SearchInputProps = Omit<
  InputProps,
  'defaultValue' | 'prefix' | 'suffix' | 'type' | 'value'
> & {
  value?: string
  defaultValue?: string
  /** Fires with the committed query, after `debounceMs` when set. */
  onValueChange?: (value: string) => void
  debounceMs?: number
  /** Overrides the built-in clear-button label. */
  clearLabel?: string
}

export function SearchInput(props: SearchInputProps) {
  const {
    clearLabel,
    debounceMs = 0,
    defaultValue,
    controlClassName,
    disabled,
    inputClassName,
    onChange,
    onValueChange,
    ref,
    value,
    ...inputProps
  } = props

  const { t } = useTranslation()
  const [draft, setDraft] = useState(value ?? defaultValue ?? '')
  const committedRef = useRef(draft)
  const changeRef = useRef(onValueChange)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const resolvedClearLabel = clearLabel ?? t('Clear search')

  useEffect(() => {
    changeRef.current = onValueChange
  })

  useEffect(() => {
    if (value === undefined || value === committedRef.current) return
    committedRef.current = value
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (draft === committedRef.current) return
    if (debounceMs <= 0) {
      committedRef.current = draft
      changeRef.current?.(draft)
      return
    }
    const timer = setTimeout(() => {
      committedRef.current = draft
      changeRef.current?.(draft)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [debounceMs, draft])

  const setInputRef = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node
    if (typeof ref === 'function') {
      ref(node)
      return
    }
    if (ref) ref.current = node
  }, [ref])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value)
    onChange?.(event)
  }

  const clear = () => {
    setDraft('')
    committedRef.current = ''
    changeRef.current?.('')
    inputRef.current?.focus()
  }

  return (
    <Input
      {...inputProps}
      controlClassName={cn('pr-1', controlClassName)}
      disabled={disabled}
      inputClassName={cn('[&::-webkit-search-cancel-button]:appearance-none', inputClassName)}
      onChange={handleChange}
      prefix={<SearchIcon aria-hidden="true" />}
      ref={setInputRef}
      suffix={
        <Button
          aria-label={resolvedClearLabel}
          className="disabled:opacity-0"
          disabled={disabled || draft === ''}
          onClick={clear}
          size="icon-sm"
          title={resolvedClearLabel}
          variant="quiet"
        >
          <XIcon aria-hidden="true" />
        </Button>
      }
      type="search"
      value={draft}
    />
  )
}
