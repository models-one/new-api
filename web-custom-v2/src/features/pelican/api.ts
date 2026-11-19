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
import axios, { type AxiosRequestConfig } from 'axios'
import { toErrorMessage } from '@/components/overlay/toast'
import { api } from '@/lib/http-client'
import type { PelicanGalleryData, PelicanRule, PelicanRun, PelicanStatus } from './types'

export const pelicanKeys = { all: ['pelican'] as const }
const silent = { skipBusinessError: true, skipErrorHandler: true }

type PelicanResponse<T> = {
  success: boolean
  message?: string
  details?: string
  data: T
}

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const { data } = await api.request<PelicanResponse<T>>({
    ...silent,
    ...config,
  })
  if (!data.success) {
    throw Object.assign(new Error(data.message || 'Request failed'), {
      details: data.details,
    })
  }
  return data.data
}

export function getGallery(search: string, page: number): Promise<PelicanGalleryData> {
  return request({ url: '/api/pelican/gallery', params: { search, page } })
}
export function getRules(): Promise<PelicanRule[]> {
  return request({ url: '/api/pelican/admin/rules' })
}
export function getPelicanStatus(): Promise<PelicanStatus> {
  return request({ url: '/api/pelican/admin/status' })
}
export type PelicanSettings = {
  url: string
  service_token_configured: boolean
  test_token_id: number
  test_tokens: { id: number; name: string }[]
}

export function getPelicanSettings(): Promise<PelicanSettings> {
  return request({ url: '/api/pelican/settings' })
}

export function savePelicanConnection(url: string, service_token: string): Promise<void> {
  return request({
    url: '/api/pelican/settings/connection',
    method: 'PUT',
    data: { url, service_token },
  })
}

export function savePelicanTestToken(id: number): Promise<void> {
  return request({ url: '/api/pelican/settings/test-token', method: 'PUT', data: { id } })
}
export function saveRule(rule: PelicanRule): Promise<PelicanRule> {
  return request({
    url: `/api/pelican/admin/rules${rule.id ? `/${rule.id}` : ''}`,
    method: rule.id ? 'PUT' : 'POST',
    data: rule,
  })
}
export function deleteRule(id: number): Promise<void> {
  return request({ url: `/api/pelican/admin/rules/${id}`, method: 'DELETE' })
}
export function runRule(id: number): Promise<void> {
  return request({ url: `/api/pelican/admin/rules/${id}/run`, method: 'POST' })
}
export function getRuns(
  page: number,
): Promise<{ items: PelicanRun[]; total: number; page: number }> {
  return request({ url: '/api/pelican/admin/runs', params: { page } })
}
export function artifactPath(runId: string, artifactId: string, admin = false): string {
  return `/api/pelican/${admin ? 'admin/' : ''}runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`
}
export async function getArtifact(
  runId: string,
  artifactId: string,
  admin: boolean,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await api.get<Blob>(artifactPath(runId, artifactId, admin), {
    ...silent,
    responseType: 'blob',
    signal,
    disableDuplicate: true,
  })
  return response.data
}

export function errorDetails(error: unknown): string {
  if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
    return toErrorMessage(error)
  }
  const source: unknown = axios.isAxiosError(error) ? error.response?.data : error
  if (
    source &&
    typeof source === 'object' &&
    'details' in source &&
    typeof source.details === 'string'
  ) {
    return source.details
  }
  return toErrorMessage(error)
}
