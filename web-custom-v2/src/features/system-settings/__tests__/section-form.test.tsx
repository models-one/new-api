// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, delete: del } }))

const { Input, NumberInput } = await import('@/components/form')
const { SettingsSection } = await import('@/features/system-settings/components/SettingsSection')
const { readOptionBoolean, readOptionNumber, readOptionString, systemOptionsQuery } = await import(
  '@/features/system-settings/options-store'
)
const { useOptionSectionForm } = await import('@/features/system-settings/section-form')

type Draft = {
  Footer: string
  RetryTimes: number
  SelfUseModeEnabled: boolean
  ServerAddress: string
  SystemName: string
}

/** The live values these five keys hold on the seeded dev server. */
let stored: Record<string, string>
/** Keys the fake server refuses, mapped to the sentence it refuses them with. */
let refuse: Record<string, string>

function optionPayload() {
  return {
    data: {
      data: Object.entries(stored).map(([key, value]) => ({ key, value })),
      message: '',
      success: true,
    },
  }
}

function Harness() {
  const optionsQuery = useQuery(systemOptionsQuery())
  const options = optionsQuery.data

  const form = useOptionSectionForm<Draft>({
    saved: {
      Footer: readOptionString(options, 'Footer'),
      RetryTimes: readOptionNumber(options, 'RetryTimes'),
      SelfUseModeEnabled: readOptionBoolean(options, 'SelfUseModeEnabled'),
      ServerAddress: readOptionString(options, 'ServerAddress'),
      SystemName: readOptionString(options, 'SystemName'),
    },
    serialize: { ServerAddress: (value) => String(value).trim().replace(/\/+$/, '') },
    validate: (values) =>
      values.SystemName.trim() === '' ? { SystemName: 'A system name is required.' } : {},
  })

  return (
    <SettingsSection
      description="Harness section"
      form={form}
      saveMode="section"
      title="Harness"
    >
      <Input
        error={form.errors.SystemName}
        label="System name"
        onChange={(event) => form.setField('SystemName', event.target.value)}
        value={form.values.SystemName}
      />
      <Input
        label="Server address"
        onChange={(event) => form.setField('ServerAddress', event.target.value)}
        value={form.values.ServerAddress}
      />
      <Input
        label="Footer"
        onChange={(event) => form.setField('Footer', event.target.value)}
        value={form.values.Footer}
      />
      <NumberInput
        error={form.errors.RetryTimes}
        label="Retry times"
        onValueChange={(value) => form.setField('RetryTimes', value ?? Number.NaN)}
        value={Number.isFinite(form.values.RetryTimes) ? form.values.RetryTimes : ''}
      />
      <button
        onClick={() => form.commitField('SelfUseModeEnabled', !form.values.SelfUseModeEnabled)}
        type="button"
      >
        toggle self use
      </button>
    </SettingsSection>
  )
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<Harness />, { wrapper })
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

/** Every `{key,value}` body handed to `PUT /api/option/`, in call order. */
function writes(): { key: string; value: string }[] {
  return put.mock.calls.map((call) => call[1] as { key: string; value: string })
}

beforeEach(() => {
  stored = {
    Footer: '',
    RetryTimes: '0',
    SelfUseModeEnabled: 'false',
    ServerAddress: '',
    SystemName: 'New API',
  }
  refuse = {}

  get.mockReset()
  put.mockReset()
  post.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/option/') return Promise.resolve(optionPayload())
    if (url === '/api/status') {
      return Promise.resolve({ data: { data: { quota_per_unit: 500_000 }, message: '', success: true } })
    }
    throw new Error(`unmocked GET ${url}`)
  })

  put.mockImplementation((url: string, body: { key: string; value: string }) => {
    if (url !== '/api/option/') throw new Error(`unmocked PUT ${url}`)
    const refusal = refuse[body.key]
    if (refusal !== undefined) {
      // A refusal is HTTP 200 with success:false — verified on the dev server.
      return Promise.resolve({ data: { message: refusal, success: false } })
    }
    stored[body.key] = body.value
    return Promise.resolve({ data: { message: '', success: true } })
  })
})

afterEach(cleanup)

describe('dirty tracking', () => {
  it('starts clean and disables both footer controls', async () => {
    renderHarness()

    expect(await screen.findByDisplayValue('New API')).toBeInTheDocument()
    expect(screen.getByText('No unsaved changes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
  })

  it('counts only the fields whose value actually differs from the server', async () => {
    renderHarness()
    await screen.findByDisplayValue('New API')

    type('System name', 'Acme AI')
    expect(await screen.findByText('1 setting change(s) not saved yet.')).toBeInTheDocument()

    type('Footer', '© Acme')
    expect(await screen.findByText('2 setting change(s) not saved yet.')).toBeInTheDocument()

    // Typing a value back to what the server holds clears it again.
    type('System name', 'New API')
    expect(await screen.findByText('1 setting change(s) not saved yet.')).toBeInTheDocument()
  })

  it('discards every edit without contacting the server', async () => {
    renderHarness()
    await screen.findByDisplayValue('New API')

    type('System name', 'Acme AI')
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

    expect(await screen.findByDisplayValue('New API')).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })
})

describe('the section save', () => {
  it('writes one key per request, and only the dirty ones', async () => {
    renderHarness()
    await screen.findByDisplayValue('New API')

    type('System name', 'Acme AI')
    type('Footer', '© Acme')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(2))
    expect(writes()).toEqual([
      { key: 'Footer', value: '© Acme' },
      { key: 'SystemName', value: 'Acme AI' },
    ])
    expect(put.mock.calls[0][0]).toBe('/api/option/')
  })

  it('applies the per-key serializer on the way out and leaves the field alone', async () => {
    renderHarness()
    await screen.findByDisplayValue('New API')

    type('Server address', '  https://example.com//  ')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(writes()[0]).toEqual({ key: 'ServerAddress', value: 'https://example.com' })
  })

  it('re-reads the option store once the run is done', async () => {
    renderHarness()
    await screen.findByDisplayValue('New API')
    const readsBefore = get.mock.calls.filter((call) => call[0] === '/api/option/').length

    type('System name', 'Acme AI')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      const readsAfter = get.mock.calls.filter((call) => call[0] === '/api/option/').length
      expect(readsAfter).toBeGreaterThan(readsBefore)
    })
    expect(await screen.findByText('No unsaved changes.')).toBeInTheDocument()
  })

  it('serialises a boolean as the string the server stores', async () => {
    renderHarness()
    await screen.findByDisplayValue('New API')

    fireEvent.click(screen.getByRole('button', { name: 'toggle self use' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(writes()[0]).toEqual({ key: 'SelfUseModeEnabled', value: 'true' })
  })
})

describe('partial failure', () => {
  it('does not abort: the refused key is named, the rest are saved and stay saved', async () => {
    refuse.ServerAddress = 'Server address is not acceptable'
    renderHarness()
    await screen.findByDisplayValue('New API')

    type('Footer', '© Acme')
    type('Server address', 'https://example.com')
    type('System name', 'Acme AI')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    // All three were attempted — the refusal in the middle stopped nothing.
    await waitFor(() => expect(put).toHaveBeenCalledTimes(3))
    expect(writes().map((write) => write.key)).toEqual(['Footer', 'ServerAddress', 'SystemName'])
    expect(stored.Footer).toBe('© Acme')
    expect(stored.SystemName).toBe('Acme AI')
    expect(stored.ServerAddress).toBe('')

    const alert = await screen.findByText('The server refused some of these settings')
    expect(alert).toBeInTheDocument()
    expect(screen.getByText('Server address is not acceptable')).toBeInTheDocument()
    expect(screen.getByText('ServerAddress')).toBeInTheDocument()
  })

  it('leaves only the refused key dirty, so a retry re-sends just that one', async () => {
    refuse.ServerAddress = 'Server address is not acceptable'
    renderHarness()
    await screen.findByDisplayValue('New API')

    type('Footer', '© Acme')
    type('Server address', 'https://example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('1 setting change(s) not saved yet.')).toBeInTheDocument()
    expect(screen.getByLabelText('Server address')).toHaveValue('https://example.com')

    put.mockClear()
    delete refuse.ServerAddress
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(writes()[0].key).toBe('ServerAddress')
    expect(await screen.findByText('No unsaved changes.')).toBeInTheDocument()
  })

  it('lets the operator dismiss the refusal notice', async () => {
    refuse.SystemName = 'nope'
    renderHarness()
    await screen.findByDisplayValue('New API')

    type('System name', 'Acme AI')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByText('The server refused some of these settings')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the refusal notice' }))

    await waitFor(() =>
      expect(screen.queryByText('The server refused some of these settings')).not.toBeInTheDocument(),
    )
  })
})

describe('the per-field save path', () => {
  it('writes the one key immediately and never touches the others', async () => {
    renderHarness()
    await screen.findByDisplayValue('New API')

    type('Footer', '© Acme')
    fireEvent.click(screen.getByRole('button', { name: 'toggle self use' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(writes()[0]).toEqual({ key: 'SelfUseModeEnabled', value: 'true' })
    // The unrelated edit is untouched and still dirty.
    expect(await screen.findByText('1 setting change(s) not saved yet.')).toBeInTheDocument()
  })

  it('reverts the control to the server value when the write is refused', async () => {
    refuse.SelfUseModeEnabled = 'Self-use mode cannot be enabled here'
    renderHarness()
    await screen.findByDisplayValue('New API')

    fireEvent.click(screen.getByRole('button', { name: 'toggle self use' }))

    expect(await screen.findByText('Self-use mode cannot be enabled here')).toBeInTheDocument()
    expect(stored.SelfUseModeEnabled).toBe('false')
    // A per-field commit has no Save button to retry with, so a refused value must not be
    // left on screen looking committed — the overlay entry is dropped and nothing is dirty.
    expect(await screen.findByText('No unsaved changes.')).toBeInTheDocument()
  })
})

describe('validation', () => {
  it('blocks the save and sends nothing when a required field is emptied', async () => {
    renderHarness()
    await screen.findByDisplayValue('New API')

    type('System name', '   ')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('A system name is required.')).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })

  it('never sends the literal text NaN for a cleared number field', async () => {
    renderHarness()
    await screen.findByDisplayValue('New API')

    fireEvent.change(screen.getByLabelText('Retry times'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Enter a number.')).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })

  it('saves once the number is valid again', async () => {
    renderHarness()
    await screen.findByDisplayValue('New API')

    fireEvent.change(screen.getByLabelText('Retry times'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Retry times'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(writes()[0]).toEqual({ key: 'RetryTimes', value: '3' })
  })

  it('does not open with an error against a value the server already holds', async () => {
    stored.SystemName = ''
    renderHarness()

    await screen.findByLabelText('Footer')
    expect(screen.queryByText('A system name is required.')).not.toBeInTheDocument()
  })
})

describe('background refetches', () => {
  it('never clobbers a field the operator is editing', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    render(<Harness />, { wrapper })
    await screen.findByDisplayValue('New API')

    type('System name', 'Acme AI')

    // Somebody else changes two keys and the store is re-read underneath the form.
    stored.SystemName = 'Third Party'
    stored.Footer = '© Somebody else'
    await client.invalidateQueries({ queryKey: ['system-settings', 'options'] })

    // The edited field keeps the operator's text; the untouched one takes the new value.
    expect(await screen.findByDisplayValue('© Somebody else')).toBeInTheDocument()
    expect(screen.getByLabelText('System name')).toHaveValue('Acme AI')
  })
})
