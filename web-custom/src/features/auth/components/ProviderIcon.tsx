import CircleUserRoundIcon from 'lucide-react/dist/esm/icons/circle-user-round'
import GithubIcon from 'lucide-react/dist/esm/icons/github'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import MessageCircleIcon from 'lucide-react/dist/esm/icons/message-circle'
import QrCodeIcon from 'lucide-react/dist/esm/icons/qr-code'
import SendIcon from 'lucide-react/dist/esm/icons/send'
import type { ComponentType, SVGProps } from 'react'

import type { OAuthProviderIcon } from '@/features/auth/oauth-providers'

/**
 * Decorative marks for the provider buttons.
 *
 * These are the console's own icon set, not vendor logos: shipping a brand mark
 * we did not license — and could only reproduce from memory — is worse than a
 * neutral glyph. The button label carries the meaning; every mark is aria-hidden.
 */
const icons: Record<OAuthProviderIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  github: GithubIcon,
  discord: MessageCircleIcon,
  linuxdo: CircleUserRoundIcon,
  telegram: SendIcon,
  wechat: QrCodeIcon,
  generic: KeyRoundIcon,
}

export function ProviderIcon(props: { icon: OAuthProviderIcon; className?: string }) {
  const Icon = icons[props.icon]
  return <Icon aria-hidden="true" className={props.className} />
}
