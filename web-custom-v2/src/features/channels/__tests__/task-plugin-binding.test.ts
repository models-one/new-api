// @vitest-environment happy-dom

import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get } }))

const { taskPluginOptionsQuery } = await import('@/features/channels/task-plugin-binding')

const option = (key: string, parts: { task?: boolean; provider?: boolean; transform?: boolean }) => ({
  key,
  name: key,
  models: [],
  ...parts,
})

beforeEach(() => get.mockReset())

describe('taskPluginOptionsQuery', () => {
  it('offers task and provider plugins for binding, but not request-processing-only ones', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [
          option('video', { task: true, provider: false, transform: false }),
          option('vendor', { task: false, provider: true, transform: false }),
          option('both', { task: true, provider: true, transform: true }),
          option('rewrite-only', { task: false, provider: false, transform: true }),
          // A server that predates plugin parts sends neither flag; it can only hold task plugins.
          option('legacy', {}),
        ],
      },
    })

    const options = await new QueryClient().fetchQuery(taskPluginOptionsQuery())

    expect(options.map((item) => item.key)).toEqual(['video', 'vendor', 'both', 'legacy'])
  })
})
