import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, delete: del } }))

const {
  EMPTY_PROVIDER_FORM,
  providerFormToInput,
  providerToForm,
  validateProviderForm,
} = await import('@/features/system-settings/auth-security/provider-form')
const { createCustomOAuthProvider, updateCustomOAuthProvider } = await import(
  '@/features/system-settings/auth-security/custom-oauth-api'
)
const { OAUTH_PRESETS, joinPresetUrl } = await import(
  '@/features/system-settings/auth-security/presets'
)

/** A provider exactly as the live server returned it — note the absent `client_secret`. */
const storedProvider = {
  access_denied_message: '',
  access_policy: '',
  auth_style: 1,
  authorization_endpoint: 'https://idp.example.com/authorize',
  client_id: 'cid-123',
  display_name_field: 'name',
  email_field: 'email',
  enabled: true,
  icon: 'openid',
  id: 1,
  name: 'Probe IdP',
  scopes: 'openid profile',
  slug: 'probe-idp',
  token_endpoint: 'https://idp.example.com/token',
  user_id_field: 'sub',
  user_info_endpoint: 'https://idp.example.com/userinfo',
  username_field: 'preferred_username',
  well_known: '',
}

const validForm = {
  ...EMPTY_PROVIDER_FORM,
  authorization_endpoint: 'https://idp.example.com/authorize',
  client_id: 'cid',
  client_secret: 'sec',
  name: 'Probe IdP',
  slug: 'probe-idp',
  token_endpoint: 'https://idp.example.com/token',
  user_info_endpoint: 'https://idp.example.com/userinfo',
}

describe('validateProviderForm', () => {
  it('accepts a complete form in both modes', () => {
    expect(validateProviderForm(validForm, 'create')).toEqual({})
    expect(validateProviderForm(validForm, 'edit')).toEqual({})
  })

  it('requires the client secret on create and not on edit', () => {
    // CreateCustomOAuthProviderRequest.ClientSecret is `binding:"required"`;
    // UpdateCustomOAuthProvider keeps the stored one when the field is empty.
    const withoutSecret = { ...validForm, client_secret: '' }
    expect(validateProviderForm(withoutSecret, 'create').client_secret).toBe('required')
    expect(validateProviderForm(withoutSecret, 'edit').client_secret).toBeUndefined()
  })

  it('applies the server’s slug rules', () => {
    expect(validateProviderForm({ ...validForm, slug: '' }, 'create').slug).toBe('required')
    expect(validateProviderForm({ ...validForm, slug: 'Bad_Slug' }, 'create').slug).toBe('slug-format')
    expect(validateProviderForm({ ...validForm, slug: 'github' }, 'create').slug).toBe('slug-reserved')
    expect(validateProviderForm({ ...validForm, slug: 'my-idp-2' }, 'create').slug).toBeUndefined()
  })

  it('insists the three endpoints are absolute, which the server does not', () => {
    // The backend only checks they are non-empty, so a relative path is stored happily and
    // fails later, at sign-in, where the operator cannot see why.
    expect(validateProviderForm({ ...validForm, token_endpoint: '' }, 'create').token_endpoint).toBe('required')
    expect(validateProviderForm({ ...validForm, token_endpoint: '/token' }, 'create').token_endpoint).toBe('url')
  })

  it('rejects a malformed access policy the way the model does', () => {
    expect(validateProviderForm({ ...validForm, access_policy: '{nope}' }, 'create').access_policy).toBe('policy-json')
    expect(validateProviderForm({ ...validForm, access_policy: '' }, 'create').access_policy).toBeUndefined()
    expect(
      validateProviderForm({ ...validForm, access_policy: '{"logic":"and","conditions":[]}' }, 'create').access_policy,
    ).toBeUndefined()
  })

  it('rejects an auth style outside 0–2', () => {
    expect(validateProviderForm({ ...validForm, auth_style: 5 }, 'create').auth_style).toBe('auth-style')
  })
})

describe('providerToForm', () => {
  it('never claims to know the stored secret', () => {
    expect(providerToForm(storedProvider).client_secret).toBe('')
  })

  it('carries every readable field through unchanged', () => {
    const form = providerToForm(storedProvider)
    expect(form.slug).toBe('probe-idp')
    expect(form.auth_style).toBe(1)
    expect(form.enabled).toBe(true)
    expect(form.user_info_endpoint).toBe('https://idp.example.com/userinfo')
  })
})

describe('providerFormToInput', () => {
  it('trims, lowercases the slug and fills the server’s own defaults', () => {
    const input = providerFormToInput({
      ...validForm,
      display_name_field: '',
      email_field: '',
      name: '  Probe  ',
      scopes: '   ',
      slug: '  Probe-IdP  ',
      user_id_field: '',
      username_field: '',
    })

    expect(input.name).toBe('Probe')
    expect(input.slug).toBe('probe-idp')
    expect(input.scopes).toBe('openid profile email')
    expect(input.user_id_field).toBe('sub')
    expect(input.username_field).toBe('preferred_username')
    expect(input.display_name_field).toBe('name')
    expect(input.email_field).toBe('email')
  })

  it('leaves the secret exactly as typed, including empty', () => {
    expect(providerFormToInput({ ...validForm, client_secret: '' }).client_secret).toBe('')
    expect(providerFormToInput({ ...validForm, client_secret: '  s p  ' }).client_secret).toBe('  s p  ')
  })
})

describe('the update request body', () => {
  beforeEach(() => {
    put.mockReset()
    post.mockReset()
    put.mockResolvedValue({ data: { data: storedProvider, message: '', success: true } })
    post.mockResolvedValue({ data: { data: storedProvider, message: '', success: true } })
  })

  it('omits client_secret entirely when the operator left it blank', async () => {
    await updateCustomOAuthProvider(1, providerFormToInput({ ...validForm, client_secret: '' }))

    const body = put.mock.calls[0][1] as Record<string, unknown>
    expect(Object.hasOwn(body, 'client_secret')).toBe(false)
    expect(body.client_id).toBe('cid')
  })

  it('sends client_secret when the operator typed a new one', async () => {
    await updateCustomOAuthProvider(1, providerFormToInput({ ...validForm, client_secret: 'rotated' }))

    const body = put.mock.calls[0][1] as Record<string, unknown>
    expect(body.client_secret).toBe('rotated')
  })

  it('always sends the secret on create, where it is required', async () => {
    await createCustomOAuthProvider(providerFormToInput(validForm))

    const body = post.mock.calls[0][1] as Record<string, unknown>
    expect(body.client_secret).toBe('sec')
  })
})

describe('presets', () => {
  it('joins paths onto a base URL without doubling the separator', () => {
    expect(joinPresetUrl('https://git.example.com/', '/oauth/authorize')).toBe(
      'https://git.example.com/oauth/authorize',
    )
    expect(joinPresetUrl('https://git.example.com', 'oauth/token')).toBe(
      'https://git.example.com/oauth/token',
    )
  })

  it('produces absolute endpoints the form then accepts', () => {
    const gitlab = OAUTH_PRESETS.find((preset) => preset.id === 'gitlab')
    expect(gitlab).toBeDefined()
    if (gitlab === undefined) return

    const errors = validateProviderForm(
      {
        ...validForm,
        authorization_endpoint: joinPresetUrl('https://git.example.com', gitlab.authorizationPath),
        token_endpoint: joinPresetUrl('https://git.example.com', gitlab.tokenPath),
        user_info_endpoint: joinPresetUrl('https://git.example.com', gitlab.userInfoPath),
      },
      'create',
    )
    expect(errors).toEqual({})
  })

  it('has a unique id per preset', () => {
    const ids = OAUTH_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
