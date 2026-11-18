/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/ui/CopyButton'
import { Dialog } from '@/components/overlay/Dialog'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { intlLocale } from '@/i18n/language'
import { formatLatencyMs } from '@/lib/format'
import { toast } from '@/components/overlay/toast'

import { getArtifact } from './api'
import type { PelicanArtwork } from './types'

export function ArtifactImage(props: { run: PelicanArtwork; large?: boolean }) {
  const { t } = useTranslation()
  const holder = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(props.large ?? false)
  const [expired, setExpired] = useState(props.run.expires_at * 1000 <= Date.now())
  const artifact = props.run.artifacts.find((item) => item.type === 'png')
  useEffect(() => {
    if (visible) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '100px' },
    )
    if (holder.current) observer.observe(holder.current)
    return () => observer.disconnect()
  }, [visible])
  useEffect(() => {
    setExpired(props.run.expires_at * 1000 <= Date.now())
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, props.run.expires_at * 1000 - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [props.run.expires_at])
  let content = <Spinner label={t('Loading')} size="sm" />
  if (!artifact || expired) {
    content = (
      <span className="text-muted p-4 text-center text-sm">
        {t('Artwork is unavailable or expired')}
      </span>
    )
  } else if (visible) {
    content = <ArtifactContent run={props.run} artifactId={artifact.id} large={props.large} />
  }
  return (
    <div
      ref={holder}
      className={`relative bg-sunken flex w-full items-center justify-center ${props.large ? 'min-h-64' : 'h-56'}`}
    >
      {content}
    </div>
  )
}

// Unmount the query observer on expiry so its completed Promise cannot retain
// the image Blob while the gallery remains open.
function ArtifactContent(props: { run: PelicanArtwork; artifactId: string; large?: boolean }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [imageFailed, setImageFailed] = useState(false)
  const image = useQuery({
    queryKey: ['pelican-artifact', props.run.id, props.artifactId],
    queryFn: ({ signal }) => getArtifact(props.run.id, props.artifactId, false, signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    meta: { errorToast: false },
  })
  useEffect(() => {
    if (!image.data || image.isError) {
      setUrl('')
      return
    }
    const objectUrl = URL.createObjectURL(image.data)
    setImageFailed(false)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [image.data, image.dataUpdatedAt, image.isError])
  if (image.isError || imageFailed) {
    return (
      <span className="text-muted p-4 text-center text-sm">
        {t('Artwork is unavailable or expired')}
      </span>
    )
  }
  if (!url) return <Spinner label={t('Loading')} size="sm" />
  return (
    <img
      src={url}
      onError={() => setImageFailed(true)}
      alt={t('Artwork from {{channel}} using {{model}}', {
        channel: props.run.channel_name,
        model: props.run.model,
      })}
      className={
        props.large ? 'max-h-[55vh] w-full object-contain' : 'h-full w-full object-contain'
      }
    />
  )
}

export function ArtworkDetails(props: { runs: PelicanArtwork[]; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = intlLocale(i18n.resolvedLanguage || i18n.language)
  const [downloading, setDownloading] = useState(false)
  const conditionsDiffer =
    props.runs.length === 2 &&
    (props.runs[0]?.prompt !== props.runs[1]?.prompt ||
      props.runs[0]?.system_prompt !== props.runs[1]?.system_prompt ||
      props.runs[0]?.parameters !== props.runs[1]?.parameters ||
      props.runs[0]?.protocol !== props.runs[1]?.protocol ||
      props.runs[0]?.generation.channel_config_sha256 !==
        props.runs[1]?.generation.channel_config_sha256)
  async function download(run: PelicanArtwork) {
    const artifact = run.artifacts.find((item) => item.type === 'svg')
    if (!artifact) return
    setDownloading(true)
    try {
      const blob = await getArtifact(run.id, artifact.id, false)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${run.id}.svg`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      toast.error(error)
    } finally {
      setDownloading(false)
    }
  }
  return (
    <Dialog
      open={props.runs.length > 0}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={props.runs.length === 2 ? t('Compare artworks') : t('Artwork details')}
      size="xl"
    >
      {conditionsDiffer && (
        <p role="status" className="text-muted mb-4 text-sm">
          {t('Generation conditions differ between these artworks')}
        </p>
      )}
      <div className={`grid gap-6 ${props.runs.length === 2 ? 'md:grid-cols-2' : ''}`}>
        {props.runs.map((run) => (
          <section key={run.id} className="min-w-0 space-y-3">
            <ArtifactImage run={run} large />
            <h3 className="font-semibold break-words">
              {run.channel_name} / {run.model}
            </h3>
            <p className="text-muted text-sm">
              {new Date(run.generated_at * 1000).toLocaleString(locale)} ·{' '}
              {formatLatencyMs(run.generation?.duration_ms ?? 0)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={downloading}
                onClick={() => void download(run)}
              >
                {t('Download SVG')}
              </Button>
              <CopyButton value={run.prompt} label={t('Copy prompt')} showLabel />
            </div>
            <details className="rounded-lg border p-3">
              <summary>{t('Generation conditions')}</summary>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-muted">{t('Prompt')}</dt>
                  <dd className="break-words whitespace-pre-wrap">{run.prompt}</dd>
                </div>
                {run.system_prompt && (
                  <div>
                    <dt className="text-muted">{t('System Prompt')}</dt>
                    <dd className="break-words whitespace-pre-wrap">{run.system_prompt}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted">{t('Parameters')}</dt>
                  <dd className="font-mono break-all whitespace-pre-wrap">{run.parameters}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('Protocol')}</dt>
                  <dd>{run.protocol}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('Upstream Model')}</dt>
                  <dd className="break-all">{run.generation?.model || run.model}</dd>
                </div>
              </dl>
            </details>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
