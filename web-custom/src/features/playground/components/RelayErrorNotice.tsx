import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/ui'
import {
  ADMIN_ROLE,
  LEGACY_MODEL_PRICING_PATH,
  MODEL_PRICE_ERROR_CODE,
} from '@/features/playground/constants'
import type { RelayError } from '@/features/playground/types'

type RelayErrorNoticeProps = {
  error: RelayError
  role: number | undefined
  onRetry?: () => void
}

/**
 * Explains a relay failure in terms the reader can act on.
 *
 * Every code below was produced by the live dev server, not guessed:
 *
 *   model_not_found   503  "No available channel for model X under group default"
 *                          — nothing serves the model; an admin must add a channel.
 *   model_price_error 400  "模型 X 的价格未配置" — admin-fixable, and only an admin can
 *                          fix it, so the settings link is gated on role >= 10.
 *   invalid_api_key   401  "Incorrect API key provided: sk-probe" — the CHANNEL's
 *                          upstream key is wrong. Emphatically NOT the reader's console
 *                          session, which is why this page never routes through the
 *                          axios interceptor that would log them out here.
 *   invalid_request   400  "field messages is required"
 *   (empty code)           "No permission to access this group"
 */
export function RelayErrorNotice(props: RelayErrorNoticeProps) {
  const { t } = useTranslation()
  const { code } = props.error
  const isAdmin = props.role !== undefined && props.role >= ADMIN_ROLE

  const guidance = (() => {
    if (code === 'model_not_found') {
      return t('No channel in this group can serve this model. Pick another model, or ask an administrator to add a channel for it.')
    }
    if (code === MODEL_PRICE_ERROR_CODE) {
      return isAdmin
        ? t('This model has no price configured, so the request was refused before it reached a channel. Set its price in the legacy system settings.')
        : t('This model has no price configured, so the request was refused before it reached a channel. An administrator needs to set its price.')
    }
    if (code === 'invalid_api_key') {
      return t('The upstream provider rejected the channel’s API key. Your console session is fine — this is a channel configuration problem for an administrator.')
    }
    if (code === 'invalid_request') {
      return t('The relay rejected the request as malformed. Check the model name and parameters in the side panel.')
    }
    return undefined
  })()

  return (
    <Alert
      className="mt-1"
      title={t('The model did not answer')}
      tone="destructive"
      action={
        props.onRetry ? (
          <button
            className="text-xs font-semibold text-destructive underline underline-offset-2"
            onClick={props.onRetry}
            type="button"
          >
            {t('Try again')}
          </button>
        ) : undefined
      }
    >
      <p className="break-words text-sm leading-6">{props.error.message}</p>

      {guidance ? <p className="mt-2 text-xs leading-5 text-muted">{guidance}</p> : null}

      {code === MODEL_PRICE_ERROR_CODE && isAdmin ? (
        <p className="mt-2 text-xs">
          {/*
            A full-page anchor, not a router Link: model pricing lives on the LEGACY
            console. `router/web-router.go` serves every path outside the custom
            console's whitelist from the old frontend, and /system-settings is not on
            that whitelist.
          */}
          <a
            className="font-semibold text-primary underline underline-offset-2"
            href={LEGACY_MODEL_PRICING_PATH}
          >
            {t('Open model pricing settings')}
          </a>
        </p>
      ) : null}

      {code === '' ? null : (
        <p className="eyebrow mt-3">
          {t('Error code')}
          {': '}
          <span className="mono normal-case">{code}</span>
          {props.error.status === undefined ? null : (
            <>
              {' · HTTP '}
              <span className="mono">{props.error.status}</span>
            </>
          )}
        </p>
      )}
    </Alert>
  )
}
