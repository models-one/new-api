import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'

import { Input, NativeSelect } from '@/components/form'
import { toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Panel } from '@/components/ui'
import { SecretField } from '@/features/system-settings/billing/components/SecretField'
import {
  createPancakePair,
  listPancakeCatalog,
  PancakeOrphanStoreError,
  savePancakeBinding,
  type PancakeCredentials,
  type PancakeStore,
} from '@/features/system-settings/billing/waffo-pancake-api'

/**
 * Which Waffo Pancake merchant, store and product top-ups are charged through. The store
 * and product are chosen from the merchant's own catalog — or created here — instead of
 * pasted as ids, and the five fields are saved together by the server, so a half-written
 * binding cannot take payments against the wrong product.
 */

export type StoredPancakeBinding = { merchantId: string; storeId: string; productId: string; returnUrl: string }

type WaffoPancakeBindingProps = {
  stored: StoredPancakeBinding
  disabled?: boolean
  onSaved: () => Promise<void> | void
}

function isHttpUrl(value: string): boolean {
  if (value.trim() === '') return true
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function WaffoPancakeBinding(props: WaffoPancakeBindingProps) {
  const { t } = useTranslation()
  const [merchantId, setMerchantId] = useState(props.stored.merchantId)
  const [privateKey, setPrivateKey] = useState('')
  const [returnUrl, setReturnUrl] = useState(props.stored.returnUrl)
  const [stores, setStores] = useState<PancakeStore[] | null>(null)
  const [storeId, setStoreId] = useState(props.stored.storeId)
  const [productId, setProductId] = useState(props.stored.productId)
  const [notice, setNotice] = useState<string | null>(null)

  const merchantChanged = merchantId.trim() !== props.stored.merchantId.trim()
  // Untouched credentials are not sent: the server then uses the stored ones, so the
  // write-only private key never has to be typed again.
  const credentials: PancakeCredentials = merchantChanged || privateKey.trim() !== '' ? { merchantId, privateKey } : { merchantId: '', privateKey: '' }
  const needsKey = merchantChanged && privateKey.trim() === ''
  const returnUrlInvalid = !isHttpUrl(returnUrl)

  function credentialsEdited() {
    // A catalog read with other credentials no longer describes this merchant.
    setStores(null)
    setNotice(null)
  }

  const catalog = useMutation({
    mutationFn: () => listPancakeCatalog(credentials),
    onSuccess: (loaded) => {
      setStores(loaded)
      // Keep the stored binding selected when it is in the catalog.
      const store = loaded.find((item) => item.id === storeId) ?? loaded[0]
      setStoreId(store?.id ?? '')
      const products = store?.onetimeProducts ?? []
      setProductId(products.some((item) => item.id === productId) ? productId : (products[0]?.id ?? ''))
    },
  })

  const pair = useMutation({
    mutationFn: () => createPancakePair(credentials, returnUrl),
    onError: async (error) => {
      if (!(error instanceof PancakeOrphanStoreError)) return
      // The store was created; reload so it can be chosen and given a product.
      setNotice(t('The store {{name}} was created but its product was not. Pick a product for it, or create one in the Pancake dashboard.', { name: error.storeName || error.storeId }))
      const loaded = await listPancakeCatalog(credentials).catch(() => null)
      if (loaded) {
        setStores(loaded)
        setStoreId(error.storeId)
        setProductId('')
      }
    },
    onSuccess: async (created) => {
      setNotice(t('Created {{store}} with {{product}}. Save to use it.', { product: created.product_name, store: created.store_name }))
      const loaded = await listPancakeCatalog(credentials).catch(() => null)
      setStores(
        loaded ?? [
          { id: created.store_id, name: created.store_name, onetimeProducts: [{ id: created.product_id, name: created.product_name, status: '' }], prodEnabled: false, status: '' },
          ...(stores ?? []),
        ],
      )
      setStoreId(created.store_id)
      setProductId(created.product_id)
    },
  })

  const save = useMutation({
    mutationFn: () => savePancakeBinding({ ...credentials, merchantId, productId, returnUrl, storeId }),
    onSuccess: async () => {
      toast.success(t('Waffo Pancake binding saved'))
      setPrivateKey('')
      await props.onSaved()
    },
  })

  const store = stores?.find((item) => item.id === storeId)
  const products = store?.onetimeProducts ?? []
  const unchanged =
    !merchantChanged &&
    privateKey.trim() === '' &&
    returnUrl.trim().replace(/\/+$/, '') === props.stored.returnUrl.trim() &&
    storeId === props.stored.storeId &&
    productId === props.stored.productId
  const busy = catalog.isPending || pair.isPending || save.isPending || Boolean(props.disabled)
  const canSave = !busy && !unchanged && merchantId.trim() !== '' && storeId !== '' && productId !== '' && !needsKey && !returnUrlInvalid

  return (
    <Panel className="flex flex-col gap-4 p-4" muted>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t('Merchant, store and product')}</h3>
        <p className="text-xs leading-5 text-muted">
          {t('Load your Pancake stores with the merchant credentials, then choose the store and one-time product top-ups are charged against — or create a new pair. These five settings are saved together.')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          disabled={busy}
          error={needsKey ? t('Enter the private key of this merchant.') : undefined}
          inputClassName="mono"
          label={t('Pancake merchant id')}
          onChange={(event) => {
            setMerchantId(event.target.value)
            credentialsEdited()
          }}
          value={merchantId}
        />
        <Input
          description={t('Where the user lands after paying. A trailing slash is removed when saved.')}
          disabled={busy}
          error={returnUrlInvalid ? t('Enter a full http:// or https:// address, or leave this empty.') : undefined}
          label={t('Pancake return address')}
          onChange={(event) => setReturnUrl(event.target.value)}
          placeholder="https://example.com/wallet"
          value={returnUrl}
        />
        <div className="md:col-span-2">
          <SecretField
            clearLabel=""
            disabled={busy}
            label={t('Pancake private key')}
            multiline
            onChange={(value) => {
              setPrivateKey(value)
              credentialsEdited()
            }}
            value={privateKey}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button aria-busy={catalog.isPending} disabled={busy || needsKey || merchantId.trim() === ''} onClick={() => catalog.mutate()} size="sm" variant="outline">
          <RefreshCwIcon aria-hidden="true" />
          {stores === null ? t('Check credentials and load stores') : t('Reload stores')}
        </Button>
        {props.stored.storeId ? (
          <span className="text-xs text-muted">
            {t('Saved: store {{store}}, product {{product}}', { product: props.stored.productId || '—', store: props.stored.storeId })}
          </span>
        ) : null}
      </div>

      {catalog.isError ? <Alert tone="destructive">{toErrorMessage(catalog.error)}</Alert> : null}

      {stores !== null ? (
        <div className="flex flex-col gap-3">
          {stores.length === 0 ? <p className="text-sm text-muted">{t('This merchant has no store yet. Create one below.')}</p> : null}
          {stores.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <NativeSelect
                disabled={busy}
                label={t('Store')}
                onChange={(event) => {
                  setStoreId(event.target.value)
                  const next = stores.find((item) => item.id === event.target.value)
                  setProductId(next?.onetimeProducts?.[0]?.id ?? '')
                }}
                options={stores.map((item) => ({ label: `${item.name} · ${item.prodEnabled ? t('Live') : t('Test')}${item.status ? ` · ${item.status}` : ''}`, value: item.id }))}
                value={storeId}
              />
              <NativeSelect
                disabled={busy || products.length === 0}
                label={t('One-time product')}
                onChange={(event) => setProductId(event.target.value)}
                options={products.length === 0 ? [{ label: t('This store has no one-time product'), value: '' }] : products.map((item) => ({ label: `${item.name}${item.status ? ` · ${item.status}` : ''}`, value: item.id }))}
                value={productId}
              />
            </div>
          ) : null}
          {store && !store.prodEnabled ? <Badge tone="warning">{t('This store is not live yet; payments run in test mode until it is.')}</Badge> : null}
          <div>
            <Button aria-busy={pair.isPending} disabled={busy} onClick={() => pair.mutate()} size="sm" variant="outline">
              <PlusIcon aria-hidden="true" />
              {t('Create a new store and product')}
            </Button>
          </div>
        </div>
      ) : null}

      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {pair.isError && !(pair.error instanceof PancakeOrphanStoreError) ? <Alert tone="destructive">{toErrorMessage(pair.error)}</Alert> : null}
      {save.isError ? <Alert tone="destructive">{toErrorMessage(save.error)}</Alert> : null}

      <div className="flex justify-end">
        <Button aria-busy={save.isPending} disabled={!canSave} onClick={() => save.mutate()} variant="primary">
          {save.isPending ? t('Saving…') : t('Save Pancake binding')}
        </Button>
      </div>
    </Panel>
  )
}
