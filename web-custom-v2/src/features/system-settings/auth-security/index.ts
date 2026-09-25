/**
 * The Authentication and Security settings groups.
 *
 * Nine sections under `/system-settings/auth/*` and `/system-settings/security/*`, plus the
 * pure helpers they are built from. The group files reference the components from here.
 */
export { BasicAuthSection } from '@/features/system-settings/auth-security/sections/BasicAuthSection'
export { BotProtectionSection } from '@/features/system-settings/auth-security/sections/BotProtectionSection'
export { CustomOAuthSection } from '@/features/system-settings/auth-security/sections/CustomOAuthSection'
export { OAuthSection } from '@/features/system-settings/auth-security/sections/OAuthSection'
export { PasskeySection } from '@/features/system-settings/auth-security/sections/PasskeySection'
export { RateLimitSection } from '@/features/system-settings/auth-security/sections/RateLimitSection'
export { SensitiveWordsSection } from '@/features/system-settings/auth-security/sections/SensitiveWordsSection'
export { SsrfSection } from '@/features/system-settings/auth-security/sections/SsrfSection'
export { TokenLimitsSection } from '@/features/system-settings/auth-security/sections/TokenLimitsSection'

export {
  ENABLE_DEPENDENCIES,
  WRITE_ONLY_AUTH_KEYS,
  isWriteOnlyOptionKey,
} from '@/features/system-settings/auth-security/option-keys'

export {
  OAUTH_PROVIDER_IDS,
  buildCallbackUrl,
  isAbsoluteHttpUrl,
  oauthReadinessGaps,
  resolveSiteUrl,
} from '@/features/system-settings/auth-security/oauth-config'
export type {
  OAuthProviderId,
  OAuthReadinessGap,
  OAuthReadinessInput,
} from '@/features/system-settings/auth-security/oauth-config'

export {
  CUSTOM_OAUTH_DEFAULTS,
  CUSTOM_OAUTH_QUERY_KEY,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  createCustomOAuthProvider,
  customOAuthProvidersQuery,
  deleteCustomOAuthProvider,
  fetchOidcDiscovery,
  updateCustomOAuthProvider,
} from '@/features/system-settings/auth-security/custom-oauth-api'
export type {
  CustomOAuthProvider,
  CustomOAuthProviderInput,
  DiscoveryResult,
  OidcDiscovery,
} from '@/features/system-settings/auth-security/custom-oauth-api'

export {
  EMPTY_PROVIDER_FORM,
  providerFormToInput,
  providerToForm,
  validateProviderForm,
} from '@/features/system-settings/auth-security/provider-form'
export type {
  ProviderFormErrorCode,
  ProviderFormField,
  ProviderFormValues,
} from '@/features/system-settings/auth-security/provider-form'

export {
  MAX_RATE_LIMIT,
  serializeStringList,
  splitCommas,
  splitLines,
  validateDomainEntries,
  validateIpEntries,
  validatePortEntries,
  validateRateLimitGroups,
} from '@/features/system-settings/auth-security/validation'
export type { ValidationCode } from '@/features/system-settings/auth-security/validation'

export { OAUTH_PRESETS, joinPresetUrl } from '@/features/system-settings/auth-security/presets'
export type { OAuthPreset } from '@/features/system-settings/auth-security/presets'

export {
  MAX_RATE_LIMIT_VALUE,
  parseRateLimitGroups,
  removeRateLimitEntry,
  serializeRateLimitGroups,
  upsertRateLimitEntry,
  validateRateLimitEntry,
} from '@/features/system-settings/auth-security/rate-limit-groups'
export type {
  RateLimitEntryDraft,
  RateLimitEntryErrorCode,
  RateLimitGroupEntry,
  RateLimitGroupParse,
  RateLimitGroupUnsupported,
} from '@/features/system-settings/auth-security/rate-limit-groups'
