/**
 * Shared authentication infrastructure.
 *
 * Sign-in, sign-up, password reset and the OAuth callbacks all build on this
 * module. Import from here rather than reaching into individual files.
 */

export { AuthLayout } from '@/features/auth/AuthLayout'
export { AuthConfigGate } from '@/features/auth/components/AuthConfigGate'
export { AuthTermsFooter, LegalConsent, PRIVACY_POLICY_HREF, USER_AGREEMENT_HREF } from '@/features/auth/components/LegalConsent'
export { OAuthProviders } from '@/features/auth/components/OAuthProviders'
export { ProviderIcon } from '@/features/auth/components/ProviderIcon'
export { TelegramLoginDialog } from '@/features/auth/components/TelegramLoginDialog'
export { WeChatQrDialog } from '@/features/auth/components/WeChatQrDialog'

export {
  EMPTY_AUTH_SERVER_CONFIG,
  readAuthServerConfig,
  requiresLegalConsent,
  useAuthServerConfig,
  type AuthServerConfig,
  type CustomOAuthProvider,
  type UseAuthServerConfigResult,
} from '@/features/auth/server-config'

export {
  authProviderDescriptors,
  buildCustomAuthorizationUrl,
  buildDiscordAuthorizationUrl,
  buildGitHubAuthorizationUrl,
  buildLinuxDoAuthorizationUrl,
  buildOidcAuthorizationUrl,
  hasOAuthProviders,
  type AuthorizationUrlInput,
  type OAuthProviderDescriptor,
  type OAuthProviderIcon,
  type OAuthProviderKind,
} from '@/features/auth/oauth-providers'

export {
  resetAuthSession,
  startRedirectOAuth,
  type StartRedirectOAuthOptions,
} from '@/features/auth/oauth-flow'

export {
  useOAuthLogin,
  type OAuthLoginMethod,
  type UseOAuthLoginOptions,
  type UseOAuthLoginResult,
} from '@/features/auth/use-oauth-login'

export {
  getSavedLanguage,
  resolveAuthRedirect,
  sanitizeAuthRedirect,
} from '@/features/auth/auth-redirect'

export {
  captureReferralCode,
  clearReferralCode,
  readReferralCode,
  saveReferralCode,
  REFERRAL_QUERY_PARAM,
  REFERRAL_STORAGE_KEY,
} from '@/features/auth/referral'

export {
  arrayBufferToBase64Url,
  base64UrlToArrayBuffer,
  buildAssertionResult,
  buildRegistrationResult,
  createCredential,
  getCredential,
  isPasskeySupported,
  prepareCredentialCreationOptions,
  prepareCredentialRequestOptions,
} from '@/features/auth/passkey'

export { pickTelegramAuthorization, type TelegramAuthorization } from '@/features/auth/telegram'

export {
  beginPasskeyLogin,
  createOAuthState,
  executeLogout,
  finishPasskeyLogin,
  logout,
  telegramLogin,
  wechatLoginByCode,
  type ApiResponse,
  type OAuthIntent,
  type PasskeyChallenge,
} from '@/features/auth/api'

export {
  authBundleSchema,
  authRotationSchema,
  authUserSchema,
  loginSessionSchema,
  type AuthBundle,
  type AuthRotation,
  type AuthUser,
  type LoginSession,
} from '@/features/auth/types'
