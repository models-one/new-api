import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link'

import { Alert, Button } from '@/components/ui'
import { renderDocumentMarkdown, replyProseClasses } from '@/features/playground/markdown'
import { cn } from '@/lib/utils'

import { findMarketplaceVersion } from '../lib/marketplace'
import { fetchPluginChangelog, type ChangelogCategory } from '../lib/plugin-changelog'
import { documentLocale, PluginDocumentFormatError } from '../lib/plugin-document'
import { describePluginDocumentProblem } from '../lib/plugin-document-problem'
import { fetchPluginReadme } from '../lib/plugin-readme'
import type { MarketplacePlugin } from '../types'

type PluginDocumentProps = {
  indexUrl: string
  plugin: MarketplacePlugin
  version: string
}

const DOCUMENT_STALE_MS = 15 * 60_000

const CHANGELOG_CATEGORY_LABELS: Record<ChangelogCategory, string> = {
  Added: 'Added',
  Changed: 'Changed',
  Deprecated: 'Deprecated',
  Fixed: 'Fixed',
  Migration: 'Migration notes',
  Removed: 'Removed',
  Security: 'Security',
}

/**
 * Markdown from a plugin's repository. The libs refuse a document with raw HTML or
 * images before it gets here, and `renderDocumentMarkdown` sanitizes what is left under
 * the model-output policy, so nothing in it can run or load in the console's origin.
 */
function DocumentMarkdown(props: { markdown: string; sourceUrl: string; locale: string; className?: string }) {
  const html = useMemo(() => renderDocumentMarkdown(props.markdown, props.sourceUrl), [props.markdown, props.sourceUrl])
  return (
    <div
      className={cn(replyProseClasses, 'min-w-0 break-words', props.className)}
      // Sanitized by `renderDocumentMarkdown`: no raw HTML, no images, hardened links.
      dangerouslySetInnerHTML={{ __html: html }}
      lang={props.locale}
    />
  )
}

function SourceLink(props: { href: string; label: string }) {
  return (
    <a
      className="inline-flex items-center gap-1.5 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
      href={props.href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
      {props.label}
    </a>
  )
}

/** The selected version's usage guide (README.md), in the reader's language when it has one. */
export function PluginReadmeSection(props: PluginDocumentProps) {
  const { i18n, t } = useTranslation()
  const locale = documentLocale(i18n.language)
  const readme = findMarketplaceVersion(props.plugin, props.version)?.readme
  const query = useQuery({
    enabled: readme !== undefined,
    queryFn: ({ signal }) => fetchPluginReadme({ ...props, language: locale, signal }),
    queryKey: ['task-plugins', 'marketplace-readme', props.indexUrl, props.plugin.key, props.version, readme?.path, readme?.sha256, locale] as const,
    retry: false,
    staleTime: DOCUMENT_STALE_MS,
  })

  if (readme && query.data) {
    return (
      <section aria-label={t('Usage guide')} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-4">
        {locale !== 'en' && query.data.locale === 'en' ? (
          <p className="text-xs text-muted" role="status">
            {t('This usage guide is not available in your language. Showing English.')}
          </p>
        ) : null}
        <DocumentMarkdown locale={query.data.locale} markdown={query.data.markdown} sourceUrl={query.data.sourceUrl} />
      </section>
    )
  }
  if (readme && query.isPending) return <p className="text-sm text-muted">{t('Loading…')}</p>
  if (query.error instanceof PluginDocumentFormatError) {
    return (
      <p className="text-xs leading-relaxed text-muted">
        {t('Could not show the usage guide. {{problem}}', { problem: describePluginDocumentProblem(t, query.error) })}{' '}
        <SourceLink href={query.error.sourceUrl} label={t('View source file')} />
      </p>
    )
  }
  if (query.isError) {
    return (
      <Alert
        action={
          <Button onClick={() => void query.refetch()} size="sm" variant="outline">
            {t('Try again')}
          </Button>
        }
        tone="destructive"
      >
        {t('Could not load the usage guide')}
      </Alert>
    )
  }
  return <p className="text-xs text-muted">{t('No usage guide for this version.')}</p>
}

/** The selected version's release notes (CHANGELOG.md), grouped by kind of change. */
export function PluginChangelogPanel(props: PluginDocumentProps) {
  const { i18n, t } = useTranslation()
  const locale = documentLocale(i18n.language)
  const entry = findMarketplaceVersion(props.plugin, props.version)
  const query = useQuery({
    queryFn: ({ signal }) => fetchPluginChangelog({ ...props, language: locale, signal }),
    queryKey: [
      'task-plugins',
      'marketplace-changelog',
      props.indexUrl,
      props.plugin.key,
      props.version,
      entry?.changelog?.path ?? entry?.path,
      entry?.changelog ? entry.changelog.sha256 : entry?.sha256,
      locale,
    ] as const,
    retry: false,
    staleTime: DOCUMENT_STALE_MS,
  })

  if (query.isPending) return <p className="text-sm text-muted">{t('Loading…')}</p>
  if (query.error instanceof PluginDocumentFormatError && !query.data) {
    return (
      <Alert action={<SourceLink href={query.error.sourceUrl} label={t('View changelog source')} />} title={t('Could not show the changelog')} tone="warning">
        {describePluginDocumentProblem(t, query.error)}
      </Alert>
    )
  }
  if (query.isError && !query.data) {
    return (
      <Alert
        action={
          <Button onClick={() => void query.refetch()} size="sm" variant="outline">
            {t('Try again')}
          </Button>
        }
        tone="destructive"
      >
        {t('Could not load the changelog')}
      </Alert>
    )
  }
  if (!query.data) return <p className="py-8 text-center text-sm text-muted">{t('No changelog for this version.')}</p>

  const changelog = query.data
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted">v{changelog.version}</span>
        <SourceLink href={changelog.sourceUrl} label={t('View changelog source')} />
      </div>
      {locale !== 'en' && changelog.locale === 'en' ? (
        <p className="text-xs text-muted" role="status">
          {t('This changelog is not available in your language. Showing English.')}
        </p>
      ) : null}
      {changelog.sections.map((section) => (
        <section className="flex flex-col gap-2" key={section.category}>
          <h3 className="text-sm font-semibold text-foreground">{t(CHANGELOG_CATEGORY_LABELS[section.category])}</h3>
          <DocumentMarkdown locale={changelog.locale} markdown={section.markdown} sourceUrl={changelog.sourceUrl} />
        </section>
      ))}
    </div>
  )
}
