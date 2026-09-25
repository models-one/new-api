// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { OtpCodeInput } from '@/features/auth/otp/OtpCodeInput'

function Harness(props: { initial?: string }) {
  const [value, setValue] = useState(props.initial ?? '')
  return <OtpCodeInput label="Authenticator code" onChange={setValue} value={value} />
}

afterEach(cleanup)

describe('OtpCodeInput', () => {
  it('is one labelled field, not six anonymous boxes', () => {
    render(<Harness />)

    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByLabelText('Authenticator code')).toBeInTheDocument()
  })

  it('advertises itself as a one-time code so the OS can offer the code', () => {
    render(<Harness />)

    const field = screen.getByLabelText('Authenticator code')
    expect(field).toHaveAttribute('autocomplete', 'one-time-code')
    expect(field).toHaveAttribute('inputmode', 'numeric')
  })

  it('fills every box from a single paste of the whole code', () => {
    render(<Harness />)

    const field = screen.getByLabelText('Authenticator code')
    fireEvent.change(field, { target: { value: '123456' } })

    expect(field).toHaveValue('123456')
    const boxes = document.querySelectorAll('[aria-hidden="true"] > span')
    expect(Array.from(boxes).map((box) => box.textContent)).toEqual([
      '1', '2', '3', '4', '5', '6',
    ])
  })

  it('accepts a code pasted with the spacing an authenticator app shows', () => {
    render(<Harness />)

    const field = screen.getByLabelText('Authenticator code')
    fireEvent.change(field, { target: { value: '123 456' } })

    expect(field).toHaveValue('123456')
  })

  it('drops non-digits instead of showing a code the server would reject', () => {
    render(<Harness />)

    const field = screen.getByLabelText('Authenticator code')
    fireEvent.change(field, { target: { value: '12ab34' } })

    expect(field).toHaveValue('1234')
  })

  it('stops at six digits however much is pasted', () => {
    render(<Harness />)

    const field = screen.getByLabelText('Authenticator code')
    fireEvent.change(field, { target: { value: '9876543210' } })

    expect(field).toHaveValue('987654')
  })

  it('supports clearing back to empty, which is what Backspace produces', () => {
    render(<Harness initial="123456" />)

    const field = screen.getByLabelText('Authenticator code')
    fireEvent.change(field, { target: { value: '12345' } })
    expect(field).toHaveValue('12345')
  })

  it('is a single tab stop, not six', () => {
    render(<Harness />)

    const field = screen.getByLabelText('Authenticator code')
    field.focus()

    expect(document.activeElement).toBe(field)
    // The boxes are painted decoration over one real input. Anything focusable inside
    // them would put the keyboard user through six stops to type one code, and a
    // screen reader through six unnamed controls.
    const decoration = document.querySelector('[aria-hidden="true"]')
    expect(decoration?.querySelectorAll('input, button, [tabindex]')).toHaveLength(0)
  })

  it('stays in the accessibility tree when disabled instead of disappearing', () => {
    render(
      <OtpCodeInput
        disabled
        label="Authenticator code"
        onChange={() => undefined}
        value="12"
      />,
    )

    expect(screen.getByLabelText('Authenticator code')).toBeDisabled()
  })

  it('marks the field invalid and names the error when one is given', () => {
    render(
      <OtpCodeInput
        error="Enter the six-digit code."
        label="Authenticator code"
        onChange={() => undefined}
        value=""
      />,
    )

    const field = screen.getByLabelText('Authenticator code')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the six-digit code.')
  })

  it('keeps the description programmatically attached to the field', () => {
    render(
      <OtpCodeInput
        description="Your authenticator app shows a new code every 30 seconds."
        label="Authenticator code"
        onChange={() => undefined}
        value=""
      />,
    )

    expect(screen.getByLabelText('Authenticator code')).toHaveAccessibleDescription(
      'Your authenticator app shows a new code every 30 seconds.',
    )
  })
})
