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
export type PelicanProtocol = 'openai-chat' | 'openai-responses' | 'anthropic'

export interface PelicanRule {
  id: number
  name: string
  channel_id: number
  model: string
  protocol: PelicanProtocol
  prompt: string
  system_prompt: string
  parameters: string
  interval_seconds: number
  enabled: boolean
  published: boolean
  revision: number
  next_run_at: number
}

export interface PelicanArtifact {
  id: string
  type: 'raw_text' | 'svg' | 'png'
  size: number
  sha256: string
}

export interface PelicanArtwork {
  id: string
  channel_name: string
  model: string
  protocol: PelicanProtocol
  revision: number
  generated_at: number
  expires_at: number
  prompt: string
  system_prompt: string
  parameters: string
  generation: {
    duration_ms?: number
    model?: string
    finish_reason?: string
    channel_config_sha256?: string
  }
  artifacts: PelicanArtifact[]
}

export interface PelicanGroup {
  key: string
  channel_id: number
  channel_name: string
  model: string
  interval_seconds: number
  latest_status: string
  latest_attempt_at: number
  runs: PelicanArtwork[]
}

export interface PelicanGalleryData {
  groups: PelicanGroup[]
  total: number
  page: number
}
export interface PelicanRun {
  id: string
  rule_id: number
  channel_name: string
  model: string
  status: string
  trigger: string
  created_at: number
  generated_at: number
  expires_at: number
  error_detail: string
  generation: string
  artifacts: string
}
export interface PelicanStatus {
  ready: boolean
  service_url: string
  test_token_id: number
  concurrency: number
  error_detail: string
}

export const defaultRule: PelicanRule = {
  id: 0,
  name: '',
  channel_id: 0,
  model: '',
  protocol: 'openai-responses',
  prompt: 'Generate an SVG of a pelican riding a bicycle',
  system_prompt: '',
  parameters: '{"max_output_tokens":8192}',
  interval_seconds: 21600,
  enabled: false,
  published: false,
  revision: 0,
  next_run_at: 0,
}
