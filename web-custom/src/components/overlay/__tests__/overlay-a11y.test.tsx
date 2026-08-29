// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { ConfirmDialog } from '@/components/overlay/ConfirmDialog'
import { Dialog } from '@/components/overlay/Dialog'
import { Drawer } from '@/components/overlay/Drawer'
import { Button } from '@/components/ui/Button'

afterEach(cleanup)

function DialogHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>New API key</Button>
      <Dialog
        footer={<Button>Create key</Button>}
        onOpenChange={setOpen}
        open={open}
        size="lg"
        title="New API key"
      >
        <label className="flex flex-col" htmlFor="key-name">
          Key name
          <input className="field" id="key-name" />
        </label>
      </Dialog>
    </>
  )
}

function renderConfirmDialog(isLoading: boolean) {
  return (
    <ConfirmDialog
      cancelLabel="Cancel"
      confirmLabel="Delete key"
      confirmPhrase="prod-router"
      description="This cannot be undone."
      destructive
      isLoading={isLoading}
      onConfirm={() => {}}
      onOpenChange={() => {}}
      open
      title="Delete API key"
    />
  )
}

describe('Dialog', () => {
  it('names the modal from its title and restores focus to the trigger on Escape', () => {
    render(<DialogHarness />)
    const trigger = screen.getByRole('button', { name: 'New API key' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'New API key' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('textbox', { name: 'Key name' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveAttribute('title', 'Close')
    expect(within(dialog).getByRole('button', { name: 'Create key' })).toBeInTheDocument()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('ConfirmDialog', () => {
  it('keeps confirm disabled until the phrase matches, then reports the busy state', () => {
    const { rerender } = render(renderConfirmDialog(false))

    const dialog = screen.getByRole('dialog', { name: 'Delete API key' })
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete key' })
    expect(confirmButton).toBeDisabled()
    expect(confirmButton).toHaveAttribute('aria-busy', 'false')

    const phraseInput = within(dialog).getByRole('textbox')
    expect(phraseInput).toHaveAccessibleName()
    fireEvent.change(phraseInput, { target: { value: 'prod-router' } })
    expect(confirmButton).toBeEnabled()

    rerender(renderConfirmDialog(true))
    const busyButton = screen.getByRole('button', { name: 'Delete key' })
    expect(busyButton).toHaveAttribute('aria-busy', 'true')
    expect(busyButton).toBeDisabled()
  })
})

describe('Drawer', () => {
  it('renders a labelled modal sheet with sections and switch rows', () => {
    render(
      <Drawer
        footer={<Button>Save</Button>}
        onOpenChange={() => {}}
        open
        side="right"
        title="Edit provider"
      >
        <Drawer.Section title="Routing">
          <Drawer.SwitchRow
            control={<input id="fallback" type="checkbox" />}
            controlId="fallback"
            description="Retry on the next provider."
            label="Automatic fallback"
          />
        </Drawer.Section>
      </Drawer>,
    )

    const drawer = screen.getByRole('dialog', { name: 'Edit provider' })
    expect(drawer).toHaveAttribute('aria-modal', 'true')
    expect(within(drawer).getByText('Routing')).toBeInTheDocument()
    expect(within(drawer).getByRole('checkbox', { name: 'Automatic fallback' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})
