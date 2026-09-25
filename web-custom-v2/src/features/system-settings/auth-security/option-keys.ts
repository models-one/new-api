/**
 * THE WRITE-ONLY OPTION KEYS
 * ==========================
 * `controller.GetOptions` does not mask secrets — it OMITS them:
 *
 *   isSensitiveKey := strings.HasSuffix(k, "Token") ||
 *       strings.HasSuffix(k, "Secret") || strings.HasSuffix(k, "Key") ||
 *       strings.HasSuffix(k, "secret") || strings.HasSuffix(k, "api_key")
 *   if isSensitiveKey { continue }
 *
 * so `GET /api/option/` never carries them at all. Verified live: `GitHubClientSecret`,
 * `TurnstileSiteKey`, `TurnstileSecretKey`, `TelegramBotToken`, `WeChatServerToken`,
 * `oidc.client_secret`, `discord.client_secret` and `LinuxDOClientSecret` are absent from
 * the 231-pair payload even though every one of them is a real, writable option.
 *
 * Consequences a control MUST respect:
 *   - The console cannot tell a stored secret from an unset one. It must never claim the
 *     value is empty, and it must never render a "current value" for one.
 *   - An untouched field is therefore NOT dirty and is NOT written, so saving the rest of
 *     a section can never blank a stored secret. (`useOptionSectionForm` writes dirty keys
 *     only; the read-back for these keys is always `''`, which equals the draft's `''`.)
 *   - After a successful write the field goes blank again, because the re-read still has
 *     no value for it. That is correct, and the sections say so.
 *   - Clearing a field that the operator has typed into DOES write `''` and DOES blank the
 *     stored secret. That is the only way to remove one, and it is spelled out in the UI.
 *
 * `TurnstileSiteKey` is the sharp edge: it is a PUBLIC value, but it ends in `Key`, so the
 * suffix rule hides it like a secret. An operator cannot read back the site key they set.
 */

/** Mirrors `controller.GetOptions`'s suffix rule exactly. */
export function isWriteOnlyOptionKey(key: string): boolean {
  return (
    key.endsWith('Token') ||
    key.endsWith('Secret') ||
    key.endsWith('Key') ||
    key.endsWith('secret') ||
    key.endsWith('api_key')
  )
}

/**
 * Every write-only key this feature offers a control for. Kept as a list so the test can
 * assert that each one really is filtered by the server's rule — a key added here that the
 * server would happily return should be shown normally instead.
 */
export const WRITE_ONLY_AUTH_KEYS = [
  'GitHubClientSecret',
  'discord.client_secret',
  'oidc.client_secret',
  'TelegramBotToken',
  'LinuxDOClientSecret',
  'WeChatServerToken',
  'TurnstileSiteKey',
  'TurnstileSecretKey',
] as const

/**
 * Keys the server refuses to set to `'true'` while a companion value is still empty
 * (`controller.UpdateOption`), mapped to the key it actually inspects.
 *
 * `useOptionSectionForm` writes a section's dirty keys in SORTED key order, so a save that
 * turns a provider on and fills its credential in one pass only works when the credential
 * key sorts first. Verified live, one refusal at a time:
 *
 *   GitHubClientId      < GitHubOAuthEnabled          ok
 *   discord.client_id   < discord.enabled             ok
 *   oidc.client_id      < oidc.enabled                ok
 *   LinuxDOClientId     < LinuxDOOAuthEnabled         ok
 *   TelegramBotToken    < TelegramOAuthEnabled        ok
 *   WeChatAuthEnabled   < WeChatServerAddress         WRONG WAY ROUND
 *   TurnstileCheckEnabled < TurnstileSiteKey          WRONG WAY ROUND
 *
 * The two wrong-way pairs are handled in their sections by refusing to arm the switch
 * while its companion field has unsaved edits, so the bad ordering can never be produced.
 *
 * `EmailDomainRestrictionEnabled` has the same shape on paper but the guard is dead:
 * `model.updateOptionMap` stores the whitelist as `strings.Split(value, ",")`, and
 * splitting `''` yields `[""]` — length 1 — so `len(common.EmailDomainWhitelist) == 0` is
 * never true after any write. Verified live: enabling the restriction with a blank
 * whitelist is ACCEPTED. The section validates it client-side instead.
 */
export const ENABLE_DEPENDENCIES: Readonly<Record<string, string>> = {
  'discord.enabled': 'discord.client_id',
  GitHubOAuthEnabled: 'GitHubClientId',
  LinuxDOOAuthEnabled: 'LinuxDOClientId',
  'oidc.enabled': 'oidc.client_id',
  TelegramOAuthEnabled: 'TelegramBotToken',
  TurnstileCheckEnabled: 'TurnstileSiteKey',
  WeChatAuthEnabled: 'WeChatServerAddress',
}
