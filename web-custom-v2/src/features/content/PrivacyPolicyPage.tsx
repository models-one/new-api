import { useTranslation } from 'react-i18next'

import { ContentDocumentPage } from '@/features/content/ContentDocumentPage'

export function PrivacyPolicyPage() {
  const { t } = useTranslation()

  return (
    <ContentDocumentPage
      description={t('How this deployment collects, stores and uses your data.')}
      documentKey="privacy-policy"
      emptyDescription={t(
        'An administrator has not published a privacy policy for this deployment yet. It can be set from the system settings as a URL, HTML, Markdown or plain text.',
      )}
      emptyTitle={t('No privacy policy has been published')}
      eyebrow={t('Legal')}
      title={t('Privacy Policy')}
    />
  )
}
