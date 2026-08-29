// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  Alert,
  Avatar,
  CopyButton,
  DescriptionList,
  IconBadge,
  MaskedValue,
  PageHeader,
  Pagination,
  Panel,
  ProgressBar,
  SegmentedControl,
  Separator,
  Skeleton,
  Spinner,
  StatCard,
  StatusBadge,
  maskSecret,
  statusToTone,
} from '@/components/ui'

afterEach(cleanup)

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

describe('ui-display', () => {
  it('skeleton is decorative unless labelled', () => {
    const { container, rerender } = render(<Skeleton lines={3} variant="text" />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    rerender(<Skeleton label="Loading rows" lines={2} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading rows')
  })

  it('spinner announces through role=status', () => {
    render(<Spinner label="Loading" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('separator toggles between decorative and semantic', () => {
    const { container, rerender } = render(<Separator />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    rerender(<Separator decorative={false} orientation="vertical" />)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('alert dismiss keeps aria-label and title', () => {
    const onDismiss = vi.fn()
    render(
      <Alert dismissLabel="Dismiss notice" dismissible onDismiss={onDismiss} title="Heads up" tone="warning">
        Body copy
      </Alert>,
    )
    const button = screen.getByRole('button', { name: 'Dismiss notice' })
    expect(button).toHaveAttribute('title', 'Dismiss notice')
    fireEvent.click(button)
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Heads up')
  })

  it('maps new-api status codes to tones', () => {
    expect([1, 2, 3, 4, 9].map(statusToTone)).toEqual([
      'success',
      'muted',
      'warning',
      'destructive',
      'muted',
    ])
    render(<StatusBadge pulse tone="success">Enabled</StatusBadge>)
    expect(screen.getByText('Enabled')).toBeInTheDocument()
  })

  it('icon badge hides decorative icons and names meaningful ones', () => {
    const { rerender } = render(<IconBadge icon={<svg />} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    rerender(<IconBadge icon={<svg />} label="Wallet" />)
    expect(screen.getByRole('img', { name: 'Wallet' })).toBeInTheDocument()
  })

  it('progress bar emits full ARIA', () => {
    render(<ProgressBar label="Monthly spend" max={1000} showValue value={432} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '432')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '1000')
    expect(bar).toHaveAccessibleName('Monthly spend')
  })

  it('progress bar drops valuenow when indeterminate', () => {
    render(<ProgressBar indeterminate label="Syncing" value={0} />)
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  })

  it('stat card renders value, unit, delta and meter', () => {
    render(
      <StatCard
        delta={{ value: '+12.5%', direction: 'up', caption: 'vs last period' }}
        label="Total requests"
        meter={{ value: 43, max: 100 }}
        unit="ms"
        value="142"
      />,
    )
    expect(screen.getByText('Total requests')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Total requests')
  })

  it('segmented control uses aria-pressed inside a labelled group', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="Filter by status"
        onChange={onChange}
        options={[
          { id: 'all', label: 'All keys', count: 3 },
          { id: 'enabled', label: 'Enabled', count: 2 },
        ]}
        value="all"
      />,
    )
    const group = screen.getByRole('group', { name: 'Filter by status' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All keys/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Enabled/ }))
    expect(onChange).toHaveBeenCalledWith('enabled')
  })

  it('copy button reports clipboard failure', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('no')))
    render(<CopyButton label="Copy key" value="sk-live-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy key' }))
    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
  })

  it('copy button confirms success', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CopyButton label="Copy key" value="sk-live-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy key' }))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('masked value toggles uncontrolled and controlled', () => {
    expect(maskSecret('sk-live-abcdefghij')).toBe('sk-live••••••••ghij')
    const { rerender } = render(
      <MaskedValue hideLabel="Hide secret" showLabel="Show secret" value="sk-live-abcdefghij" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show secret' }))
    expect(screen.getByText('sk-live-abcdefghij')).toBeInTheDocument()

    const onToggle = vi.fn()
    rerender(
      <MaskedValue
        copyLabel="Copy secret"
        copyable
        hideLabel="Hide secret"
        onToggleVisibility={onToggle}
        showLabel="Show secret"
        value="sk-live-abcdefghij"
        visible={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show secret' }))
    expect(onToggle).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Copy secret' })).toBeInTheDocument()
  })

  it('avatar derives initials and a stable tone', () => {
    const { container } = render(<Avatar name="Ada Lovelace" />)
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveTextContent('AL')
    const first = container.firstElementChild?.className
    cleanup()
    const second = render(<Avatar name="Ada Lovelace" />).container.firstElementChild?.className
    expect(second).toBe(first)
  })

  it('description list renders dt/dd pairs', () => {
    render(
      <DescriptionList
        items={[{ term: 'Context window', description: '128K' }]}
        label="Model facts"
      />,
    )
    expect(screen.getByText('Context window').tagName).toBe('DT')
    expect(screen.getByText('128K').tagName).toBe('DD')
  })

  it('pagination marks the active page and moves pages', () => {
    const onPageChange = vi.fn()
    const onPageSizeChange = vi.fn()
    render(
      <Pagination
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        page={2}
        pageSize={10}
        total={95}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenCalledWith(3)
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toBeInTheDocument()
  })

  it('page header renders action and status together with tabs', () => {
    render(
      <PageHeader
        action={<button type="button">New key</button>}
        breadcrumb={<nav aria-label="Breadcrumb">Home</nav>}
        description="Keys and quotas."
        status={<span>Operational</span>}
        tabs={<div role="tablist" />}
        title="API keys"
      />,
    )
    expect(screen.getByRole('button', { name: 'New key' })).toBeInTheDocument()
    expect(screen.getByText('Operational')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('panel exposes header, body and footer slots', () => {
    render(
      <Panel>
        <Panel.Header actions={<button type="button">Create</button>} title="Active API keys" />
        <Panel.Body>Rows</Panel.Body>
        <Panel.Footer align="between">Footer</Panel.Footer>
      </Panel>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Active API keys' })).toBeInTheDocument()
    expect(screen.getByText('Rows')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
  })
})
