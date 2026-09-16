import { Link } from '@tanstack/react-router'

type AuthSwitchLinkProps = {
  /** The question in front of the link, e.g. "Already have an account?". Optional. */
  prompt?: string
  /** The link text, e.g. "Sign in". */
  action: string
  to: '/sign-in' | '/sign-up' | '/forgot-password'
}

/**
 * The "go to the other authentication page" footnote that closes every auth card.
 *
 * It is one component because the three pages had drifted into three treatments of the same
 * lockup: centred and 12px on sign-in, flush left and 14px on sign-up and forgot-password.
 * Sitting under a full-width submit button, the centred quiet version is the one that reads
 * as a footnote rather than as one more sentence of the form — so that is the one they all
 * use, and there is now only one place for it to drift from.
 */
export function AuthSwitchLink(props: AuthSwitchLinkProps) {
  return (
    <p className="text-center text-xs leading-5 text-muted">
      {props.prompt === undefined ? null : (
        <>
          {props.prompt}
          {' '}
        </>
      )}
      <Link
        className="font-semibold text-primary underline underline-offset-2 hover:text-primary-strong"
        to={props.to}
      >
        {props.action}
      </Link>
    </p>
  )
}
