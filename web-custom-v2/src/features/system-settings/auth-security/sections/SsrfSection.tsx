import { useQuery } from '@tanstack/react-query'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import ShieldOffIcon from 'lucide-react/dist/esm/icons/shield-off'
import { useTranslation } from 'react-i18next'

import { RadioGroup, SwitchRow, Textarea } from '@/components/form'
import { Alert } from '@/components/ui'
import {
  serializeStringList,
  splitLines,
  validateDomainEntries,
  validateIpEntries,
  validatePortEntries,
} from '@/features/system-settings/auth-security/validation'
import { useValidationMessages } from '@/features/system-settings/auth-security/validation-messages'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionStringList,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/security/ssrf` — what the gateway is allowed to fetch on a user's behalf.
 *
 * Eight keys, all verified present in `GET /api/option/`:
 *
 *   fetch_setting.enable_ssrf_protection    'true'
 *   fetch_setting.allow_private_ip          'false'
 *   fetch_setting.domain_filter_mode        'false'
 *   fetch_setting.ip_filter_mode            'false'
 *   fetch_setting.domain_list               '[]'
 *   fetch_setting.ip_list                   '[]'
 *   fetch_setting.allowed_ports             '["80","443","8080","8443"]'
 *   fetch_setting.apply_ip_filter_for_domain 'true'
 *
 * THE THREE LISTS ARE JSON ARRAYS OF STRINGS, and `allowed_ports` is the one that catches
 * people out: it holds STRINGS because an entry may be a range such as `"8000-9000"`
 * (`common.parsePortRanges`). The legacy console wrote numbers — `[80,443]` — which
 * `json.Unmarshal` cannot put into a `[]string`, and `config.updateConfigFromMap` swallows
 * that error with a bare `continue`. The row is stored, the payload echoes it back, and the
 * running gateway keeps the OLD port list forever. Verified live: writing `[80,443]` is
 * accepted with `success:true`. Everything here writes strings.
 *
 * NOTHING SERVER-SIDE VALIDATES THESE. `PUT fetch_setting.allowed_ports = "nope"` answers
 * `success:true` (verified). The validation in this section is the only validation there is.
 *
 * THE TWO FILTER MODES ARE THE DANGEROUS PART. `false` is a DENY list and `true` is an
 * ALLOW list, and switching to allow-list with an empty list blocks every outbound fetch:
 * `isDomainListed` returns false for an empty list, and allow-list mode returns that value
 * directly. That would break image downloads, Midjourney callbacks and channel tests all at
 * once, so the section explains each mode in words and warns before it can happen.
 */

type SsrfDraft = {
  'fetch_setting.enable_ssrf_protection': boolean
  'fetch_setting.allow_private_ip': boolean
  'fetch_setting.apply_ip_filter_for_domain': boolean
  'fetch_setting.domain_filter_mode': boolean
  'fetch_setting.ip_filter_mode': boolean
  'fetch_setting.domain_list': string
  'fetch_setting.ip_list': string
  'fetch_setting.allowed_ports': string
}

function toDraft(options: SystemOptionMap | undefined): SsrfDraft {
  return {
    'fetch_setting.allow_private_ip': readOptionBoolean(options, 'fetch_setting.allow_private_ip'),
    'fetch_setting.allowed_ports': readOptionStringList(
      options,
      'fetch_setting.allowed_ports',
      'json',
    ).join('\n'),
    'fetch_setting.apply_ip_filter_for_domain': readOptionBoolean(
      options,
      'fetch_setting.apply_ip_filter_for_domain',
      true,
    ),
    'fetch_setting.domain_filter_mode': readOptionBoolean(options, 'fetch_setting.domain_filter_mode'),
    'fetch_setting.domain_list': readOptionStringList(options, 'fetch_setting.domain_list', 'json').join('\n'),
    'fetch_setting.enable_ssrf_protection': readOptionBoolean(
      options,
      'fetch_setting.enable_ssrf_protection',
      true,
    ),
    'fetch_setting.ip_filter_mode': readOptionBoolean(options, 'fetch_setting.ip_filter_mode'),
    'fetch_setting.ip_list': readOptionStringList(options, 'fetch_setting.ip_list', 'json').join('\n'),
  }
}

/** Every list leaves as a JSON array of strings — see the file header for why. */
const serializeSsrf = {
  'fetch_setting.allowed_ports': (value: string | number | boolean) => serializeStringList(String(value)),
  'fetch_setting.domain_list': (value: string | number | boolean) => serializeStringList(String(value)),
  'fetch_setting.ip_list': (value: string | number | boolean) => serializeStringList(String(value)),
}

export function SsrfSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())
  const messages = useValidationMessages()

  const form = useOptionSectionForm<SsrfDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeSsrf,
    validate: (values) => {
      const errors: Partial<Record<keyof SsrfDraft & string, string>> = {}

      const portError = validatePortEntries(splitLines(values['fetch_setting.allowed_ports']))
      if (portError !== undefined) errors['fetch_setting.allowed_ports'] = messages[portError]

      const domainEntries = splitLines(values['fetch_setting.domain_list'])
      const domainError = validateDomainEntries(domainEntries)
      if (domainError !== undefined) errors['fetch_setting.domain_list'] = messages[domainError]
      else if (values['fetch_setting.domain_filter_mode'] && domainEntries.length === 0) {
        const message = t('An allow list with nothing in it blocks every host. Add a domain, or switch this filter back to a deny list.')
        // BOTH keys, and that is not redundancy. `useOptionSectionForm` blocks a save only
        // when a key it is ABOUT TO WRITE carries an error, so flipping the mode to "allow"
        // with an untouched empty list would otherwise sail straight through: the only
        // dirty key is the mode, and the error would be sitting on the list. The server
        // does not validate this either, so the write would land and every outbound fetch
        // would start failing. The message is rendered under the list, where the fix is.
        errors['fetch_setting.domain_list'] = message
        errors['fetch_setting.domain_filter_mode'] = message
      }

      const ipEntries = splitLines(values['fetch_setting.ip_list'])
      const ipError = validateIpEntries(ipEntries)
      if (ipError !== undefined) errors['fetch_setting.ip_list'] = messages[ipError]
      else if (values['fetch_setting.ip_filter_mode'] && ipEntries.length === 0) {
        const message = t('An allow list with nothing in it blocks every address. Add an entry, or switch this filter back to a deny list.')
        errors['fetch_setting.ip_list'] = message
        errors['fetch_setting.ip_filter_mode'] = message
      }

      return errors
    },
  })

  const values = form.values
  const disabled = optionsQuery.isPending || form.isSaving
  const protectionOn = values['fetch_setting.enable_ssrf_protection']

  const modeOptions = (kind: 'domain' | 'ip') => [
    {
      description:
        kind === 'domain'
          ? t('Everything is allowed except the domains listed below.')
          : t('Everything is allowed except the addresses listed below.'),
      label: t('Deny list'),
      value: 'deny',
    },
    {
      description:
        kind === 'domain'
          ? t('Nothing is allowed except the domains listed below. An empty list blocks every host.')
          : t('Nothing is allowed except the addresses listed below. An empty list blocks every address.'),
      label: t('Allow list'),
      value: 'allow',
    },
  ]

  return (
    <SettingsSection
      description={t('Which hosts, addresses and ports the gateway may open a connection to when a request asks it to fetch something.')}
      form={form}
      note={t('These rules cover fetches the gateway makes on a user’s behalf — downloading an image or a file given by URL, calling a Midjourney callback, proxying a video. They do not restrict the upstream provider addresses configured on channels.')}
      saveMode="section"
      title={t('SSRF protection')}
    >
      {!protectionOn ? (
        <Alert icon={<ShieldOffIcon aria-hidden="true" />} title={t('Outbound fetches are unrestricted')} tone="destructive">
          {t('With protection off, a user who can make the gateway fetch a URL can reach anything this server can reach — internal services, cloud metadata endpoints on 169.254.169.254, databases on the private network. Every rule below is ignored. Turn this back on unless you have a specific, temporary reason.')}
        </Alert>
      ) : null}

      {protectionOn && values['fetch_setting.allow_private_ip'] ? (
        <Alert icon={<ShieldAlertIcon aria-hidden="true" />} live="status" title={t('Private addresses are reachable')} tone="warning">
          {t('Loopback, link-local and RFC 1918 ranges are allowed, which includes the cloud metadata service. Only do this when the gateway genuinely has to reach something on its own network.')}
        </Alert>
      ) : null}

      <div className="flex flex-col">
        <SwitchRow
          checked={protectionOn}
          description={t('Check the destination of every outbound fetch against the rules below.')}
          disabled={disabled}
          label={t('Protect against server-side request forgery')}
          onCheckedChange={(checked) => form.setField('fetch_setting.enable_ssrf_protection', checked)}
        />
        <SwitchRow
          checked={values['fetch_setting.allow_private_ip']}
          description={t('Allow addresses on private, loopback and link-local ranges. Off is the safe setting.')}
          disabled={disabled || !protectionOn}
          label={t('Allow private addresses')}
          onCheckedChange={(checked) => form.setField('fetch_setting.allow_private_ip', checked)}
        />
        <SwitchRow
          checked={values['fetch_setting.apply_ip_filter_for_domain']}
          description={t('Resolve each hostname and check the address it points at as well, so a domain cannot be pointed at a private address to get around the rules.')}
          disabled={disabled || !protectionOn}
          label={t('Also check where a hostname resolves')}
          onCheckedChange={(checked) =>
            form.setField('fetch_setting.apply_ip_filter_for_domain', checked)
          }
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <RadioGroup
            disabled={disabled || !protectionOn}
            label={t('Domain filter')}
            name="ssrf-domain-mode"
            onValueChange={(value) => form.setField('fetch_setting.domain_filter_mode', value === 'allow')}
            options={modeOptions('domain')}
            value={values['fetch_setting.domain_filter_mode'] ? 'allow' : 'deny'}
          />
          <Textarea
            description={t('One domain per line. Use *.example.com to include every subdomain.')}
            disabled={disabled || !protectionOn}
            error={form.errors['fetch_setting.domain_list']}
            invalid={form.errors['fetch_setting.domain_list'] !== undefined}
            label={t('Domain list')}
            onChange={(event) => form.setField('fetch_setting.domain_list', event.target.value)}
            placeholder={'example.com\n*.cdn.example.com'}
            rows={6}
            value={values['fetch_setting.domain_list']}
          />
        </div>

        <div className="flex flex-col gap-3">
          <RadioGroup
            disabled={disabled || !protectionOn}
            label={t('IP filter')}
            name="ssrf-ip-mode"
            onValueChange={(value) => form.setField('fetch_setting.ip_filter_mode', value === 'allow')}
            options={modeOptions('ip')}
            value={values['fetch_setting.ip_filter_mode'] ? 'allow' : 'deny'}
          />
          <Textarea
            description={t('One address or CIDR block per line, for example 203.0.113.7 or 203.0.113.0/24.')}
            disabled={disabled || !protectionOn}
            error={form.errors['fetch_setting.ip_list']}
            invalid={form.errors['fetch_setting.ip_list'] !== undefined}
            label={t('IP list')}
            onChange={(event) => form.setField('fetch_setting.ip_list', event.target.value)}
            placeholder={'203.0.113.0/24'}
            rows={6}
            value={values['fetch_setting.ip_list']}
          />
        </div>
      </div>

      <Textarea
        description={t('One port or range per line, for example 443 or 8000-9000. An empty list allows every port.')}
        disabled={disabled || !protectionOn}
        error={form.errors['fetch_setting.allowed_ports']}
        invalid={form.errors['fetch_setting.allowed_ports'] !== undefined}
        label={t('Allowed ports')}
        onChange={(event) => form.setField('fetch_setting.allowed_ports', event.target.value)}
        placeholder={'80\n443\n8000-9000'}
        rows={5}
        value={values['fetch_setting.allowed_ports']}
      />
    </SettingsSection>
  )
}
