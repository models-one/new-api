import {
  CUSTOM_OAUTH_DEFAULTS,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  type CustomOAuthProvider,
  type CustomOAuthProviderInput,
} from '@/features/system-settings/auth-security/custom-oauth-api'
import { isAbsoluteHttpUrl } from '@/features/system-settings/auth-security/oauth-config'

/**
 * The custom-OAuth provider form, kept out of the component so the branching that matters
 * — required-on-create versus optional-on-edit, slug rules, the access policy blob — can be
 * tested without rendering a dialog.
 */

export type ProviderFormValues = {
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

export type ProviderFormField = keyof ProviderFormValues & string

export type ProviderFormErrors = Partial<Record<ProviderFormField, string>>

/** The message keys `validateProviderForm` can produce; the dialog translates them. */
export type ProviderFormErrorCode =
  | 'required'
  | 'slug-format'
  | 'slug-reserved'
  | 'url'
  | 'policy-json'
  | 'auth-style'

export const EMPTY_PROVIDER_FORM: ProviderFormValues = {
  access_denied_message: '',
  access_policy: '',
  auth_style: 0,
  authorization_endpoint: '',
  client_id: '',
  client_secret: '',
  display_name_field: CUSTOM_OAUTH_DEFAULTS.display_name_field,
  email_field: CUSTOM_OAUTH_DEFAULTS.email_field,
  enabled: true,
  icon: '',
  name: '',
  scopes: CUSTOM_OAUTH_DEFAULTS.scopes,
  slug: '',
  token_endpoint: '',
  user_id_field: CUSTOM_OAUTH_DEFAULTS.user_id_field,
  user_info_endpoint: '',
  username_field: CUSTOM_OAUTH_DEFAULTS.username_field,
  well_known: '',
}

/**
 * An existing provider as form values. `client_secret` is deliberately empty: the API
 * never returns it (`json:"-"` on the model, and it is not in the response struct at all),
 * and an empty value on update means "keep the stored one".
 */
export function providerToForm(provider: CustomOAuthProvider): ProviderFormValues {
  return {
    access_denied_message: provider.access_denied_message,
    access_policy: provider.access_policy,
    auth_style: provider.auth_style,
    authorization_endpoint: provider.authorization_endpoint,
    client_id: provider.client_id,
    client_secret: '',
    display_name_field: provider.display_name_field,
    email_field: provider.email_field,
    enabled: provider.enabled,
    icon: provider.icon,
    name: provider.name,
    scopes: provider.scopes,
    slug: provider.slug,
    token_endpoint: provider.token_endpoint,
    user_id_field: provider.user_id_field,
    user_info_endpoint: provider.user_info_endpoint,
    username_field: provider.username_field,
    well_known: provider.well_known,
  }
}

/**
 * Every rule the backend enforces, checked before the request rather than after it.
 *
 * `mode` matters for exactly one field. `CreateCustomOAuthProviderRequest.ClientSecret` is
 * `binding:"required"`, so an empty secret is rejected on create; `UpdateCustomOAuthProvider`
 * treats an empty secret as "keep the stored one", so it is optional on edit. Both verified
 * against the live server.
 *
 * Server-side rules mirrored here (`model.validateCustomOAuthProvider`,
 * `controller.CreateCustomOAuthProvider`):
 *   name, slug, client_id and the three endpoints are required
 *   slug matches ^[a-z0-9-]+$ and must not collide with a built-in provider
 *   access_policy, when not blank, must be valid JSON
 *   auth_style is 0, 1 or 2
 *
 * The endpoint URL check is stricter than the server's, which only requires a non-empty
 * string: a relative path is stored happily and then fails at sign-in time, where the
 * operator cannot see why.
 */
export function validateProviderForm(
  values: ProviderFormValues,
  mode: 'create' | 'edit',
): Partial<Record<ProviderFormField, ProviderFormErrorCode>> {
  const errors: Partial<Record<ProviderFormField, ProviderFormErrorCode>> = {}

  if (values.name.trim() === '') errors.name = 'required'

  const slug = values.slug.trim()
  if (slug === '') {
    errors.slug = 'required'
  } else if (!SLUG_PATTERN.test(slug)) {
    errors.slug = 'slug-format'
  } else if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    errors.slug = 'slug-reserved'
  }

  if (values.client_id.trim() === '') errors.client_id = 'required'
  if (mode === 'create' && values.client_secret === '') errors.client_secret = 'required'

  for (const field of ['authorization_endpoint', 'token_endpoint', 'user_info_endpoint'] as const) {
    const value = values[field].trim()
    if (value === '') {
      errors[field] = 'required'
    } else if (!isAbsoluteHttpUrl(value)) {
      errors[field] = 'url'
    }
  }

  const wellKnown = values.well_known.trim()
  if (wellKnown !== '' && !isAbsoluteHttpUrl(wellKnown)) errors.well_known = 'url'

  const policy = values.access_policy.trim()
  if (policy !== '') {
    try {
      JSON.parse(policy)
    } catch {
      errors.access_policy = 'policy-json'
    }
  }

  if (![0, 1, 2].includes(values.auth_style)) errors.auth_style = 'auth-style'

  return errors
}

/**
 * Form values as a request body. Strings are trimmed, and the four field-mapping paths plus
 * `scopes` fall back to the same defaults `validateCustomOAuthProvider` would apply — set
 * explicitly rather than left blank, so the record the operator sees matches what they
 * submitted.
 */
export function providerFormToInput(values: ProviderFormValues): CustomOAuthProviderInput {
  const orDefault = (value: string, fallback: string) => (value.trim() === '' ? fallback : value.trim())

  return {
    access_denied_message: values.access_denied_message.trim(),
    access_policy: values.access_policy.trim(),
    auth_style: values.auth_style,
    authorization_endpoint: values.authorization_endpoint.trim(),
    client_id: values.client_id.trim(),
    client_secret: values.client_secret,
    display_name_field: orDefault(values.display_name_field, CUSTOM_OAUTH_DEFAULTS.display_name_field),
    email_field: orDefault(values.email_field, CUSTOM_OAUTH_DEFAULTS.email_field),
    enabled: values.enabled,
    icon: values.icon.trim(),
    name: values.name.trim(),
    scopes: orDefault(values.scopes, CUSTOM_OAUTH_DEFAULTS.scopes),
    slug: values.slug.trim().toLowerCase(),
    token_endpoint: values.token_endpoint.trim(),
    user_id_field: orDefault(values.user_id_field, CUSTOM_OAUTH_DEFAULTS.user_id_field),
    user_info_endpoint: values.user_info_endpoint.trim(),
    username_field: orDefault(values.username_field, CUSTOM_OAUTH_DEFAULTS.username_field),
    well_known: values.well_known.trim(),
  }
}
