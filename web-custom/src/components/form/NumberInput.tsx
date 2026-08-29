import type { ChangeEvent } from 'react'

import { Input, type InputProps } from '@/components/form/Input'
import { cn } from '@/lib/utils'

export type NumberInputProps = Omit<InputProps, 'type' | 'value' | 'defaultValue'> & {
  value?: number | string
  defaultValue?: number | string
  min?: number
  max?: number
  step?: number | 'any'
  /** Parsed convenience callback; null when the field is cleared. */
  onValueChange?: (value: number | null) => void
}

export function NumberInput(props: NumberInputProps) {
  const { inputClassName, inputMode = 'decimal', onChange, onValueChange, ...inputProps } = props

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event)
    if (!onValueChange) return
    const raw = event.target.value
    onValueChange(raw === '' ? null : Number(raw))
  }

  return (
    <Input
      {...inputProps}
      inputClassName={cn('mono', inputClassName)}
      inputMode={inputMode}
      onChange={handleChange}
      type="number"
    />
  )
}
