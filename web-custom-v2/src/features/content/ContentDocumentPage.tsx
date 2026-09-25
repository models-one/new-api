import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/system/EmptyState'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { Skeleton } from '@/components/ui/Skeleton'
import { contentDocumentQuery, type ContentDocumentKey } from '@/features/content/api'
import { DocumentBody } from '@/features/content/components/DocumentBody'
import { PublicPageFrame } from '@/features/content/components/PublicPageFrame'

type ContentDocumentPageProps = {
  documentKey: ContentDocumentKey
  eyebrow: string
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
  /** Extra content rendered under the empty state, e.g. attribution. */
  emptyFooter?: ReactNode
}

/**
 * One admin-configurable public document. The three content routes differ only in copy and
 * in which endpoint they read, so they all render through here.
 */
export function ContentDocumentPage(props: ContentDocumentPageProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch, isFetching } = useQuery(
    contentDocumentQuery(props.documentKey),
  )

  const content = (data ?? '').trim()

  function renderBody(): ReactNode {
    if (isPending) {
      return (
        <Panel>
          <Panel.Body>
            <Skeleton label={t('Loading document')} lines={6} />
          </Panel.Body>
        </Panel>
      )
    }

    if (isError) {
      return (
        <Alert
          action={
            <Button
              aria-busy={isFetching}
              disabled={isFetching}
              onClick={() => void refetch()}
              size="sm"
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon />}
          title={t('This document could not be loaded.')}
          tone="destructive"
        >
          {t('The server did not answer the request for this page.')}
        </Alert>
      )
    }

    if (content === '') {
      return (
        <Panel>
          <EmptyState description={props.emptyDescription} title={props.emptyTitle} />
          {props.emptyFooter ? <Panel.Body>{props.emptyFooter}</Panel.Body> : null}
        </Panel>
      )
    }

    return (
      <Panel>
        <Panel.Body>
          <DocumentBody content={content} title={props.title} />
        </Panel.Body>
      </Panel>
    )
  }

  return (
    <PublicPageFrame mainLabel={props.title}>
      <PageHeader description={props.description} eyebrow={props.eyebrow} title={props.title} />
      <div className="mt-8">{renderBody()}</div>
    </PublicPageFrame>
  )
}
