import { describe, expect, it } from 'vitest'

import { isUsableChatTemplate } from '@/features/system-settings/site-content/chat-template'

/**
 * The editor must not be able to save a preset `/chat/$chatId` will refuse to open. These
 * cases are the seeded `Chats` list from the dev server plus the one template shape the
 * consumer rejects on security grounds.
 */

describe('isUsableChatTemplate', () => {
  it('accepts the http templates that ship with the deployment', () => {
    expect(isUsableChatTemplate('https://chat-preview.lobehub.com/?settings={"keyVaults":{"openai":{"apiKey":"{key}","baseURL":"{address}/v1"}}}')).toBe(true)
    expect(isUsableChatTemplate('https://aiaw.app/set-provider?provider={"type":"openai","settings":{"apiKey":"{key}"}}')).toBe(true)
  })

  it('accepts the non-web presets the console hands to the user instead of opening', () => {
    expect(isUsableChatTemplate('cherrystudio://providers/api-keys?v=1&data={cherryConfig}')).toBe(true)
    expect(isUsableChatTemplate('fluentread')).toBe(true)
    expect(isUsableChatTemplate('ama://set-api-key?server={address}&key={key}')).toBe(true)
  })

  it('refuses a template whose host is assembled from the user’s API key', () => {
    // The gateway stores this happily; the chat page refuses to open it, so saving it
    // would produce a preset that only ever shows users an error.
    expect(isUsableChatTemplate('https://{key}.example.com/')).toBe(false)
    expect(isUsableChatTemplate('https://{address}/chat')).toBe(false)
  })

  it('refuses an empty template', () => {
    expect(isUsableChatTemplate('')).toBe(false)
    expect(isUsableChatTemplate('   ')).toBe(false)
  })
})
