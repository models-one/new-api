import { queryOptions } from '@tanstack/react-query'

import { deleteJson, getJson, postJson, putJson } from '@/lib/api/client'

/**
 * `/api/custom-oauth-provider` — admin-defined OAuth/OIDC providers.
 *
 * THE PATH IS HYPHENATED. `router/api-router.go` registers the group as
 * `apiRouter.Group("/custom-oauth-provider")`; `/api/custom_oauth/` answers 404. Verified
 * live, both spellings.
 *
 * The whole group sits behind `middleware.RootAuth()` — role 100, the same guard as
 * `/api/option/` — so it needs no separate permission check inside the settings shell.
 *
 *   GET    /api/custom-oauth-provider/            list, `data` is `[]` when empty
 *   GET    /api/custom-oauth-provider/:id         one provider
 *   POST   /api/custom-oauth-provider/            create
 *   PUT    /api/custom-oauth-provider/:id         update
 *   DELETE /api/custom-oauth-provider/:id         delete
 *   POST   /api/custom-oauth-provider/discovery   fetch an OIDC discovery document
 *
 * THE CLIENT SECRET IS NEVER RETURNED. `model.CustomOAuthProvider.ClientSecret` is tagged
 * `json:"-"` AND left out of `controller.CustomOAuthProviderResponse`, so no read path can
 * expose it. Verified: the create response for a provider created WITH a secret carries no
 * `client_secret` field at all.
 *
 * On UPDATE an empty `client_secret` means KEEP THE STORED ONE:
 *
 *   if req.ClientSecret != "" { provider.ClientSecret = req.ClientSecret }
 *
 * verified live by updating a provider with `"client_secret": ""` and watching the record
 * survive. On CREATE the field is `binding:"required"` and an empty value is rejected.
 *
 * The same "empty means keep" rule applies to every plain string on update — `name`,
 * `slug`, `client_id`, the three endpoints, `scopes` and the four field paths. Only
 * `icon`, `enabled`, `well_known`, `auth_style`, `access_policy` and
 * `access_denied_message` are pointers, so only those six can be cleared through an
 * update. The edit form therefore always sends the full current value for the string
 * fields and never tries to blank one.
 */

/** A provider exactly as `controller.toCustomOAuthProviderResponse` serialises it. */
export type CustomOAuthProvider = {
  id: number
  name: string
  /** Lowercase letters, digits and hyphens. Forms the callback path `/oauth/<slug>`. */
  slug: string
  /** An icon name, stored as free text; the console renders a neutral mark either way. */
  icon: string
  enabled: boolean
  client_id: string
  authorization_endpoint: string
  token_endpoint: string
  user_info_endpoint: string
  scopes: string
  user_id_field: string
  username_field: string
  display_name_field: string
  email_field: string
  well_known: string
  /** 0 auto, 1 params in the body, 2 HTTP Basic header. */
  auth_style: number
  /** A JSON policy document, or `''` for "any account the provider authenticates". */
  access_policy: string
  access_denied_message: string
}

export const CUSTOM_OAUTH_QUERY_KEY = ['system-settings', 'custom-oauth-providers'] as const

const BASE_PATH = '/api/custom-oauth-provider'

export function customOAuthProvidersQuery() {
  return queryOptions({
    queryKey: CUSTOM_OAUTH_QUERY_KEY,
    queryFn: () =>
      getJson<CustomOAuthProvider[] | null>(`${BASE_PATH}/`, {
        skipBusinessError: true,
        skipErrorHandler: true,
      }).then((providers) => providers ?? []),
    staleTime: 30 * 1000,
  })
}

/** Everything `CreateCustomOAuthProviderRequest` accepts. `client_secret` is required. */
export type CustomOAuthProviderInput = {
  name: string
  slug: string
  icon: string
  enabled: boolean
  client_id: string
  client_secret: string
  authorization_endpoint: string
  token_endpoint: string
  user_info_endpoint: string
  scopes: string
  user_id_field: string
  username_field: string
  display_name_field: string
  email_field: string
  well_known: string
  auth_style: number
  access_policy: string
  access_denied_message: string
}

export async function createCustomOAuthProvider(
  input: CustomOAuthProviderInput,
): Promise<CustomOAuthProvider> {
  return postJson<CustomOAuthProvider>(`${BASE_PATH}/`, input, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/**
 * `client_secret` is omitted from the body entirely when the operator left the field
 * blank, which is the server's "keep the stored secret" signal. Sending `''` has the same
 * effect, but omitting it makes the intent unmistakable in a request log.
 */
export async function updateCustomOAuthProvider(
  id: number,
  input: CustomOAuthProviderInput,
): Promise<CustomOAuthProvider> {
  const { client_secret: clientSecret, ...rest } = input
  const body = clientSecret === '' ? rest : { ...rest, client_secret: clientSecret }

  return putJson<CustomOAuthProvider>(`${BASE_PATH}/${id}`, body, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/**
 * Deleting removes the provider AND every user binding to it — but only after the handler
 * has refused when bindings still exist:
 *
 *   if count > 0 { "该 OAuth 提供商还有用户绑定，无法删除。请先解除所有用户绑定。" }
 *
 * so the destructive path the console can actually reach is the empty one. The refusal is
 * surfaced verbatim.
 */
export async function deleteCustomOAuthProvider(id: number): Promise<void> {
  await deleteJson<unknown>(`${BASE_PATH}/${id}`, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/**
 * The discovery document as the backend hands it back. Everything is optional because the
 * handler forwards whatever the remote server answered without checking its shape.
 *
 * Note `userinfo_endpoint` — one word, per the OIDC discovery spec — while the provider
 * record calls the same thing `user_info_endpoint`.
 */
export type OidcDiscovery = {
  authorization_endpoint?: string
  token_endpoint?: string
  userinfo_endpoint?: string
  scopes_supported?: string[]
}

export type DiscoveryResult = {
  well_known_url: string
  discovery: OidcDiscovery
}

/**
 * `POST /api/custom-oauth-provider/discovery` fetches the document SERVER-SIDE, which is
 * why this feature uses it for the built-in OIDC provider too: the legacy console fetched
 * `.well-known` straight from the browser with axios, so any identity provider without
 * permissive CORS headers failed for reasons the operator could not see.
 *
 * Pass either the full `.well-known` URL or the issuer; the handler appends
 * `/.well-known/openid-configuration` to an issuer itself. Verified live against a local
 * document, both spellings, plus the three refusals: an empty body, a non-http URL and an
 * unreachable host each answer HTTP 200 with `success:false` and a readable sentence.
 */
export async function fetchOidcDiscovery(input: {
  wellKnownUrl?: string
  issuerUrl?: string
}): Promise<DiscoveryResult> {
  return postJson<DiscoveryResult>(
    `${BASE_PATH}/discovery`,
    { issuer_url: input.issuerUrl ?? '', well_known_url: input.wellKnownUrl ?? '' },
    { skipBusinessError: true, skipErrorHandler: true },
  )
}

/** `validateCustomOAuthProvider` lowercases the slug and accepts only these characters. */
export const SLUG_PATTERN = /^[a-z0-9-]+$/

/**
 * Slugs the console refuses, which is a STRICTER set than the server's.
 *
 * The server only rejects the four names in `oauth.Register` — `github`, `discord`,
 * `oidc`, `linuxdo` — with "该 Slug 与内置 OAuth 提供商冲突" (verified live with `github`).
 * `telegram` and `wechat` are NOT in that registry and the server accepts them: creating a
 * provider slugged `telegram` succeeded on the dev server.
 *
 * They are reserved here anyway because the slug becomes a console route. `/oauth/$provider`
 * is the callback for every redirect-kind provider, and `OAuthCallbackPage` dispatches on
 * that segment, so a custom provider slugged `telegram` or `wechat` would collide with the
 * built-in Telegram widget and WeChat QR flows and return a user to the wrong handler. The
 * server would store it happily; the sign-in would break. Refusing it here is the fix.
 */
export const RESERVED_SLUGS = ['github', 'discord', 'oidc', 'telegram', 'linuxdo', 'wechat'] as const

/** The defaults `validateCustomOAuthProvider` fills in when a field is left empty. */
export const CUSTOM_OAUTH_DEFAULTS = {
  display_name_field: 'name',
  email_field: 'email',
  scopes: 'openid profile email',
  user_id_field: 'sub',
  username_field: 'preferred_username',
} as const
