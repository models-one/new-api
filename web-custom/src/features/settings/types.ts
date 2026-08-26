export type ProviderId = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'qwen' | 'xai'

export type GroupTone = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'muted'

export type ModelGroup = {
  id: string
  name: string
  providerId: ProviderId
  ratio: number
  tone: GroupTone
}

export type Provider = {
  id: ProviderId
  name: string
  tone: GroupTone
}

export type ApiKeyRecord = {
  id: string
  name: string
  secret: string
  active: boolean
  spent: number
  unlimitedQuota: boolean
  created: string
  expires: string
  groupIds: string[]
}

export type ApiKeyDraft = {
  name: string
  groupIds: string[]
}
