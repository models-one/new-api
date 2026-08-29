import { api, type ApiRequestConfig } from '@/lib/http-client'

import type { ApiEnvelope } from '@/lib/api/types'

export class ApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (!envelope.success) throw new ApiError(envelope.message || 'Request failed')
  return envelope.data as T
}

export async function getJson<T>(url: string, config?: ApiRequestConfig): Promise<T> {
  const response = await api.get<ApiEnvelope<T>>(url, config)
  return unwrap(response.data)
}

export async function postJson<T>(url: string, body?: unknown, config?: ApiRequestConfig): Promise<T> {
  const response = await api.post<ApiEnvelope<T>>(url, body, config)
  return unwrap(response.data)
}

export async function putJson<T>(url: string, body?: unknown, config?: ApiRequestConfig): Promise<T> {
  const response = await api.put<ApiEnvelope<T>>(url, body, config)
  return unwrap(response.data)
}

export async function deleteJson<T>(url: string, config?: ApiRequestConfig): Promise<T> {
  const response = await api.delete<ApiEnvelope<T>>(url, config)
  return unwrap(response.data)
}

/**
 * `/api/pricing` puts group_ratio, usable_group, vendors and friends at the TOP level
 * next to `success`, not inside `data`. Endpoints shaped that way need the raw body.
 */
export async function getRawJson<T>(url: string, config?: ApiRequestConfig): Promise<T> {
  const response = await api.get<T & { success: boolean; message?: string }>(url, config)
  if (response.data.success === false) throw new ApiError(response.data.message || 'Request failed')
  return response.data
}
