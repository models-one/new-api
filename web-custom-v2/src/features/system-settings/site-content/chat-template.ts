import { buildChatUrl, detectChatPresetKind } from '@/features/chat/chat-presets'

/**
 * The one rule this editor enforces on a chat preset that the server does not.
 *
 * `Chats` is the list `/chat/$chatId` reads, and `@/features/chat/chat-presets` is what
 * reads it. That module refuses to open a preset whose RESOLVED origin differs from the
 * origin the operator wrote — because `https://{key}.example.com/` would exfiltrate the
 * signed-in user's API key as a DNS lookup the moment anybody clicked it. The gateway
 * accepts such a template happily: `model.UpdateOption` only unmarshals `Chats` into
 * `[]map[string]string`, so any string is stored.
 *
 * That leaves a hole the editor has to close. Without this check an operator could save a
 * preset that looks fine in the table, and every user who tried it would get a refusal
 * page instead of a chat client, with nothing anywhere explaining why.
 *
 * The check is `buildChatUrl` itself, run against probe values, so it can never drift from
 * what the consumer does — a template this accepts is a template that page will open.
 * Non-web templates (`cherrystudio://`, `fluentread`, `ccswitch`) are left alone: the
 * console does not open them at all, it hands the user a copyable link, and four of the
 * nine presets on a stock deployment are of that kind.
 */
export function isUsableChatTemplate(template: string): boolean {
  if (template.trim() === '') return false
  if (detectChatPresetKind(template) !== 'web') return true

  return buildChatUrl({
    // Probe values only: they never leave this function. The key is `[A-Za-z0-9]`, like a
    // real one, and the address is a host that cannot resolve — what matters is only
    // whether substituting them moves the origin.
    apiKey: 'probe0000000000000000000000000000',
    serverAddress: 'https://probe.invalid',
    template,
  }).ok
}
