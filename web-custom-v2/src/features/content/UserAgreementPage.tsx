import { useTranslation } from 'react-i18next'

import { ContentDocumentPage } from '@/features/content/ContentDocumentPage'

export function UserAgreementPage() {
  const { t } = useTranslation()

  return (
    <ContentDocumentPage
      description={t('The terms you accept by using this gateway.')}
      documentKey="user-agreement"
      emptyDescription={t(
        'An administrator has not published a user agreement for this deployment yet. It can be set from the system settings as a URL, HTML, Markdown or plain text.',
      )}
      emptyTitle={t('No user agreement has been published')}
      eyebrow={t('Legal')}
      title={t('User Agreement')}
    />
  )
}
