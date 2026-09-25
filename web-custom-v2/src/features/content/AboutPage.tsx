import { useTranslation } from 'react-i18next'

import { ContentDocumentPage } from '@/features/content/ContentDocumentPage'

export function AboutPage() {
  const { t } = useTranslation()

  return (
    <ContentDocumentPage
      description={t('What this gateway is, who runs it, and how to reach them.')}
      documentKey="about"
      emptyDescription={t(
        'An administrator has not published an about page for this deployment yet. It can be set from the system settings as a URL, HTML, Markdown or plain text.',
      )}
      emptyFooter={
        <p className="text-xs leading-6 text-muted">
          {t('This console runs on New API, distributed under the AGPL v3.0 license.')}{' '}
          <a
            className="font-semibold text-primary underline underline-offset-2 hover:text-primary-strong"
            href="https://github.com/QuantumNous/new-api"
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('View the project source')}
          </a>
        </p>
      }
      emptyTitle={t('No about page has been published')}
      eyebrow={t('Information')}
      title={t('About')}
    />
  )
}
