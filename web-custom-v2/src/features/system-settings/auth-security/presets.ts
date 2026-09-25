/**
 * Endpoint shapes for identity providers that are commonly self-hosted, ported verbatim
 * from the legacy console's `OAUTH_PRESETS`. They are a typing shortcut and nothing more:
 * every value lands in an ordinary editable field, and the backend validates the result the
 * same way it validates a hand-typed provider.
 *
 * Each preset's paths are relative to the deployment's own base URL, which the operator
 * supplies — there is no hosted default to guess at.
 */

export type OAuthPreset = {
  id: string
  /** Provider name, shown in the picker. Not translated: these are product names. */
  name: string
  /** Suggested value for the provider's `icon` field. */
  icon: string
  authorizationPath: string
  tokenPath: string
  userInfoPath: string
  scopes: string
  userIdField: string
  usernameField: string
  displayNameField: string
  emailField: string
}

export const OAUTH_PRESETS: readonly OAuthPreset[] = [
  {
    authorizationPath: '/login/oauth/authorize',
    displayNameField: 'name',
    emailField: 'email',
    icon: 'github',
    id: 'github-enterprise',
    name: 'GitHub Enterprise',
    scopes: 'user:email',
    tokenPath: '/login/oauth/access_token',
    userIdField: 'id',
    userInfoPath: '/api/v3/user',
    usernameField: 'login',
  },
  {
    authorizationPath: '/oauth/authorize',
    displayNameField: 'name',
    emailField: 'email',
    icon: 'gitlab',
    id: 'gitlab',
    name: 'GitLab',
    scopes: 'openid profile email',
    tokenPath: '/oauth/token',
    userIdField: 'id',
    userInfoPath: '/api/v4/user',
    usernameField: 'username',
  },
  {
    authorizationPath: '/login/oauth/authorize',
    displayNameField: 'full_name',
    emailField: 'email',
    icon: 'gitea',
    id: 'gitea',
    name: 'Gitea',
    scopes: 'openid profile email',
    tokenPath: '/login/oauth/access_token',
    userIdField: 'id',
    userInfoPath: '/api/v1/user',
    usernameField: 'login',
  },
  {
    authorizationPath: '/apps/oauth2/authorize',
    displayNameField: 'ocs.data.displayname',
    emailField: 'ocs.data.email',
    icon: 'nextcloud',
    id: 'nextcloud',
    name: 'Nextcloud',
    scopes: 'openid profile email',
    tokenPath: '/apps/oauth2/api/v1/token',
    userIdField: 'ocs.data.id',
    userInfoPath: '/ocs/v2.php/cloud/user?format=json',
    usernameField: 'ocs.data.id',
  },
  {
    authorizationPath: '/realms/{realm}/protocol/openid-connect/auth',
    displayNameField: 'name',
    emailField: 'email',
    icon: 'keycloak',
    id: 'keycloak',
    name: 'Keycloak',
    scopes: 'openid profile email',
    tokenPath: '/realms/{realm}/protocol/openid-connect/token',
    userIdField: 'sub',
    userInfoPath: '/realms/{realm}/protocol/openid-connect/userinfo',
    usernameField: 'preferred_username',
  },
  {
    authorizationPath: '/application/o/authorize/',
    displayNameField: 'name',
    emailField: 'email',
    icon: 'authentik',
    id: 'authentik',
    name: 'Authentik',
    scopes: 'openid profile email',
    tokenPath: '/application/o/token/',
    userIdField: 'sub',
    userInfoPath: '/application/o/userinfo/',
    usernameField: 'preferred_username',
  },
  {
    authorizationPath: '/oauth2/auth',
    displayNameField: 'name',
    emailField: 'email',
    icon: 'openid',
    id: 'ory',
    name: 'ORY Hydra',
    scopes: 'openid profile email',
    tokenPath: '/oauth2/token',
    userIdField: 'sub',
    userInfoPath: '/userinfo',
    usernameField: 'preferred_username',
  },
]

/** Joins a preset path onto a base URL without doubling or dropping the separator. */
export function joinPresetUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (base === '') return path
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
