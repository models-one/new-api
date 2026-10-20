import MoonIcon from 'lucide-react/dist/esm/icons/moon'
import SunIcon from 'lucide-react/dist/esm/icons/sun'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui'
import { setTheme, useTheme } from '@/lib/theme'

/** Switches the whole site between light and dark; shown in every header. */
export function ThemeToggle(props: { className?: string }) {
  const { t } = useTranslation()
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = next === 'dark' ? t('Switch to dark theme') : t('Switch to light theme')

  return (
    <Button
      aria-label={label}
      className={props.className}
      onClick={() => setTheme(next)}
      size="icon-md"
      title={label}
      variant="quiet"
    >
      {next === 'dark' ? <MoonIcon aria-hidden="true" /> : <SunIcon aria-hidden="true" />}
    </Button>
  )
}
