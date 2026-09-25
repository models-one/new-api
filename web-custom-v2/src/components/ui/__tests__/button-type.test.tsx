// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'

afterEach(cleanup)

describe('Button type handling', () => {
  it('defaults to type="button" so a button inside a form never submits by accident', () => {
    render(<Button>Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('honours an explicit type="submit" and actually submits the form', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Create key</Button>
      </form>,
    )

    const submit = screen.getByRole('button', { name: 'Create key' })
    expect(submit).toHaveAttribute('type', 'submit')

    submit.click()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('honours type="reset"', () => {
    render(<Button type="reset">Reset</Button>)

    expect(screen.getByRole('button', { name: 'Reset' })).toHaveAttribute('type', 'reset')
  })
})
