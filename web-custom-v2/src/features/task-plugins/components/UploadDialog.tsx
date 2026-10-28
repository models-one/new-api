import { useDeferredValue, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import CircleCheckIcon from 'lucide-react/dist/esm/icons/circle-check'
import DownloadIcon from 'lucide-react/dist/esm/icons/download'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import UploadIcon from 'lucide-react/dist/esm/icons/upload'

import { Input, Textarea } from '@/components/form'
import { Dialog, toast, toErrorMessage } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'

import { activateTaskPlugin, taskPluginKeys, uploadTaskPlugin } from '../api'
import { encodePluginIconFile, PluginIconFileError } from '../lib/plugin-icon-file'
import {
  fetchPluginSourceText,
  MAX_PLUGIN_SOURCE_BYTES,
  normalizePluginSourceUrl,
  PluginSourceFetchError,
  pluginSourceByteLength,
} from '../lib/plugin-url'
import type { TaskPluginDetail } from '../types'
import { PluginCapabilities } from './PluginFacts'
import { PluginIcon } from './PluginIcon'

type UploadDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Set when uploading a new version of an installed plugin. */
  pluginKey?: string
}

/**
 * Installs a plugin from pasted source, a local .js file or a URL. Fetching a URL
 * only fills the source field: uploading stays an explicit step so the source
 * and the risk warning are reviewed exactly as for a manual paste.
 */
export function UploadDialog(props: UploadDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [source, setSource] = useState('')
  const [fileName, setFileName] = useState('')
  const [remark, setRemark] = useState('')
  const [icon, setIcon] = useState('')
  const [iconFileName, setIconFileName] = useState('')
  const [iconError, setIconError] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importError, setImportError] = useState('')
  const [result, setResult] = useState<TaskPluginDetail | null>(null)
  // The declaration preview re-parses the whole source; let typing go first.
  const deferredSource = useDeferredValue(source)
  const sourceInputRef = useRef<HTMLInputElement>(null)
  const iconInputRef = useRef<HTMLInputElement>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: taskPluginKeys.all })

  const uploadMutation = useMutation({
    mutationFn: () => uploadTaskPlugin(source, remark, icon),
    onError: (error) => toast.error(toErrorMessage(error, t('Could not upload the plugin.'))),
    onSuccess: (detail) => {
      setResult(detail)
      void refresh()
      toast.success(detail.plugin?.active === false ? t('Plugin saved; activate it to use it.') : t('Plugin uploaded.'))
    },
  })

  const activateMutation = useMutation({
    mutationFn: (detail: TaskPluginDetail) => activateTaskPlugin(detail.meta.key, detail.meta.version),
    onError: (error) => toast.error(toErrorMessage(error, t('Could not activate the plugin version.'))),
    onSuccess: () => {
      void refresh()
      toast.success(t('Plugin version activated.'))
    },
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      const normalized = normalizePluginSourceUrl(importUrl)
      if (!normalized) throw new Error(t('Enter an absolute http(s) URL.'))
      return fetchPluginSourceText(normalized)
    },
    onError: (error) => {
      if (!(error instanceof PluginSourceFetchError)) {
        setImportError(error.message)
      } else if (error.reason === 'too_large') {
        setImportError(t('Plugin source exceeds the 8 MiB limit.'))
      } else if (error.reason === 'not_found') {
        setImportError(
          t('The URL returned HTTP {{status}}. Check the address, or download the file and paste its source below.', {
            status: error.status ?? 0,
          })
        )
      } else {
        setImportError(
          t('Could not fetch this URL from the browser. The host may block cross-origin requests or be unreachable. Download the file and paste its source below.')
        )
      }
    },
    onSuccess: (text) => {
      setImportError('')
      setSource(text)
      setFileName('')
      setResult(null)
    },
  })

  async function readSourceFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_PLUGIN_SOURCE_BYTES) {
      setImportError(t('Plugin source exceeds the 8 MiB limit.'))
      return
    }
    setImportError('')
    setFileName(file.name)
    setSource(await file.text())
    setResult(null)
  }

  async function readIconFile(file: File | undefined) {
    if (!file) return
    try {
      setIcon(await encodePluginIconFile(file))
      setIconFileName(file.name)
      setIconError('')
    } catch (error) {
      setIcon('')
      setIconFileName('')
      setIconError(
        error instanceof PluginIconFileError && error.reason === 'too_large'
          ? t('Plugin icon exceeds the 512 KiB limit.')
          : t('Plugin icon must be an .svg or .png file.')
      )
    }
    setResult(null)
  }

  function close(open: boolean) {
    if (!open && (uploadMutation.isPending || activateMutation.isPending)) return
    props.onOpenChange(open)
    if (open) return
    setSource('')
    setFileName('')
    setRemark('')
    setIcon('')
    setIconFileName('')
    setIconError('')
    setImportUrl('')
    setImportError('')
    setResult(null)
    uploadMutation.reset()
    activateMutation.reset()
    importMutation.reset()
  }

  if (result !== null) {
    const needsActivation = result.plugin?.active === false && !activateMutation.isSuccess
    return (
      <Dialog
        footer={
          <>
            <Button onClick={() => close(false)} variant={needsActivation ? 'outline' : 'primary'}>
              {needsActivation ? t('Later') : t('Done')}
            </Button>
            {needsActivation ? (
              <Button disabled={activateMutation.isPending} onClick={() => activateMutation.mutate(result)}>
                {t('Activate now')}
              </Button>
            ) : null}
          </>
        }
        onOpenChange={close}
        open={props.open}
        size="sm"
        title={needsActivation ? t('Plugin saved') : t('Plugin installed')}
      >
        <div className="flex items-start gap-3">
          <PluginIcon hasIcon={Boolean(icon)} icon={result.meta.icon} imageSrc={icon || undefined} name={result.meta.name} pluginKey={result.meta.key} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <CircleCheckIcon aria-hidden="true" className="size-4 text-success" />
              {result.meta.name}
            </p>
            <p className="font-mono text-xs text-muted">
              {result.meta.key} · v{result.meta.version}
            </p>
          </div>
        </div>
        {needsActivation ? (
          <Alert className="mt-4" tone="warning">
            {t('An older version of this plugin is active. Activate this version to switch traffic to it.')}
          </Alert>
        ) : null}
      </Dialog>
    )
  }

  const sourceTooLarge = pluginSourceByteLength(source) > MAX_PLUGIN_SOURCE_BYTES
  const canUpload = source.trim() !== '' && !sourceTooLarge && iconError === ''

  return (
    <Dialog
      description={
        props.pluginKey
          ? t('Upload a new version of {{key}}. The version in the source must be newer than any installed one.', { key: props.pluginKey })
          : t('Install a task plugin from its JavaScript source.')
      }
      footer={
        <>
          <Button disabled={uploadMutation.isPending} onClick={() => close(false)} variant="outline">
            {t('Cancel')}
          </Button>
          <Button disabled={!canUpload || uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
            <UploadIcon aria-hidden="true" />
            {uploadMutation.isPending ? t('Uploading…') : t('Upload')}
          </Button>
        </>
      }
      onOpenChange={close}
      open={props.open}
      scrollBody
      size="lg"
      title={props.pluginKey ? t('Upload new version') : t('Upload plugin')}
    >
      <div className="flex flex-col gap-5">
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('Plugins run code on this server')} tone="warning">
          {t('A task plugin handles requests and channel keys. Only install source you have reviewed or that comes from an author you trust.')}
        </Alert>

        <div className="flex items-end gap-2">
          <Input
            className="flex-1"
            description={t('Fetched in your browser, so the host must allow cross-origin requests.')}
            error={importError || undefined}
            label={t('Import from URL')}
            onChange={(event) => setImportUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && importUrl.trim() !== '') {
                event.preventDefault()
                importMutation.mutate()
              }
            }}
            placeholder="https://example.com/plugin.js"
            type="url"
            value={importUrl}
          />
          <Button
            className="mb-6"
            disabled={importUrl.trim() === '' || importMutation.isPending}
            onClick={() => importMutation.mutate()}
            variant="outline"
          >
            <DownloadIcon aria-hidden="true" />
            {t('Fetch')}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input accept=".js,.mjs,text/javascript" className="sr-only" onChange={(event) => void readSourceFile(event.target.files?.[0])} ref={sourceInputRef} tabIndex={-1} type="file" />
          <input accept=".svg,.png,image/svg+xml,image/png" className="sr-only" onChange={(event) => void readIconFile(event.target.files?.[0])} ref={iconInputRef} tabIndex={-1} type="file" />
          <Button onClick={() => sourceInputRef.current?.click()} size="sm" variant="outline">
            {fileName === '' ? t('Choose .js file') : fileName}
          </Button>
          <Button onClick={() => iconInputRef.current?.click()} size="sm" variant="outline">
            {iconFileName === '' ? t('Choose icon (optional)') : iconFileName}
          </Button>
          {iconError === '' ? null : <span className="text-xs text-destructive">{iconError}</span>}
        </div>

        <Textarea
          error={sourceTooLarge ? t('Plugin source exceeds the 8 MiB limit.') : undefined}
          label={t('Plugin source')}
          onChange={(event) => {
            setSource(event.target.value)
            setResult(null)
          }}
          placeholder={'export default definePlugin({ meta: { key: "...", ... } })'}
          rows={12}
          spellCheck={false}
          textareaClassName="font-mono text-xs"
          value={source}
        />

        <Input label={t('Remark')} maxLength={255} onChange={(event) => setRemark(event.target.value)} placeholder={t('Optional note for this version')} value={remark} />

        {deferredSource.trim() === '' ? null : (
          <section className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">{t('Declared capabilities')}</h3>
            <PluginCapabilities source={deferredSource} />
          </section>
        )}
      </div>
    </Dialog>
  )
}
