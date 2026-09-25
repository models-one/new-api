/// <reference types="@rsbuild/core/types" />

interface ImportMetaEnv {
  readonly PUBLIC_API_BASE_URL?: string
  readonly PUBLIC_LEGACY_WEB_ORIGIN?: string
  readonly PUBLIC_PREVIEW_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
