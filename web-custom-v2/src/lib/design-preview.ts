/** Explicit, development-only visual preview. Never enabled by an API failure. */
export const isDesignPreview =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1'
