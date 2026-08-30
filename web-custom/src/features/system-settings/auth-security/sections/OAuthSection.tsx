import { useQuery } from '@tanstack/react-query'
import DownloadCloudIcon from 'lucide-react/dist/esm/icons/download-cloud'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NumberInput, PasswordInput, SwitchRow } from '@/components/form'
import { Tabs } from '@/components/disclosure'
import { toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button } from '@/components/ui'
import { CallbackGuide } from '@/features/system-settings/auth-security/components/CallbackGuide'
import { fetchOidcDiscovery } from '@/features/system-settings/auth-security/custom-oauth-api'
import {
  buildCallbackUrl,
  isAbsoluteHttpUrl,
  oauthReadinessGaps,
  resolveSiteUrl,
  type OAuthProviderId,
} from '@/features/system-settings/auth-security/oauth-config'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/auth/oauth` — the six built-in sign-in providers behind a tab bar.
 *
 * KEYS, and where each one stands in `GET /api/option/` on the running dev server.
 * "write-only" means `controller.GetOptions` skips it by suffix and it can never be read
 * back; "absent" means `model.InitOptionMap` never seeds it, so it appears only once
 * written (and then reads back normally).
 *
 *   GitHubOAuthEnabled            'false'
 *   GitHubClientId                ''
 *   GitHubClientSecret            write-only
 *   discord.enabled               'false'
 *   discord.client_id             ''
 *   discord.client_secret         write-only
 *   oidc.enabled                  'false'
 *   oidc.client_id                ''
 *   oidc.client_secret            write-only
 *   oidc.well_known               ''
 *   oidc.authorization_endpoint   ''
 *   oidc.token_endpoint           ''
 *   oidc.user_info_endpoint       ''
 *   TelegramOAuthEnabled          'false'
 *   TelegramBotName               ''
 *   TelegramBotToken              write-only
 *   LinuxDOOAuthEnabled           'false'
 *   LinuxDOClientId               ''      (not seeded by model.InitOptionMap; the row
 *                                          exists on this dev server, and every reader
 *                                          here passes a fallback so both cases are safe)
 *   LinuxDOClientSecret           write-only
 *   LinuxDOMinimumTrustLevel      '0'     (also unseeded; parsed with strconv.Atoi)
 *   WeChatAuthEnabled             'false'
 *   WeChatServerAddress           ''
 *   WeChatServerToken             write-only
 *   WeChatAccountQRCodeImageURL   ''
 *
 * SECRETS. Every `*Secret` / `*Token` field is a write-only `PasswordInput` that starts
 * empty and says what empty means. Because the read-back is always `''`, an untouched
 * field is never dirty and is never written, so saving this section cannot blank a stored
 * credential. Typing into one and clearing it again DOES write `''` and DOES remove it —
 * that is the only way to unset one, and the note says so.
 *
 * ENABLE ORDERING. `useOptionSectionForm` writes dirty keys in sorted key order, and the
 * server refuses to enable a provider whose credential is still empty. For five of the six
 * providers the credential key sorts first, so filling it in and switching the provider on
 * in a single Save works. WeChat is the exception — `WeChatAuthEnabled` sorts before
 * `WeChatServerAddress` — so its switch is held disabled while the server address has
 * unsaved edits, which makes the bad order unreachable rather than merely survivable.
 *
 * SIGN-IN READINESS. The server's guard and the sign-in page's requirements are not the
 * same set. Telegram is enabled on the strength of the bot TOKEN but the sign-in page
 * needs the bot NAME; OIDC is enabled on the client id but the page also needs an absolute
 * authorization endpoint. `oauthReadinessGaps` reports the difference so an operator does
 * not end up with a provider that is on, accepted, and invisible.
 */

type OAuthDraft = {
  GitHubOAuthEnabled: boolean
  GitHubClientId: string
  GitHubClientSecret: string
  'discord.enabled': boolean
  'discord.client_id': string
  'discord.client_secret': string
  'oidc.enabled': boolean
  'oidc.client_id': string
  'oidc.client_secret': string
  'oidc.well_known': string
  'oidc.authorization_endpoint': string
  'oidc.token_endpoint': string
  'oidc.user_info_endpoint': string
  TelegramOAuthEnabled: boolean
  TelegramBotName: string
  TelegramBotToken: string
  LinuxDOOAuthEnabled: boolean
  LinuxDOClientId: string
  LinuxDOClientSecret: string
  LinuxDOMinimumTrustLevel: number
  WeChatAuthEnabled: boolean
  WeChatServerAddress: string
  WeChatServerToken: string
  WeChatAccountQRCodeImageURL: string
}

type OAuthDraftKey = keyof OAuthDraft & string

/** Write-only credentials always start empty: the server never sends them back. */
function toDraft(options: SystemOptionMap | undefined): OAuthDraft {
  return {
    'discord.client_id': readOptionString(options, 'discord.client_id'),
    'discord.client_secret': '',
    'discord.enabled': readOptionBoolean(options, 'discord.enabled'),
    GitHubClientId: readOptionString(options, 'GitHubClientId'),
    GitHubClientSecret: '',
    GitHubOAuthEnabled: readOptionBoolean(options, 'GitHubOAuthEnabled'),
    LinuxDOClientId: readOptionString(options, 'LinuxDOClientId'),
    LinuxDOClientSecret: '',
    // `common.LinuxDOMinimumTrustLevel` defaults to 0 and is parsed with strconv.Atoi.
    LinuxDOMinimumTrustLevel: readOptionNumber(options, 'LinuxDOMinimumTrustLevel', 0),
    LinuxDOOAuthEnabled: readOptionBoolean(options, 'LinuxDOOAuthEnabled'),
    'oidc.authorization_endpoint': readOptionString(options, 'oidc.authorization_endpoint'),
    'oidc.client_id': readOptionString(options, 'oidc.client_id'),
    'oidc.client_secret': '',
    'oidc.enabled': readOptionBoolean(options, 'oidc.enabled'),
    'oidc.token_endpoint': readOptionString(options, 'oidc.token_endpoint'),
    'oidc.user_info_endpoint': readOptionString(options, 'oidc.user_info_endpoint'),
    'oidc.well_known': readOptionString(options, 'oidc.well_known'),
    TelegramBotName: readOptionString(options, 'TelegramBotName'),
    TelegramBotToken: '',
    TelegramOAuthEnabled: readOptionBoolean(options, 'TelegramOAuthEnabled'),
    WeChatAccountQRCodeImageURL: readOptionString(options, 'WeChatAccountQRCodeImageURL'),
    WeChatAuthEnabled: readOptionBoolean(options, 'WeChatAuthEnabled'),
    WeChatServerAddress: readOptionString(options, 'WeChatServerAddress'),
    WeChatServerToken: '',
  }
}

/** Which draft keys belong to which tab, for the per-tab unsaved-changes marker. */
const TAB_KEYS: Record<OAuthProviderId, readonly OAuthDraftKey[]> = {
  discord: ['discord.enabled', 'discord.client_id', 'discord.client_secret'],
  github: ['GitHubOAuthEnabled', 'GitHubClientId', 'GitHubClientSecret'],
  linuxdo: [
    'LinuxDOOAuthEnabled',
    'LinuxDOClientId',
    'LinuxDOClientSecret',
    'LinuxDOMinimumTrustLevel',
  ],
  oidc: [
    'oidc.enabled',
    'oidc.client_id',
    'oidc.client_secret',
    'oidc.well_known',
    'oidc.authorization_endpoint',
    'oidc.token_endpoint',
    'oidc.user_info_endpoint',
  ],
  telegram: ['TelegramOAuthEnabled', 'TelegramBotName', 'TelegramBotToken'],
  wechat: [
    'WeChatAuthEnabled',
    'WeChatServerAddress',
    'WeChatServerToken',
    'WeChatAccountQRCodeImageURL',
  ],
}

const PROVIDER_NAMES: Record<OAuthProviderId, string> = {
  discord: 'Discord',
  github: 'GitHub',
  linuxdo: 'LinuxDO',
  oidc: 'OIDC',
  telegram: 'Telegram',
  wechat: 'WeChat',
}

export function OAuthSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const [activeTab, setActiveTab] = useState<OAuthProviderId>('github')
  const [discoveryBusy, setDiscoveryBusy] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | undefined>(undefined)

  const form = useOptionSectionForm<OAuthDraft>({
    saved: toDraft(optionsQuery.data),
    validate: (values) => {
      const errors: Partial<Record<OAuthDraftKey, string>> = {}
      const requiredCredential = t('The server refuses to enable this provider until its client ID is stored.')

      /**
       * Each of these is recorded on the CREDENTIAL key and on the ENABLE key.
       *
       * `useOptionSectionForm` refuses a save only when a key it is about to write carries
       * an error. Flipping a provider on without filling its credential leaves the enable
       * flag as the only dirty key, so an error held solely against the credential field
       * would not stop the write — it would go out and come back as the server's refusal.
       * Naming both keys turns that round trip into an inline error on the field that has
       * to change, which is where the operator can act on it.
       */
      const requireCredential = (
        enabled: boolean,
        credential: string,
        enableKey: OAuthDraftKey,
        credentialKey: OAuthDraftKey,
        message: string,
      ) => {
        if (!enabled || credential.trim() !== '') return
        errors[credentialKey] = message
        errors[enableKey] = message
      }

      requireCredential(
        values.GitHubOAuthEnabled,
        values.GitHubClientId,
        'GitHubOAuthEnabled',
        'GitHubClientId',
        requiredCredential,
      )
      requireCredential(
        values['discord.enabled'],
        values['discord.client_id'],
        'discord.enabled',
        'discord.client_id',
        requiredCredential,
      )
      requireCredential(
        values['oidc.enabled'],
        values['oidc.client_id'],
        'oidc.enabled',
        'oidc.client_id',
        requiredCredential,
      )
      requireCredential(
        values.LinuxDOOAuthEnabled,
        values.LinuxDOClientId,
        'LinuxDOOAuthEnabled',
        'LinuxDOClientId',
        requiredCredential,
      )
      requireCredential(
        values.WeChatAuthEnabled,
        values.WeChatServerAddress,
        'WeChatAuthEnabled',
        'WeChatServerAddress',
        t('The server refuses to enable WeChat sign-in until this address is stored.'),
      )

      for (const key of [
        'oidc.well_known',
        'oidc.authorization_endpoint',
        'oidc.token_endpoint',
        'oidc.user_info_endpoint',
      ] as const) {
        const value = values[key].trim()
        if (value !== '' && !isAbsoluteHttpUrl(value)) {
          errors[key] = t('Enter a full http:// or https:// address.')
        }
      }

      if (
        values.LinuxDOMinimumTrustLevel < 0 ||
        !Number.isInteger(values.LinuxDOMinimumTrustLevel)
      ) {
        errors.LinuxDOMinimumTrustLevel = t('Enter a whole number of 0 or more.')
      }

      return errors
    },
  })

  const values = form.values
  const disabled = optionsQuery.isPending || form.isSaving

  const serverAddress = readOptionString(optionsQuery.data, 'ServerAddress').trim()
  const siteUrlMissing = serverAddress === ''
  const siteUrl = resolveSiteUrl(serverAddress, '')

  const gaps = oauthReadinessGaps(values)

  const gapSentence = (provider: OAuthProviderId, reason: string): string => {
    const name = PROVIDER_NAMES[provider]
    if (reason === 'bot-name') {
      return t('{{provider}} is on, but the sign-in page needs the bot name as well as the bot token. No button is drawn without it.', { provider: name })
    }
    if (reason === 'authorization-endpoint') {
      return t('{{provider}} is on, but its authorization endpoint is not a full http:// or https:// address, so the sign-in page skips it.', { provider: name })
    }
    return t('{{provider}} is on, but its client ID is empty, so the sign-in page draws no button for it.', { provider: name })
  }

  const runDiscovery = async () => {
    const wellKnown = values['oidc.well_known'].trim()
    if (wellKnown === '') {
      setDiscoveryError(t('Enter the discovery document URL first.'))
      return
    }

    setDiscoveryBusy(true)
    setDiscoveryError(undefined)
    try {
      const result = await fetchOidcDiscovery({ wellKnownUrl: wellKnown })
      const discovery = result.discovery
      form.setField('oidc.authorization_endpoint', discovery.authorization_endpoint ?? '')
      form.setField('oidc.token_endpoint', discovery.token_endpoint ?? '')
      // The discovery document spells it `userinfo_endpoint`; the option is `user_info_endpoint`.
      form.setField('oidc.user_info_endpoint', discovery.userinfo_endpoint ?? '')
      toast.success(t('Endpoints filled in from the discovery document. Save to store them.'))
    } catch (error) {
      setDiscoveryError(toErrorMessage(error))
    } finally {
      setDiscoveryBusy(false)
    }
  }

  const tabHasChanges = (provider: OAuthProviderId): boolean =>
    TAB_KEYS[provider].some((key) => form.isFieldDirty(key))

  /**
   * The WeChat switch. `WeChatAuthEnabled` sorts BEFORE `WeChatServerAddress`, so a save
   * that does both would send the enable first and be refused. Holding the switch until
   * the address is stored removes the failure instead of reporting it.
   */
  const wechatSwitchBlocked = form.isFieldDirty('WeChatServerAddress')

  const secretNote = t('Leave blank to keep the stored value. The server never sends a stored secret back, so this field cannot show one. Typing a value and clearing it again erases the stored secret.')

  return (
    <SettingsSection
      description={t('Sign-in providers users can link to their account. Each provider needs its own application registered on the provider’s side first.')}
      form={form}
      note={secretNote}
      saveMode="section"
      title={t('OAuth integrations')}
    >
      {gaps.length > 0 ? (
        <Alert
          icon={<TriangleAlertIcon aria-hidden="true" />}
          live="status"
          title={t('Enabled, but no sign-in button')}
          tone="warning"
        >
          <ul className="flex flex-col gap-1">
            {gaps.map((gap) => (
              <li key={`${gap.provider}-${gap.reason}`}>{gapSentence(gap.provider, gap.reason)}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Tabs onValueChange={(value) => setActiveTab(value as OAuthProviderId)} value={activeTab}>
        <Tabs.List label={t('OAuth providers')}>
          {(Object.keys(PROVIDER_NAMES) as OAuthProviderId[]).map((provider) => (
            <Tabs.Tab key={provider} value={provider}>
              {PROVIDER_NAMES[provider]}
              {tabHasChanges(provider) ? (
                <Badge tone="warning">
                  <span className="sr-only">{t('Unsaved changes')}</span>
                  <span aria-hidden="true">•</span>
                </Badge>
              ) : null}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {/* ---------------------------------------------------------------- GitHub */}
        <Tabs.Panel className="flex flex-col gap-5 pt-1" value="github">
          <CallbackGuide
            description={t('Register these two values in the provider’s OAuth application before turning the switch on.')}
            rows={[
              { copyLabel: t('Copy the homepage URL'), label: t('Homepage URL'), value: siteUrl },
              {
                copyLabel: t('Copy the callback URL'),
                label: t('Authorization callback URL'),
                value: buildCallbackUrl(serverAddress, 'github', ''),
              },
            ]}
            siteUrlMissing={siteUrlMissing}
          />

          <SwitchRow
            checked={values.GitHubOAuthEnabled}
            description={t('Let users sign in and register with a GitHub account.')}
            disabled={disabled}
            label={t('Enable GitHub sign-in')}
            onCheckedChange={(checked) => form.setField('GitHubOAuthEnabled', checked)}
          />

          <div className="grid gap-5 md:grid-cols-2">
            <Input
              disabled={disabled}
              error={form.errors.GitHubClientId}
              invalid={form.errors.GitHubClientId !== undefined}
              label={t('GitHub client ID')}
              onChange={(event) => form.setField('GitHubClientId', event.target.value)}
              value={values.GitHubClientId}
            />
            <PasswordInput
              autoComplete="off"
              description={secretNote}
              disabled={disabled}
              label={t('GitHub client secret')}
              onChange={(event) => form.setField('GitHubClientSecret', event.target.value)}
              placeholder={t('Unchanged')}
              value={values.GitHubClientSecret}
            />
          </div>
        </Tabs.Panel>

        {/* --------------------------------------------------------------- Discord */}
        <Tabs.Panel className="flex flex-col gap-5 pt-1" value="discord">
          <CallbackGuide
            description={t('Register these two values in the provider’s OAuth application before turning the switch on.')}
            rows={[
              { copyLabel: t('Copy the homepage URL'), label: t('Homepage URL'), value: siteUrl },
              {
                copyLabel: t('Copy the callback URL'),
                label: t('Authorization callback URL'),
                value: buildCallbackUrl(serverAddress, 'discord', ''),
              },
            ]}
            siteUrlMissing={siteUrlMissing}
          />

          <SwitchRow
            checked={values['discord.enabled']}
            description={t('Let users sign in and register with a Discord account.')}
            disabled={disabled}
            label={t('Enable Discord sign-in')}
            onCheckedChange={(checked) => form.setField('discord.enabled', checked)}
          />

          <div className="grid gap-5 md:grid-cols-2">
            <Input
              disabled={disabled}
              error={form.errors['discord.client_id']}
              invalid={form.errors['discord.client_id'] !== undefined}
              label={t('Discord client ID')}
              onChange={(event) => form.setField('discord.client_id', event.target.value)}
              value={values['discord.client_id']}
            />
            <PasswordInput
              autoComplete="off"
              description={secretNote}
              disabled={disabled}
              label={t('Discord client secret')}
              onChange={(event) => form.setField('discord.client_secret', event.target.value)}
              placeholder={t('Unchanged')}
              value={values['discord.client_secret']}
            />
          </div>
        </Tabs.Panel>

        {/* ------------------------------------------------------------------ OIDC */}
        <Tabs.Panel className="flex flex-col gap-5 pt-1" value="oidc">
          <CallbackGuide
            description={t('Register these two values in the provider’s OAuth application before turning the switch on.')}
            rows={[
              { copyLabel: t('Copy the homepage URL'), label: t('Homepage URL'), value: siteUrl },
              {
                copyLabel: t('Copy the callback URL'),
                label: t('Authorization callback URL'),
                value: buildCallbackUrl(serverAddress, 'oidc', ''),
              },
            ]}
            siteUrlMissing={siteUrlMissing}
          />

          <SwitchRow
            checked={values['oidc.enabled']}
            description={t('Let users sign in through any OpenID Connect provider.')}
            disabled={disabled}
            label={t('Enable OIDC sign-in')}
            onCheckedChange={(checked) => form.setField('oidc.enabled', checked)}
          />

          <div className="grid gap-5 md:grid-cols-2">
            <Input
              disabled={disabled}
              error={form.errors['oidc.client_id']}
              invalid={form.errors['oidc.client_id'] !== undefined}
              label={t('OIDC client ID')}
              onChange={(event) => form.setField('oidc.client_id', event.target.value)}
              value={values['oidc.client_id']}
            />
            <PasswordInput
              autoComplete="off"
              description={secretNote}
              disabled={disabled}
              label={t('OIDC client secret')}
              onChange={(event) => form.setField('oidc.client_secret', event.target.value)}
              placeholder={t('Unchanged')}
              value={values['oidc.client_secret']}
            />
          </div>

          {discoveryError !== undefined ? (
            <Alert
              dismissLabel={t('Dismiss the discovery error')}
              dismissible
              icon={<TriangleAlertIcon aria-hidden="true" />}
              onDismiss={() => setDiscoveryError(undefined)}
              title={t('Could not read the discovery document')}
              tone="destructive"
            >
              {discoveryError}
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3">
            <Input
              description={t('Usually the issuer URL followed by /.well-known/openid-configuration.')}
              disabled={disabled}
              error={form.errors['oidc.well_known']}
              invalid={form.errors['oidc.well_known'] !== undefined}
              label={t('Discovery document URL')}
              onChange={(event) => form.setField('oidc.well_known', event.target.value)}
              placeholder="https://idp.example.com/.well-known/openid-configuration"
              value={values['oidc.well_known']}
            />
            <div>
              <Button
                aria-busy={discoveryBusy}
                disabled={disabled || discoveryBusy}
                onClick={() => void runDiscovery()}
                size="sm"
                variant="outline"
              >
                <DownloadCloudIcon aria-hidden="true" />
                {t('Fill the endpoints from discovery')}
              </Button>
              <p className="mt-2 text-xs leading-5 text-muted">
                {t('The server fetches the document, so a provider without permissive CORS headers still works. The three endpoints below are overwritten; nothing is saved until you press Save.')}
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <Input
              disabled={disabled}
              error={form.errors['oidc.authorization_endpoint']}
              invalid={form.errors['oidc.authorization_endpoint'] !== undefined}
              label={t('Authorization endpoint')}
              onChange={(event) => form.setField('oidc.authorization_endpoint', event.target.value)}
              value={values['oidc.authorization_endpoint']}
            />
            <Input
              disabled={disabled}
              error={form.errors['oidc.token_endpoint']}
              invalid={form.errors['oidc.token_endpoint'] !== undefined}
              label={t('Token endpoint')}
              onChange={(event) => form.setField('oidc.token_endpoint', event.target.value)}
              value={values['oidc.token_endpoint']}
            />
            <Input
              disabled={disabled}
              error={form.errors['oidc.user_info_endpoint']}
              invalid={form.errors['oidc.user_info_endpoint'] !== undefined}
              label={t('User info endpoint')}
              onChange={(event) => form.setField('oidc.user_info_endpoint', event.target.value)}
              value={values['oidc.user_info_endpoint']}
            />
          </div>
        </Tabs.Panel>

        {/* -------------------------------------------------------------- Telegram */}
        <Tabs.Panel className="flex flex-col gap-5 pt-1" value="telegram">
          <CallbackGuide
            description={t('Telegram uses a login widget rather than a redirect. Set the bot’s domain to this address with /setdomain in BotFather.')}
            rows={[{ copyLabel: t('Copy the homepage URL'), label: t('Bot domain'), value: siteUrl }]}
            siteUrlMissing={siteUrlMissing}
          />

          <SwitchRow
            checked={values.TelegramOAuthEnabled}
            description={t('Let users sign in through the Telegram login widget.')}
            disabled={disabled}
            label={t('Enable Telegram sign-in')}
            onCheckedChange={(checked) => form.setField('TelegramOAuthEnabled', checked)}
          />

          <div className="grid gap-5 md:grid-cols-2">
            <Input
              description={t('The bot’s username without the @. The sign-in page needs this to draw the widget; the server only checks the token.')}
              disabled={disabled}
              label={t('Telegram bot name')}
              onChange={(event) => form.setField('TelegramBotName', event.target.value)}
              value={values.TelegramBotName}
            />
            <PasswordInput
              autoComplete="off"
              description={secretNote}
              disabled={disabled}
              label={t('Telegram bot token')}
              onChange={(event) => form.setField('TelegramBotToken', event.target.value)}
              placeholder={t('Unchanged')}
              value={values.TelegramBotToken}
            />
          </div>
        </Tabs.Panel>

        {/* --------------------------------------------------------------- LinuxDO */}
        <Tabs.Panel className="flex flex-col gap-5 pt-1" value="linuxdo">
          <CallbackGuide
            description={t('Register these two values in the provider’s OAuth application before turning the switch on.')}
            rows={[
              { copyLabel: t('Copy the homepage URL'), label: t('Homepage URL'), value: siteUrl },
              {
                copyLabel: t('Copy the callback URL'),
                label: t('Authorization callback URL'),
                value: buildCallbackUrl(serverAddress, 'linuxdo', ''),
              },
            ]}
            siteUrlMissing={siteUrlMissing}
          />

          <SwitchRow
            checked={values.LinuxDOOAuthEnabled}
            description={t('Let users sign in with a LinuxDO forum account.')}
            disabled={disabled}
            label={t('Enable LinuxDO sign-in')}
            onCheckedChange={(checked) => form.setField('LinuxDOOAuthEnabled', checked)}
          />

          <div className="grid gap-5 md:grid-cols-2">
            <Input
              disabled={disabled}
              error={form.errors.LinuxDOClientId}
              invalid={form.errors.LinuxDOClientId !== undefined}
              label={t('LinuxDO client ID')}
              onChange={(event) => form.setField('LinuxDOClientId', event.target.value)}
              value={values.LinuxDOClientId}
            />
            <PasswordInput
              autoComplete="off"
              description={secretNote}
              disabled={disabled}
              label={t('LinuxDO client secret')}
              onChange={(event) => form.setField('LinuxDOClientSecret', event.target.value)}
              placeholder={t('Unchanged')}
              value={values.LinuxDOClientSecret}
            />
          </div>

          <NumberInput
            description={t('Sign-in is refused below this forum trust level. 0 accepts every account.')}
            disabled={disabled}
            error={form.errors.LinuxDOMinimumTrustLevel}
            invalid={form.errors.LinuxDOMinimumTrustLevel !== undefined}
            label={t('Minimum trust level')}
            min={0}
            onValueChange={(value) => form.setField('LinuxDOMinimumTrustLevel', value ?? Number.NaN)}
            step={1}
            value={values.LinuxDOMinimumTrustLevel}
          />
        </Tabs.Panel>

        {/* ---------------------------------------------------------------- WeChat */}
        <Tabs.Panel className="flex flex-col gap-5 pt-1" value="wechat">
          <SwitchRow
            checked={values.WeChatAuthEnabled}
            description={
              wechatSwitchBlocked
                ? t('Save the server address first. This setting is written before the address, so enabling it in the same save would be refused.')
                : t('Users scan a QR code and enter the verification code the WeChat server replies with.')
            }
            disabled={disabled || wechatSwitchBlocked}
            label={t('Enable WeChat sign-in')}
            onCheckedChange={(checked) => form.setField('WeChatAuthEnabled', checked)}
          />

          <div className="grid gap-5 md:grid-cols-2">
            <Input
              description={t('The address of your self-hosted WeChat server, which brokers the QR code exchange.')}
              disabled={disabled}
              error={form.errors.WeChatServerAddress}
              invalid={form.errors.WeChatServerAddress !== undefined}
              label={t('WeChat server address')}
              onChange={(event) => form.setField('WeChatServerAddress', event.target.value)}
              placeholder="https://wechat.example.com"
              value={values.WeChatServerAddress}
            />
            <PasswordInput
              autoComplete="off"
              description={secretNote}
              disabled={disabled}
              label={t('WeChat server token')}
              onChange={(event) => form.setField('WeChatServerToken', event.target.value)}
              placeholder={t('Unchanged')}
              value={values.WeChatServerToken}
            />
          </div>

          <Input
            description={t('Shown next to the QR code so users know which account they are following.')}
            disabled={disabled}
            label={t('Official account QR code image URL')}
            onChange={(event) => form.setField('WeChatAccountQRCodeImageURL', event.target.value)}
            value={values.WeChatAccountQRCodeImageURL}
          />
        </Tabs.Panel>
      </Tabs>
    </SettingsSection>
  )
}
