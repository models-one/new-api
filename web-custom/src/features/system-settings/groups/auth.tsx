import ShieldCheckIcon from 'lucide-react/dist/esm/icons/shield-check'

import { BasicAuthSection } from '@/features/system-settings/auth-security/sections/BasicAuthSection'
import { BotProtectionSection } from '@/features/system-settings/auth-security/sections/BotProtectionSection'
import { CustomOAuthSection } from '@/features/system-settings/auth-security/sections/CustomOAuthSection'
import { OAuthSection } from '@/features/system-settings/auth-security/sections/OAuthSection'
import { PasskeySection } from '@/features/system-settings/auth-security/sections/PasskeySection'
import type { SettingsGroupDefinition } from '@/features/system-settings/groups/types'

/**
 * OWNER: the agent rebuilding the Authentication group.
 *
 * Section ids mirror `web/src/features/system-settings/auth/section-registry.tsx`.
 *
 * READ THIS BEFORE BUILDING ANY OF IT. `controller.GetOptions` skips every key ending in
 * `Token`, `Secret`, `Key`, `secret` or `api_key`, so this group's credentials are absent
 * from the payload — not masked, absent. `GitHubClientSecret`, `TurnstileSiteKey`,
 * `TurnstileSecretKey`, `TelegramBotToken`, `WeChatServerToken`, `oidc.client_secret`,
 * `discord.client_secret` and `LinuxDOClientSecret` can be WRITTEN but never read back.
 * A write-only PasswordInput that says so is the only honest control.
 *
 * The enable toggles are also refused server-side while their credential is empty
 * (`controller/option.go`): `GitHubOAuthEnabled`, `discord.enabled`, `oidc.enabled`,
 * `LinuxDOOAuthEnabled`, `WeChatAuthEnabled`, `TurnstileCheckEnabled`,
 * `TelegramOAuthEnabled` and `EmailDomainRestrictionEnabled` all answer HTTP 200 with
 * `success:false`. Verified live: enabling GitHub OAuth with an empty client id is
 * refused. The section form surfaces that as a per-key failure; do not hide it.
 */
export const authGroup: SettingsGroupDefinition = {
  Icon: ShieldCheckIcon,
  description: 'How people prove who they are: passwords, OAuth providers, passkeys and bot checks.',
  id: 'auth',
  sections: [
    {
      description: 'Password sign-in, registration and e-mail verification.',
      Component: BasicAuthSection,
      id: 'basic-auth',
      title: 'Basic authentication',
    },
    {
      description: 'GitHub, Discord, Telegram, WeChat and LinuxDO sign-in.',
      Component: OAuthSection,
      id: 'oauth',
      title: 'OAuth integrations',
    },
    {
      description: 'Hardware and platform authenticators.',
      Component: PasskeySection,
      id: 'passkey',
      title: 'Passkey authentication',
    },
    {
      description: 'The Turnstile challenge in front of sign-up and sign-in.',
      Component: BotProtectionSection,
      id: 'bot-protection',
      title: 'Bot protection',
    },
    {
      description: 'An OIDC provider of your own.',
      Component: CustomOAuthSection,
      id: 'custom-oauth',
      title: 'Custom OAuth',
    },
  ],
  title: 'Authentication',
}
