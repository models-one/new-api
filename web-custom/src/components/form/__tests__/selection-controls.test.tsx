// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Checkbox, RadioGroup, Switch, SwitchRow } from '@/components/form'

afterEach(cleanup)

describe('Checkbox', () => {
  it('is reachable by its accessible name and reports its state', () => {
    render(<Checkbox checked={false} label="Enable streaming" onCheckedChange={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: 'Enable streaming' })).not.toBeChecked()
  })

  it('reports the indeterminate state rather than silently showing unchecked', () => {
    render(<Checkbox checked="indeterminate" label="Select all" onCheckedChange={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: 'Select all' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    )
  })

  it('stays in the tree when disabled, and marks itself disabled to assistive tech', () => {
    render(<Checkbox checked={false} disabled label="Locked" onCheckedChange={vi.fn()} />)

    // Base UI renders a span[role=checkbox], not a native control, so the state is
    // carried by aria-disabled and the `data-disabled` attribute the styling hooks into.
    const box = screen.getByRole('checkbox', { name: 'Locked' })
    expect(box).toHaveAttribute('aria-disabled', 'true')
    expect(box).toHaveAttribute('data-disabled')
  })

  it('associates its description for assistive technology', () => {
    render(
      <Checkbox
        checked
        description="Applies to every key in this group."
        label="Cross-group retry"
        onCheckedChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('checkbox', { name: 'Cross-group retry' })).toHaveAccessibleDescription(
      'Applies to every key in this group.',
    )
  })
})

describe('Switch', () => {
  it('exposes switch semantics with its label', () => {
    render(<Switch checked label="Debug logging" onCheckedChange={vi.fn()} />)

    expect(screen.getByRole('switch', { name: 'Debug logging' })).toBeChecked()
  })

  it('SwitchRow keeps one accessible name rather than duplicating the visible label', () => {
    render(
      <SwitchRow
        checked={false}
        description="Writes upstream request bodies to the log."
        label="Debug logging"
        onCheckedChange={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('switch', { name: 'Debug logging' })).toHaveLength(1)
  })
})

describe('RadioGroup', () => {
  const options = [
    { value: 'alipay', label: 'Alipay' },
    { value: 'stripe', label: 'Stripe' },
  ] as const

  it('announces mutually exclusive options as radios inside a named group', () => {
    render(
      <RadioGroup label="Payment method" onValueChange={vi.fn()} options={options} value="alipay" />,
    )

    expect(screen.getByRole('radiogroup', { name: 'Payment method' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Alipay' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Stripe' })).not.toBeChecked()
  })

  it('selects an option on click', () => {
    function Harness() {
      const [value, setValue] = useState<'alipay' | 'stripe'>('alipay')
      return (
        <RadioGroup label="Payment method" onValueChange={setValue} options={options} value={value} />
      )
    }
    render(<Harness />)

    fireEvent.click(screen.getByRole('radio', { name: 'Stripe' }))
    expect(screen.getByRole('radio', { name: 'Stripe' })).toBeChecked()
  })
})
