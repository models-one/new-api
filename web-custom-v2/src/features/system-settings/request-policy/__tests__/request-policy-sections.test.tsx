// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const patch = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { delete: del, get, patch, post, put } }))

const { ChannelHealthSection } = await import('@/features/system-settings/request-policy/ChannelHealthSection')
const { SessionsRetriesSection } = await import('@/features/system-settings/request-policy/SessionsRetriesSection')

/**
 * The request policy is read from `GET /api/option/request_policy` (every value a string,
 * defaults filled in) and saved with one `PATCH` of the changed keys, which the server
 * validates as a whole. These values are the seeded server's.
 */
const seededPolicy: Record<string, string> = {
  AutomaticDisableChannelEnabled: 'false',
  AutomaticDisableKeywords: 'Your credit balance is too low\nPermission denied',
  AutomaticDisableStatusCodes: '401',
  AutomaticEnableChannelEnabled: 'false',
  AutomaticRetryStatusCodes: '100-199,300-399,401-407,409-499,500-503,505-523,525-599',
  ChannelDisableThreshold: '5',
  RetryTimes: '0',
  'channel_affinity_setting.default_ttl_seconds': '3600',
  'channel_affinity_setting.enabled': 'true',
  'channel_affinity_setting.keep_on_channel_disabled': 'false',
  'channel_affinity_setting.max_entries': '100000',
  'channel_affinity_setting.rules':
    '[{"name":"codex cli trace","model_regex":["^gpt-.*$"],"path_regex":["/v1/responses"],"key_sources":[{"type":"gjson","path":"prompt_cache_key"}],"value_regex":"","ttl_seconds":0,"param_override_template":{"operations":[]},"skip_retry_on_failure":false,"include_using_group":true,"include_model_name":false,"include_rule_name":true}]',
  'channel_affinity_setting.session_mode': '',
  'channel_affinity_setting.switch_on_success': 'true',
  'monitor_setting.auto_test_channel_enabled': 'false',
  'monitor_setting.auto_test_channel_minutes': '10',
  'monitor_setting.channel_test_concurrency': '1',
  'monitor_setting.channel_test_mode': 'scheduled_all',
}

type Server = { policy: Record<string, string>; refuse: string | null; cacheFails: boolean }
let server: Server

function renderSection(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function policyWrites(): Record<string, string>[] {
  return patch.mock.calls.filter((call) => call[0] === '/api/option/request_policy').map((call) => (call[1] as { options: Record<string, string> }).options)
}

async function save() {
  fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
}

beforeEach(() => {
  server = { cacheFails: false, policy: { ...seededPolicy }, refuse: null }
  for (const mock of [get, post, put, patch, del]) mock.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/option/request_policy') return Promise.resolve({ data: { data: { options: server.policy }, message: '', success: true } })
    if (url === '/api/option/') return Promise.resolve({ data: { data: [], message: '', success: true } })
    if (url === '/api/status') return Promise.resolve({ data: { data: { quota_per_unit: 500_000 }, message: '', success: true } })
    if (url === '/api/option/channel_affinity_cache') {
      if (server.cacheFails) return Promise.reject(new Error('the cache is unreachable'))
      return Promise.resolve({
        data: { data: { by_rule_name: { 'codex cli trace': 4 }, cache_algo: 'lru', cache_capacity: 100_000, enabled: true, total: 4, unknown: 0 }, message: '', success: true },
      })
    }
    throw new Error(`unmocked GET ${url}`)
  })
  patch.mockImplementation((url: string, body: { options: Record<string, string> }) => {
    if (url !== '/api/option/request_policy') throw new Error(`unmocked PATCH ${url}`)
    // The real server answers 400 and writes nothing when the resulting policy is invalid.
    if (server.refuse !== null) return Promise.resolve({ data: { message: server.refuse, success: false } })
    Object.assign(server.policy, body.options)
    return Promise.resolve({ data: { data: { options: server.policy }, message: '', success: true } })
  })
  put.mockImplementation((url: string) => {
    throw new Error(`a request policy key must not be written one at a time: PUT ${url}`)
  })
})

afterEach(cleanup)

describe('Channel health', () => {
  it('reads the string “false” as off and warns only when nothing re-enables a channel', async () => {
    renderSection(<ChannelHealthSection />)
    const autoDisable = await screen.findByRole('switch', { name: 'Let the gateway disable a failing channel' })
    await waitFor(() => expect(autoDisable).toBeEnabled())
    expect(autoDisable).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText('Auto-disable is on and nothing re-enables a channel')).not.toBeInTheDocument()

    fireEvent.click(autoDisable)
    expect(await screen.findByText('Auto-disable is on and nothing re-enables a channel')).toBeInTheDocument()
  })

  it('saves every changed key in one validated request', async () => {
    renderSection(<ChannelHealthSection />)
    const threshold = await screen.findByRole('spinbutton', { name: 'Disable a channel slower than (seconds)' })
    await waitFor(() => expect(threshold).toBeEnabled())

    fireEvent.change(threshold, { target: { value: '12' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Channels tested at once' }), { target: { value: '4' } })
    await save()

    await waitFor(() => expect(policyWrites()).toHaveLength(1))
    expect(policyWrites()[0]).toEqual({ ChannelDisableThreshold: '12', 'monitor_setting.channel_test_concurrency': '4' })
  })

  it('refuses a status-code rule or concurrency the server would reject, before sending', async () => {
    renderSection(<ChannelHealthSection />)
    const codes = await screen.findByRole('textbox', { name: 'Status codes that disable a channel' })
    await waitFor(() => expect(codes).toBeEnabled())

    fireEvent.change(codes, { target: { value: '401, 999-abc' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Channels tested at once' }), { target: { value: '64' } })
    await save()

    expect(await screen.findByText('Not a status code or range: 999-abc')).toBeInTheDocument()
    expect(screen.getAllByText('Enter a whole number between 1 and 32.').length).toBeGreaterThan(0)
    expect(policyWrites()).toHaveLength(0)
  })

  it('quotes the server’s refusal and keeps the value', async () => {
    server.refuse = 'invalid numeric value: ChannelDisableThreshold'
    renderSection(<ChannelHealthSection />)
    const threshold = await screen.findByRole('spinbutton', { name: 'Disable a channel slower than (seconds)' })
    await waitFor(() => expect(threshold).toBeEnabled())

    fireEvent.change(threshold, { target: { value: '12' } })
    await save()

    expect(await screen.findByText(/invalid numeric value: ChannelDisableThreshold/)).toBeInTheDocument()
    // One request for the whole policy: a refusal means nothing was saved.
    expect(screen.getByText(/These settings are saved together, so none of them were saved/)).toBeInTheDocument()
    expect(threshold).toHaveValue(12)
    expect(server.policy.ChannelDisableThreshold).toBe('5')
  })
})

describe('Sessions and retries', () => {
  async function ready() {
    renderSection(<SessionsRetriesSection />)
    const retries = await screen.findByRole('spinbutton', { name: 'Retry attempts' })
    await waitFor(() => expect(retries).toBeEnabled())
    return retries
  }

  it('saves retries and the global session mode together', async () => {
    const retries = await ready()
    fireEvent.change(retries, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('radio', { name: /^Strict/ }))
    await save()

    await waitFor(() => expect(policyWrites()).toHaveLength(1))
    expect(policyWrites()[0]).toEqual({ RetryTimes: '3', 'channel_affinity_setting.session_mode': 'strict' })
  })

  it('edits a rule in a dialog and keeps the fields the dialog does not show', async () => {
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Edit rule codex cli trace' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/param_override_template/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('radio', { name: /^Strict/ }))
    fireEvent.change(within(dialog).getByLabelText('Lifetime (seconds)'), { target: { value: '600' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await save()

    await waitFor(() => expect(policyWrites()).toHaveLength(1))
    const [rule] = JSON.parse(policyWrites()[0]['channel_affinity_setting.rules']) as Array<Record<string, unknown>>
    expect(rule).toMatchObject({
      key_sources: [{ path: 'prompt_cache_key', type: 'gjson' }],
      name: 'codex cli trace',
      param_override_template: { operations: [] },
      session_mode: 'strict',
      ttl_seconds: 600,
    })
  })

  it('adds a rule, and refuses one without a name or key source', async () => {
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add rule' }))
    expect(within(dialog).getByText('Every rule needs a name.')).toBeInTheDocument()
    expect(within(dialog).getByText('Add at least one key source, each with its header, path or key.')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText(/^Rule name/), { target: { value: 'codex cli trace' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add rule' }))
    expect(within(dialog).getByText(/Another rule already has this name/)).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText(/^Rule name/), { target: { value: 'claude session' } })
    fireEvent.change(within(dialog).getByLabelText('Key of key source 1'), { target: { value: 'x-claude-session' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add rule' }))
    await save()

    await waitFor(() => expect(policyWrites()).toHaveLength(1))
    const rules = JSON.parse(policyWrites()[0]['channel_affinity_setting.rules']) as Array<Record<string, unknown>>
    expect(rules.map((rule) => rule.name)).toEqual(['codex cli trace', 'claude session'])
    expect(rules[1]).toMatchObject({ key_sources: [{ key: 'x-claude-session', type: 'request_header' }], session_mode: 'inherit' })
  })

  it('blocks a malformed rule list typed as JSON', async () => {
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Edit as JSON' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Affinity rules' }), { target: { value: 'not json' } })
    await save()

    expect((await screen.findAllByText('This is not valid JSON.')).length).toBeGreaterThan(0)
    expect(policyWrites()).toHaveLength(0)
  })

  it('keeps the rules editable when the live cache cannot be read', async () => {
    server.cacheFails = true
    await ready()

    expect(await screen.findByText('The affinity cache could not be read')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit rule codex cli trace' })).toBeEnabled()
  })
})
