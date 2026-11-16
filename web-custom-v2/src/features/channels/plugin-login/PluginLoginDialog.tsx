import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import CircleCheckIcon from 'lucide-react/dist/esm/icons/circle-check'
import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'

import { Input, PasswordInput, Textarea } from '@/components/form'
import { Dialog, toErrorMessage } from '@/components/overlay'
import { Alert, Button, CopyButton, Spinner } from '@/components/ui'
import type { PluginCredentialSummary, PluginLoginField, PluginLoginInput } from '@/features/channels/api'
import { localizedText } from '@/features/task-plugins/presentation'
import { formatDateTime } from '@/lib/format'

import { isHttpUrl, readPluginLoginRedirect } from './plugin-login'
import { usePluginLogin } from './use-plugin-login'

const FORM_ID = 'plugin-login-form'

export type PluginLoginTarget = {
  channelId: number
  /** null logs in a new credential; an index logs in again on that line. */
  keyIndex: number | null
  /** Keeps a single-key channel's account and adds the new one next to it. */
  add?: boolean
  pluginName: string
}

type PluginLoginDialogProps = {
  target: PluginLoginTarget
  onClose: () => void
  onDone?: () => void
}

/**
 * Logs a channel in to its provider through the plugin's own login (redirect, paste,
 * device code or fields). Mounted once per login, so each opening starts one flow.
 */
export function PluginLoginDialog(props: PluginLoginDialogProps) {
  const { i18n, t } = useTranslation()
  const login = usePluginLogin({
    add: props.target.add,
    channelId: props.target.channelId,
    keyIndex: props.target.keyIndex,
    onDone: props.onDone,
  })
  const ended = login.state.ended
  // A login the server ended keeps only its error and Start again on screen.
  const step = ended ? null : login.state.step
  const busy = login.state.status === 'busy'
  const failed = login.state.status === 'failed'
  const name = props.target.pluginName

  let body: ReactNode = null
  if (step?.type === 'redirect') {
    body = <RedirectStep url={step.url} />
  } else if (step?.type === 'paste') {
    body = <PasteStep disabled={busy} hint={localizedText(step.hint, i18n.language)} onSubmit={login.submit} url={step.url} />
  } else if (step?.type === 'device') {
    body = (
      <DeviceStep
        secondsLeft={login.secondsLeft}
        userCode={step.user_code}
        verificationUri={step.verification_uri}
        verificationUriComplete={step.verification_uri_complete}
      />
    )
  } else if (step?.type === 'pending') {
    body = <Waiting message={t('Waiting for you to confirm...')} />
  } else if (step?.type === 'fields') {
    body = <FieldsStep disabled={busy} fields={step.fields} key={step.fields.map((field) => field.name).join('\n')} onSubmit={login.submit} />
  } else if (step?.type === 'done') {
    body = <PluginCredentialDetails credential={step.credential} />
  } else if (!failed) {
    body = <Waiting message={t('Loading…')} />
  }

  let problem: ReactNode = null
  if (login.expired && !ended) {
    problem = (
      <Alert
        action={
          <Button onClick={login.restart} size="sm" variant="outline">
            {t('Start again')}
          </Button>
        }
        icon={<TriangleAlertIcon aria-hidden="true" />}
        title={t('The code has expired')}
        tone="destructive"
      />
    )
  } else if (failed) {
    problem = (
      <Alert
        action={
          <Button onClick={ended ? login.restart : login.retry} size="sm" variant="outline">
            {ended ? t('Start again') : t('Retry')}
          </Button>
        }
        icon={<TriangleAlertIcon aria-hidden="true" />}
        title={t('Login failed')}
        tone="destructive"
      >
        {toErrorMessage(login.state.error, t('Login failed'))}
      </Alert>
    )
  }

  const takesInput = step?.type === 'paste' || step?.type === 'fields'
  let footer: ReactNode = (
    <Button onClick={props.onClose} variant="outline">
      {t('Cancel')}
    </Button>
  )
  if (step?.type === 'done') {
    footer = (
      <Button onClick={props.onClose} variant="primary">
        {t('Done')}
      </Button>
    )
  } else if (takesInput) {
    footer = (
      <>
        {footer}
        <Button aria-busy={busy} disabled={busy} form={FORM_ID} type="submit" variant="primary">
          {t('Continue')}
        </Button>
      </>
    )
  }

  return (
    <Dialog
      footer={footer}
      onOpenChange={(open) => (open ? undefined : props.onClose())}
      open
      size="sm"
      title={props.target.keyIndex === null ? t('Log in to {{name}}', { name }) : t('Log in again to {{name}}', { name })}
    >
      <div className="flex flex-col gap-4">
        {body}
        {problem}
      </div>
    </Dialog>
  )
}

function Waiting(props: { message: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status">
      <Spinner decorative size="sm" />
      {props.message}
    </p>
  )
}

/** Vendor pages open in a new tab that keeps no reference to this one. */
function VendorLink(props: { url: string; label: string }) {
  if (!isHttpUrl(props.url)) return null
  return (
    <a
      className="inline-flex w-fit items-center gap-2 rounded-[4px] border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-surface-high"
      href={props.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <ExternalLinkIcon aria-hidden="true" className="size-4" />
      {props.label}
    </a>
  )
}

/** The account and expiry of a credential that finished logging in. */
export function PluginCredentialDetails(props: { credential?: PluginCredentialSummary }) {
  const { i18n, t } = useTranslation()
  const credential = props.credential
  const name = credential?.label || credential?.account_id
  const account = credential?.account_id && credential.account_id !== name ? credential.account_id : undefined
  return (
    <div className="flex items-start gap-3">
      <CircleCheckIcon aria-hidden="true" className="mt-0.5 size-5 text-success" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-foreground">{t('Logged in')}</p>
        {name ? <p className="text-sm break-all">{name}</p> : null}
        {account ? (
          <p className="text-xs break-all text-muted">
            {t('Account ID')}: {account}
          </p>
        ) : null}
        {credential?.expires_at ? (
          <p className="text-xs text-muted">{t('Expires {{time}}', { time: formatDateTime(credential.expires_at, i18n.language) })}</p>
        ) : null}
      </div>
    </div>
  )
}

function RedirectStep(props: { url: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{t('Sign in on the provider page in a new tab. This dialog updates when you finish.')}</p>
      <VendorLink label={t('Open sign-in page')} url={props.url} />
      <Waiting message={t('Waiting for sign-in...')} />
    </div>
  )
}

function PasteStep(props: { url: string; hint: string; disabled: boolean; onSubmit: (input: PluginLoginInput) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string>()
  const redirect = readPluginLoginRedirect(props.url)
  // The vendor appends its parameters to the redirect address it was given.
  const example = redirect ? `${redirect}${redirect.includes('?') ? '&' : '?'}code=...&state=...` : undefined

  function submit(event: FormEvent) {
    event.preventDefault()
    const address = value.trim()
    if (address === '') {
      setError(t('Paste the full address from the address bar'))
      return
    }
    props.onSubmit({ callback_url: address })
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal space-y-3 ps-5 text-sm">
        <li>
          {t('Open the sign-in page and sign in.')}
          <div className="mt-2">
            <VendorLink label={t('Open sign-in page')} url={props.url} />
          </div>
        </li>
        <li>
          {t('After sign-in, the browser goes to a page that may not load. That is expected.')}
          {redirect ? (
            <div className="mt-2 flex flex-col items-start gap-1">
              {t("That page's address starts with:")}
              <code className="rounded bg-surface-high px-1.5 py-0.5 break-all">{redirect}</code>
            </div>
          ) : null}
        </li>
        <li>{t("Copy the full address from that page's address bar and paste it below.")}</li>
      </ol>
      {props.hint === '' ? null : <p className="text-sm text-muted">{props.hint}</p>}
      <form id={FORM_ID} noValidate onSubmit={submit}>
        <Textarea
          autoComplete="off"
          disabled={props.disabled}
          error={error}
          inputMode="url"
          label={t('Address after sign-in')}
          onChange={(event) => {
            setValue(event.target.value)
            setError(undefined)
          }}
          placeholder={example}
          required
          rows={3}
          spellCheck={false}
          textareaClassName="font-mono break-all"
          value={value}
        />
      </form>
    </div>
  )
}

function DeviceStep(props: { userCode: string; verificationUri: string; verificationUriComplete?: string; secondsLeft: number | null }) {
  const { t } = useTranslation()
  // The dialog shows the expiry and a way to start again.
  const expired = props.secondsLeft === 0
  let countdown = ''
  if (props.secondsLeft !== null && !expired) {
    const minutes = Math.floor(props.secondsLeft / 60)
    const seconds = String(props.secondsLeft % 60).padStart(2, '0')
    countdown = `${minutes}:${seconds}`
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{t('Open the verification page and enter this code.')}</p>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-high/40 px-4 py-3">
        <span className="font-mono text-2xl font-semibold tracking-widest break-all">{props.userCode}</span>
        <CopyButton label={t('Copy code')} value={props.userCode} />
      </div>
      <div className="flex flex-col gap-1">
        <VendorLink label={t('Open verification page')} url={props.verificationUriComplete || props.verificationUri} />
        {isHttpUrl(props.verificationUri) ? <span className="text-xs break-all text-muted">{props.verificationUri}</span> : null}
      </div>
      {countdown === '' ? null : <p className="text-sm text-muted tabular-nums">{t('Code expires in {{time}}', { time: countdown })}</p>}
      {expired ? null : <Waiting message={t('Waiting for you to confirm...')} />}
    </div>
  )
}

function FieldsStep(props: { fields: PluginLoginField[]; disabled: boolean; onSubmit: (input: PluginLoginInput) => void }) {
  const { i18n, t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(props.fields.map((field) => [field.name, ''])))
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set())

  function submit(event: FormEvent) {
    event.preventDefault()
    const empty = new Set(props.fields.filter((field) => field.required && (values[field.name] ?? '').trim() === '').map((field) => field.name))
    setMissing(empty)
    if (empty.size > 0) return
    props.onSubmit({ fields: values })
  }

  return (
    <form className="flex flex-col gap-4" id={FORM_ID} noValidate onSubmit={submit}>
      {props.fields.map((field) => {
        const shared = {
          description: localizedText(field.description, i18n.language) || undefined,
          disabled: props.disabled,
          error: missing.has(field.name) ? t('This field is required') : undefined,
          label: localizedText(field.label, i18n.language) || field.name,
          onChange: (event: { target: { value: string } }) => setValues((current) => ({ ...current, [field.name]: event.target.value })),
          placeholder: localizedText(field.placeholder, i18n.language) || undefined,
          required: field.required,
          // Values are credentials: no autofill, no spellcheck service.
          spellCheck: false,
          value: values[field.name] ?? '',
        }
        if (field.type === 'password') return <PasswordInput key={field.name} {...shared} autoComplete="new-password" />
        if (field.type === 'textarea') return <Textarea key={field.name} {...shared} autoComplete="off" rows={5} textareaClassName="font-mono text-xs" />
        return <Input key={field.name} {...shared} autoComplete="off" />
      })}
    </form>
  )
}
