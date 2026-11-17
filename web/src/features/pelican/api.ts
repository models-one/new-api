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
import { api } from '@/lib/api'
import {
  getServerErrorSources,
  requireServerSuccess,
  safeServerErrorMessage,
} from '@/lib/server-error-message'

import type {
  PelicanGalleryData,
  PelicanRule,
  PelicanRun,
  PelicanStatus,
} from './types'

export const pelicanKeys = { all: ['pelican'] as const }

export async function getGallery(
  search: string,
  page: number
): Promise<PelicanGalleryData> {
  const response = await api.get('/api/pelican/gallery', {
    params: { search, page },
  })
  return requireServerSuccess(response.data).data
}
export async function getRules(): Promise<PelicanRule[]> {
  return (
    requireServerSuccess((await api.get('/api/pelican/admin/rules')).data)
      .data ?? []
  )
}
export async function getPelicanStatus(): Promise<PelicanStatus> {
  return requireServerSuccess((await api.get('/api/pelican/admin/status')).data)
    .data
}
export async function saveRule(rule: PelicanRule): Promise<PelicanRule> {
  const path = '/api/pelican/admin/rules'
  const response = rule.id
    ? await api.put(`${path}/${rule.id}`, rule)
    : await api.post(path, rule)
  return requireServerSuccess(response.data).data
}
export async function deleteRule(id: number): Promise<void> {
  requireServerSuccess(
    (await api.delete(`/api/pelican/admin/rules/${id}`)).data
  )
}
export async function runRule(id: number): Promise<void> {
  requireServerSuccess(
    (await api.post(`/api/pelican/admin/rules/${id}/run`)).data
  )
}
export async function getRuns(
  page: number
): Promise<{ items: PelicanRun[]; total: number; page: number }> {
  return requireServerSuccess(
    (await api.get('/api/pelican/admin/runs', { params: { page } })).data
  ).data
}
export function artifactPath(
  runId: string,
  artifactId: string,
  admin = false
): string {
  return `/api/pelican/${admin ? 'admin/' : ''}runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`
}
export async function getArtifact(
  runId: string,
  artifactId: string,
  admin: boolean,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await api.get(artifactPath(runId, artifactId, admin), {
    responseType: 'blob',
    signal,
  })
  return response.data
}

export function errorDetails(error: unknown): string {
  for (const source of getServerErrorSources(error)) {
    if (source[safeServerErrorMessage]) break
    if (typeof source.details === 'string') return source.details
  }
  return error instanceof Error ? error.message : String(error)
}
