import { api } from '@/lib/http-client'

/**
 * Waffo Pancake's admin endpoints (`controller/topup_waffo_pancake.go`).
 *
 *   GET  /api/option/waffo-pancake/catalog   the merchant's stores and one-time products;
 *                                            a success also proves the credentials work
 *   POST /api/option/waffo-pancake/pair      creates a store and a product for top-ups
 *   POST /api/option/waffo-pancake/save      stores merchant id, private key, return URL,
 *                                            store id and product id together
 *
 * Catalog and pair write nothing. Empty credentials make the server use the stored ones,
 * so a returning admin never retypes the write-only private key. A typed key travels in
 * the catalog's query string: it is sent only when the operator typed one, and the access
 * log masks `private_key` (`relay/common.SanitizeURLForLog`).
 *
 * These endpoints answer `{message: "success" | "error", data}` rather than the usual
 * `{success, data}` envelope; an error's `data` is the reason.
 */

export type PancakeProduct = { id: string; name: string; status: string }
export type PancakeStore = { id: string; name: string; status: string; prodEnabled: boolean; onetimeProducts: PancakeProduct[] | null }
export type PancakeCredentials = { merchantId: string; privateKey: string }
export type PancakePair = { store_id: string; store_name: string; product_id: string; product_name: string }

/** A pair whose product failed after its store was created: the store exists and can be reused. */
export class PancakeOrphanStoreError extends Error {
  constructor(
    message: string,
    readonly storeId: string,
    readonly storeName: string,
  ) {
    super(message)
    this.name = 'PancakeOrphanStoreError'
  }
}

type PancakeBody<T> = { message?: string; success?: boolean; data?: T | string | { error?: string } }

function unwrap<T>(body: PancakeBody<T>, fallback: string): T {
  if (body.message === 'success' && body.data !== undefined && typeof body.data !== 'string') return body.data as T
  const data = body.data
  if (typeof data === 'string' && data !== '') throw new Error(data)
  if (data !== null && typeof data === 'object' && 'error' in data && typeof data.error === 'string') throw new Error(data.error)
  throw new Error(body.message && body.message !== 'error' ? body.message : fallback)
}

const silent = { skipBusinessError: true, skipErrorHandler: true }

/** Only typed credentials are sent; none means "use the stored ones". */
function typedCredentials(credentials: PancakeCredentials): Record<string, string> {
  const merchantId = credentials.merchantId.trim()
  const privateKey = credentials.privateKey.trim()
  return privateKey === '' && merchantId === '' ? {} : { merchant_id: merchantId, private_key: privateKey }
}

export async function listPancakeCatalog(credentials: PancakeCredentials): Promise<PancakeStore[]> {
  const response = await api.get<PancakeBody<{ stores: PancakeStore[] | null }>>('/api/option/waffo-pancake/catalog', {
    ...silent,
    params: typedCredentials(credentials),
  })
  return unwrap(response.data, 'Failed to fetch the catalog').stores ?? []
}

export async function createPancakePair(credentials: PancakeCredentials, returnUrl: string): Promise<PancakePair> {
  const response = await api.post<PancakeBody<PancakePair & { orphan_store?: boolean; error?: string }>>(
    '/api/option/waffo-pancake/pair',
    { ...typedCredentials(credentials), return_url: returnUrl.trim() },
    silent,
  )
  const data = response.data.data
  if (response.data.message !== 'success' && data !== null && typeof data === 'object' && 'orphan_store' in data && data.orphan_store) {
    throw new PancakeOrphanStoreError(data.error ?? 'Failed to create the product', data.store_id, data.store_name)
  }
  return unwrap(response.data, 'Failed to create the store and product')
}

export async function savePancakeBinding(binding: PancakeCredentials & { returnUrl: string; storeId: string; productId: string }): Promise<void> {
  const response = await api.post<PancakeBody<{ store_id: string; product_id: string }>>(
    '/api/option/waffo-pancake/save',
    {
      merchant_id: binding.merchantId.trim(),
      private_key: binding.privateKey.trim(),
      product_id: binding.productId,
      return_url: binding.returnUrl.trim().replace(/\/+$/, ''),
      store_id: binding.storeId,
    },
    silent,
  )
  unwrap(response.data, 'Failed to save configuration')
}
