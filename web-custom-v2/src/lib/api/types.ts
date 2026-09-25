/** The envelope every new-api endpoint wraps its payload in. */
export type ApiEnvelope<T> = {
  success: boolean
  message?: string
  data?: T
}

/** Shape returned by every paginated list endpoint (common/page_info.go). */
export type PageInfo<T> = {
  page: number
  page_size: number
  total: number
  items: T[]
}

export type PageQuery = {
  /** 1-based page index. */
  p: number
  page_size: number
}
