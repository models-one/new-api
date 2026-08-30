// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { delete: del, get, post, put } }))

const {
  ChannelAffinitySection,
  EmailSection,
  LogsSection,
  PriceSyncSection,
  RoutingReliabilitySection,
} = await import('@/features/system-settings/models-operations')

/**
 * WHAT THESE TESTS ARE FOR
 * ========================
 * Not markup. Four things that are genuinely easy to get wrong in this area, each of which
 * would ship a working-looking page that does the wrong thing:
 *
 *  1. THE STRING COERCION. Every one of the 234 values `GET /api/option/` returns is a
 *     string, and `'false'` is truthy. A switch bound to a raw value reads as ON for every
 *     disabled feature on the deployment. The seeded values below are copied verbatim from
 *     the dev server, so a regression here fails against real data.
 *  2. THE DESTRUCTIVE GATES. The log purge deletes billing history with no undo and no
 *     bound; the price sync rewrites live selling prices. Neither may reach the network
 *     without an explicit confirmation, and the purge's confirmation is phrase-gated on the
 *     cutoff because "before 2026" and "before 2025" look alike.
 *  3. THE PER-KEY REFUSAL. `PUT /api/option/` answers a refusal as HTTP 200 with
 *     `success:false`. A section that treats that as a success shows the operator a value
 *     the server does not hold.
 *  4. THE WRITE-ONLY SECRETS. `SMTPToken` is absent from the read payload, so an empty
 *     field means "keep what is stored". Whitespace must not slip through and blank it.
 */

/** Copied from `GET /api/option/` on the seeded dev server. Every value is a string. */
const seededOptions: Record<string, string> = {
  AutomaticDisableChannelEnabled: 'false',
  AutomaticDisableKeywords: 'Your credit balance is too low\nPermission denied',
  AutomaticDisableStatusCodes: '401',
  AutomaticEnableChannelEnabled: 'false',
  AutomaticRetryStatusCodes: '100-199,300-399,401-407,409-499,500-503,505-523,525-599',
  ChannelDisableThreshold: '5',
  'channel_affinity_setting.default_ttl_seconds': '3600',
  'channel_affinity_setting.enabled': 'true',
  'channel_affinity_setting.keep_on_channel_disabled': 'false',
  'channel_affinity_setting.max_entries': '100000',
  'channel_affinity_setting.rules': '[{"name":"codex cli trace","model_regex":["^gpt-.*$"]}]',
  'channel_affinity_setting.switch_on_success': 'true',
  LogConsumeEnabled: 'true',
  'monitor_setting.auto_test_channel_enabled': 'false',
  'monitor_setting.auto_test_channel_minutes': '10',
  'monitor_setting.channel_test_mode': 'scheduled_all',
  'price_sync_setting.apply_mode': 'decrease_only',
  'price_sync_setting.enabled': 'false',
  'price_sync_setting.exclude_models': 'deepseek-*',
  'price_sync_setting.interval_hours': '6',
  'price_sync_setting.min_source_models': '50',
  'price_sync_setting.only_known_models': 'true',
  'price_sync_setting.source_url': 'https://example.com/prices.json',
  RetryTimes: '0',
  SMTPAccount: '',
  SMTPForceAuthLogin: 'false',
  SMTPFrom: '',
  SMTPInsecureSkipVerify: 'false',
  SMTPPort: '587',
  SMTPServer: '',
  SMTPSSLEnabled: 'false',
  SMTPStartTLSEnabled: 'false',
}

type ServerState = {
  stored: Record<string, string>
  /** key → the sentence the server refuses that key with, as HTTP 200 `success:false`. */
  refuse: Record<string, string>
  affinityCacheFails: boolean
}

let server: ServerState

function renderSection(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function optionWrites() {
  return put.mock.calls
    .filter((call) => call[0] === '/api/option/')
    .map((call) => call[1] as { key: string; value: string })
}

/**
 * Every section disables its controls while `GET /api/option/` is in flight, and the
 * fallback a reader returns during that window can coincide with the stored value — so a
 * bare `findByRole` resolves against a control that is still disabled and a click on it
 * does nothing. Waiting for the enabled state is what "the section has loaded" means here.
 */
async function enabledSwitch(name: string) {
  const element = await screen.findByRole('switch', { name })
  await waitFor(() => expect(element).toBeEnabled())
  return element
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()

  server = { affinityCacheFails: false, refuse: {}, stored: { ...seededOptions } }

  get.mockImplementation((url: string) => {
    if (url === '/api/option/') {
      return Promise.resolve({
        data: {
          data: Object.entries(server.stored).map(([key, value]) => ({ key, value })),
          message: '',
          success: true,
        },
      })
    }
    if (url === '/api/status') {
      return Promise.resolve({
        data: { data: { quota_per_unit: 500_000, start_time: 1, version: 'v0.0.0' }, message: '', success: true },
      })
    }
    if (url === '/api/option/channel_affinity_cache') {
      if (server.affinityCacheFails) return Promise.reject(new Error('the cache is unreachable'))
      return Promise.resolve({
        data: {
          data: {
            by_rule_name: { 'codex cli trace': 4 },
            cache_algo: 'lru',
            cache_capacity: 100_000,
            enabled: true,
            total: 4,
            unknown: 0,
          },
          message: '',
          success: true,
        },
      })
    }
    if (url === '/api/system-task/list' || url === '/api/system-task/current') {
      return Promise.resolve({ data: { data: null, message: '', success: true } })
    }
    if (url === '/api/performance/logs') {
      return Promise.resolve({
        data: { data: { enabled: false, file_count: 0, log_dir: '', total_size: 0 }, message: '', success: true },
      })
    }
    throw new Error(`unmocked GET ${url}`)
  })

  put.mockImplementation((url: string, body: { key: string; value: string }) => {
    if (url !== '/api/option/') throw new Error(`unmocked PUT ${url}`)
    const refusal = server.refuse[body.key]
    // A refusal is HTTP 200 with success:false, NOT a 4xx — the shape the real server uses.
    if (refusal !== undefined) {
      return Promise.resolve({ data: { message: refusal, success: false } })
    }
    server.stored[body.key] = body.value
    return Promise.resolve({ data: { message: '', success: true } })
  })

  post.mockImplementation((url: string) => {
    if (url === '/api/system-task/log-cleanup' || url === '/api/system-task/price-sync') {
      return Promise.resolve({
        data: { data: { id: 1, status: 'pending', task_id: 't1', type: 'x' }, message: '', success: true },
      })
    }
    throw new Error(`unmocked POST ${url}`)
  })

  del.mockImplementation(() =>
    Promise.resolve({ data: { data: { deleted: 4 }, message: '', success: true } }),
  )
})

afterEach(cleanup)

describe('coercing the string-typed option payload', () => {
  it('reads the STRING “false” as off, not as a truthy string', async () => {
    renderSection(<RoutingReliabilitySection />)

    const autoDisable = await enabledSwitch('Let the gateway disable a failing channel')
    const autoEnable = screen.getByRole('switch', {
      name: 'Bring a channel back after a successful test',
    })

    // Both arrive as the string 'false'. Branching on the raw value would show them ON.
    expect(autoDisable).toHaveAttribute('aria-checked', 'false')
    expect(autoEnable).toHaveAttribute('aria-checked', 'false')
  })

  it('reads the string “true” as on and a numeric string as a number', async () => {
    renderSection(<PriceSyncSection />)

    expect(await enabledSwitch('Only update models this site already prices')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('spinbutton', { name: 'Sync interval (hours)' })).toHaveValue(6)
    expect(screen.getByRole('spinbutton', { name: 'Reject a source with fewer models than' })).toHaveValue(50)
  })

  it('shows the auto-disable warning only when nothing can re-enable a channel', async () => {
    renderSection(<RoutingReliabilitySection />)

    const autoDisable = await enabledSwitch('Let the gateway disable a failing channel')
    // Auto-disable is off in the seeded data, so there is nothing to warn about yet.
    expect(
      screen.queryByText('Auto-disable is on and nothing re-enables a channel'),
    ).not.toBeInTheDocument()

    fireEvent.click(autoDisable)

    expect(
      await screen.findByText('Auto-disable is on and nothing re-enables a channel'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Bring a channel back after a successful test' }))

    await waitFor(() =>
      expect(
        screen.queryByText('Auto-disable is on and nothing re-enables a channel'),
      ).not.toBeInTheDocument(),
    )
  })
})

describe('writing one key at a time', () => {
  it('writes only the keys the operator actually changed', async () => {
    renderSection(<RoutingReliabilitySection />)

    const retries = await screen.findByRole('spinbutton', { name: 'Retry attempts' })
    fireEvent.change(retries, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(optionWrites()).toHaveLength(1))
    expect(optionWrites()[0]).toEqual({ key: 'RetryTimes', value: '3' })
  })

  it('refuses to write a status-code rule the server would reject, and names the bad token', async () => {
    renderSection(<RoutingReliabilitySection />)

    const codes = await screen.findByRole('textbox', { name: 'Status codes that disable a channel' })
    fireEvent.change(codes, { target: { value: '401, 999-abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Not a status code or range: 999-abc')).toBeInTheDocument()
    // Nothing reached the network: the parse matches the server's own and caught it first.
    expect(optionWrites()).toHaveLength(0)
  })

  it('keeps a refused key dirty and quotes the server rather than claiming success', async () => {
    server.refuse.ChannelDisableThreshold = 'threshold rejected by policy'
    renderSection(<RoutingReliabilitySection />)

    const threshold = await screen.findByRole('spinbutton', {
      name: 'Disable a channel slower than (seconds)',
    })
    fireEvent.change(threshold, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText(/threshold rejected by policy/)).toBeInTheDocument()
    // The operator's value is kept so a second Save retries it, and the store is unchanged.
    expect(threshold).toHaveValue(12)
    expect(server.stored.ChannelDisableThreshold).toBe('5')
  })
})

describe('the log purge, which deletes billing history irreversibly', () => {
  it('never starts a purge from the page button alone', async () => {
    renderSection(<LogsSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Purge log history' }))

    // The button opens the confirmation. It must not have started anything.
    expect(post).not.toHaveBeenCalled()
    expect(await screen.findByText('Permanently delete log history?')).toBeInTheDocument()
  })

  it('holds the confirmation shut until the cutoff itself is typed back', async () => {
    renderSection(<LogsSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Purge log history' }))
    await screen.findByText('Permanently delete log history?')

    const confirm = screen.getByRole('button', { name: 'Delete these log rows' })
    expect(confirm).toBeDisabled()

    const gate = screen.getByRole('textbox', { name: /Type the cutoff back to confirm/ })
    fireEvent.change(gate, { target: { value: 'yes' } })
    expect(screen.getByRole('button', { name: 'Delete these log rows' })).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses a cutoff in the future, which would delete the entire log', async () => {
    renderSection(<LogsSection />)

    const cutoff = await screen.findByLabelText('Delete log rows older than')
    fireEvent.change(cutoff, { target: { value: '2099-01-01T00:00' } })

    expect(
      await screen.findByText('That is in the future — it would delete the entire log.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Purge log history' })).toBeDisabled()
  })

  it('commits the consumption-log switch on the toggle, without a Save button', async () => {
    renderSection(<LogsSection />)

    const logging = await enabledSwitch('Record a log row for every request')
    expect(logging).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(logging)

    await waitFor(() => expect(optionWrites()).toHaveLength(1))
    expect(optionWrites()[0]).toEqual({ key: 'LogConsumeEnabled', value: 'false' })
  })
})

describe('the price sync apply mode, which decides what a run may overwrite', () => {
  it('does not offer a writing run while the mode is report-only', async () => {
    renderSection(<PriceSyncSection />)

    const mode = await screen.findByRole('combobox', { name: 'What a run is allowed to write' })
    fireEvent.change(mode, { target: { value: 'dry_run' } })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sync and write prices' })).toBeDisabled(),
    )
  })

  it('warns before a run that is allowed to raise prices', async () => {
    renderSection(<PriceSyncSection />)

    const mode = await screen.findByRole('combobox', { name: 'What a run is allowed to write' })
    fireEvent.change(mode, { target: { value: 'all' } })

    expect(
      await screen.findByText('This mode can raise prices without review'),
    ).toBeInTheDocument()
  })

  it('blocks a run while the form holds unsaved edits, because a run uses the stored settings', async () => {
    renderSection(<PriceSyncSection />)

    const interval = await screen.findByRole('spinbutton', { name: 'Sync interval (hours)' })
    fireEvent.change(interval, { target: { value: '12' } })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Preview without writing' })).toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: 'Sync and write prices' })).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })

  it('starts a dry run through the preview button and never writes a price', async () => {
    renderSection(<PriceSyncSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Preview without writing' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][0]).toBe('/api/system-task/price-sync')
    expect(post.mock.calls[0][2]).toMatchObject({ params: { dry_run: true } })
  })
})

describe('the affinity rule list, which the server does not validate', () => {
  it('blocks a malformed rule list the server would accept and silently break on', async () => {
    renderSection(<ChannelAffinitySection />)

    const rules = await screen.findByRole('textbox', { name: 'Affinity rules' })
    fireEvent.change(rules, { target: { value: 'not json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('This is not valid JSON.')).toBeInTheDocument()
    expect(optionWrites()).toHaveLength(0)
  })

  it('blocks two rules sharing a name, because the cache is keyed by it', async () => {
    renderSection(<ChannelAffinitySection />)

    const rules = await screen.findByRole('textbox', { name: 'Affinity rules' })
    fireEvent.change(rules, { target: { value: '[{"name":"a"},{"name":"a"}]' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'Two rules share the same "name". Cache entries are keyed by rule name, so the names must be unique.',
      ),
    ).toBeInTheDocument()
    expect(optionWrites()).toHaveLength(0)
  })

  it('reports an unreadable cache instead of rendering it as an empty one', async () => {
    server.affinityCacheFails = true
    renderSection(<ChannelAffinitySection />)

    expect(await screen.findByText('The affinity cache could not be read')).toBeInTheDocument()
    expect(screen.queryByText('No affinity rules')).not.toBeInTheDocument()
  })
})

describe('the write-only SMTP password', () => {
  it('opens empty and never claims the stored password is unset', async () => {
    renderSection(<EmailSection />)

    expect(await screen.findByLabelText('SMTP password or token')).toHaveValue('')
    expect(screen.getByText('The password is write-only')).toBeInTheDocument()
  })

  it('refuses a whitespace-only entry, which would blank the stored credential', async () => {
    renderSection(<EmailSection />)

    const password = await screen.findByLabelText('SMTP password or token')
    fireEvent.change(password, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('That is only whitespace. Clear the field to keep the stored value.'),
    ).toBeInTheDocument()
    expect(optionWrites()).toHaveLength(0)
  })

  it('writes the trimmed password when a real one is typed', async () => {
    renderSection(<EmailSection />)

    const password = await screen.findByLabelText('SMTP password or token')
    fireEvent.change(password, { target: { value: '  s3cret  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(optionWrites()).toHaveLength(1))
    expect(optionWrites()[0]).toEqual({ key: 'SMTPToken', value: 's3cret' })
  })
})
