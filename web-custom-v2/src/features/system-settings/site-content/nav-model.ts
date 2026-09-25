import { isPlainObject } from '@/features/system-settings/site-content/option-json'

/**
 * THE TWO NAVIGATION BLOBS
 * ========================
 * `HeaderNavModules` and `SidebarModulesAdmin` decide what appears in the top navigation
 * and in the console sidebar for everyone on the deployment, and each is stored as ONE
 * serialised JSON object.
 *
 * THEY ARE NOT VALIDATED BY THE SERVER — AT ALL. `controller.UpdateOption` has no case for
 * either key, so `PUT /api/option/` stores whatever string it is handed; the literal text
 * `garbage{` was accepted on the dev server, verified. `middleware/header_nav.go` then
 * fails to unmarshal it and silently returns "enabled, no login required" for every
 * module, and `controller.GetStatus` republishes the broken text to every console.
 * Nothing warns anybody. This module is therefore the only validation these two settings
 * will ever get, and both editors refuse to save a value it rejects.
 *
 * NEITHER KEY IS SEEDED. `model.InitOptionMap` never writes them, so on a fresh
 * deployment they are ABSENT from `GET /api/option/` and come back as `''` from
 * `/api/status`. Absent means "never configured", which is why the parsers below treat an
 * empty value as the defaults rather than as an error — and those defaults are the ones
 * the backend itself falls back to, not a guess.
 *
 * COERCION MATCHES THE BACKEND. `parseHeaderNavBool` accepts a real boolean, the strings
 * `"true"`/`"1"`/`"false"`/`"0"`, and the numbers 1 and 0; anything else it silently
 * replaces with its fallback. These parsers accept exactly that set and REPORT anything
 * else instead of silently substituting — a value the middleware would quietly ignore is
 * a decision the operator made and did not get.
 */

export type NavIssue =
  | { kind: 'invalid-json' }
  | { kind: 'not-object' }
  /** A module flag that is neither boolean-like nor an access object. */
  | { kind: 'value-unreadable'; path: string }

/** `parseHeaderNavBool` / the legacy `toBoolean`, with "unreadable" kept distinguishable. */
function readBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return undefined
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }
  return undefined
}

/* ------------------------------------------------------------------ *
 * Header navigation
 * ------------------------------------------------------------------ */

export type HeaderNavAccess = {
  enabled: boolean
  /** Only `pricing` and `rankings` have this; it is the one flag the backend enforces. */
  requireAuth: boolean
}

export type HeaderNavConfig = {
  home: boolean
  console: boolean
  docs: boolean
  about: boolean
  pricing: HeaderNavAccess
  rankings: HeaderNavAccess
  /** Keys this editor does not model, preserved verbatim through a save. */
  extra: Readonly<Record<string, unknown>>
}

/** The plain on/off modules, in the order the editor lists them. */
export const HEADER_NAV_SIMPLE_KEYS = ['home', 'console', 'docs', 'about'] as const
/** The two the gateway itself gates, in `router/api-router.go`. */
export const HEADER_NAV_ACCESS_KEYS = ['pricing', 'rankings'] as const

export type HeaderNavSimpleKey = (typeof HEADER_NAV_SIMPLE_KEYS)[number]
export type HeaderNavAccessKey = (typeof HEADER_NAV_ACCESS_KEYS)[number]

/** `middleware.getHeaderNavAccess`'s own fallback: everything on, nothing gated. */
export const HEADER_NAV_DEFAULT: HeaderNavConfig = {
  about: true,
  console: true,
  docs: true,
  extra: {},
  home: true,
  pricing: { enabled: true, requireAuth: false },
  rankings: { enabled: true, requireAuth: false },
}

export type ParsedHeaderNav =
  | { ok: true; config: HeaderNavConfig }
  | { ok: false; issue: NavIssue }

export function parseHeaderNav(raw: string): ParsedHeaderNav {
  const trimmed = raw.trim()
  if (trimmed === '') return { config: HEADER_NAV_DEFAULT, ok: true }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { issue: { kind: 'invalid-json' }, ok: false }
  }
  if (!isPlainObject(parsed)) return { issue: { kind: 'not-object' }, ok: false }

  const config: HeaderNavConfig = {
    ...HEADER_NAV_DEFAULT,
    extra: {},
    pricing: { ...HEADER_NAV_DEFAULT.pricing },
    rankings: { ...HEADER_NAV_DEFAULT.rankings },
  }
  const extra: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(parsed)) {
    if (HEADER_NAV_SIMPLE_KEYS.includes(key as HeaderNavSimpleKey)) {
      const flag = readBool(value)
      if (flag === undefined) return { issue: { kind: 'value-unreadable', path: key }, ok: false }
      config[key as HeaderNavSimpleKey] = flag
      continue
    }

    if (HEADER_NAV_ACCESS_KEYS.includes(key as HeaderNavAccessKey)) {
      const accessKey = key as HeaderNavAccessKey
      // `parseHeaderNavAccess` accepts a bare boolean here and keeps its own requireAuth
      // fallback, so `{"pricing": false}` is a legal, meaningful configuration.
      if (!isPlainObject(value)) {
        const flag = readBool(value)
        if (flag === undefined) return { issue: { kind: 'value-unreadable', path: key }, ok: false }
        config[accessKey] = { enabled: flag, requireAuth: HEADER_NAV_DEFAULT[accessKey].requireAuth }
        continue
      }

      const access = { ...HEADER_NAV_DEFAULT[accessKey] }
      for (const flagName of ['enabled', 'requireAuth'] as const) {
        if (!Object.hasOwn(value, flagName)) continue
        const flag = readBool(value[flagName])
        if (flag === undefined) {
          return { issue: { kind: 'value-unreadable', path: `${key}.${flagName}` }, ok: false }
        }
        access[flagName] = flag
      }
      config[accessKey] = access
      continue
    }

    extra[key] = value
  }

  return { config: { ...config, extra }, ok: true }
}

export function serializeHeaderNav(config: HeaderNavConfig): string {
  return JSON.stringify({
    ...config.extra,
    about: config.about,
    console: config.console,
    docs: config.docs,
    home: config.home,
    pricing: { enabled: config.pricing.enabled, requireAuth: config.pricing.requireAuth },
    rankings: { enabled: config.rankings.enabled, requireAuth: config.rankings.requireAuth },
  })
}

/* ------------------------------------------------------------------ *
 * Sidebar modules
 * ------------------------------------------------------------------ */

export type SidebarModule = {
  key: string
  enabled: boolean
}

export type SidebarSection = {
  key: string
  enabled: boolean
  modules: SidebarModule[]
}

export type SidebarConfig = {
  sections: SidebarSection[]
}

/**
 * The legacy console's `SIDEBAR_MODULES_DEFAULT`, which is also what an unset key means:
 * the backend stores this blob and republishes it, and nothing on the server has an
 * opinion about its contents, so the previous console's defaults ARE the deployment's.
 */
const SIDEBAR_DEFAULT_SHAPE: readonly (readonly [string, readonly string[]])[] = [
  ['chat', ['playground', 'chat']],
  ['console', ['detail', 'token', 'log', 'midjourney', 'task']],
  ['personal', ['topup', 'personal']],
  ['admin', ['channel', 'models', 'redemption', 'user', 'setting', 'subscription']],
]

export function defaultSidebarConfig(): SidebarConfig {
  return {
    sections: SIDEBAR_DEFAULT_SHAPE.map(([key, modules]) => ({
      enabled: true,
      key,
      modules: modules.map((moduleKey) => ({ enabled: true, key: moduleKey })),
    })),
  }
}

export type ParsedSidebar =
  | { ok: true; config: SidebarConfig }
  | { ok: false; issue: NavIssue }

/**
 * Sections and modules that are stored but not in the default shape are KEPT and shown,
 * because a deployment can carry a module this build does not know about and dropping it
 * on the next save would remove it from everyone's sidebar. Sections in the default shape
 * that are missing from the stored blob are added, on since that is what an absent flag
 * means everywhere else in this file.
 */
export function parseSidebar(raw: string): ParsedSidebar {
  const trimmed = raw.trim()
  if (trimmed === '') return { config: defaultSidebarConfig(), ok: true }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { issue: { kind: 'invalid-json' }, ok: false }
  }
  if (!isPlainObject(parsed)) return { issue: { kind: 'not-object' }, ok: false }

  const stored = new Map<string, SidebarSection>()

  for (const [sectionKey, sectionValue] of Object.entries(parsed)) {
    if (!isPlainObject(sectionValue)) {
      return { issue: { kind: 'value-unreadable', path: sectionKey }, ok: false }
    }

    const section: SidebarSection = { enabled: true, key: sectionKey, modules: [] }
    for (const [moduleKey, moduleValue] of Object.entries(sectionValue)) {
      const flag = readBool(moduleValue)
      if (flag === undefined) {
        return { issue: { kind: 'value-unreadable', path: `${sectionKey}.${moduleKey}` }, ok: false }
      }
      if (moduleKey === 'enabled') {
        section.enabled = flag
        continue
      }
      section.modules.push({ enabled: flag, key: moduleKey })
    }
    stored.set(sectionKey, section)
  }

  const sections: SidebarSection[] = []
  for (const [sectionKey, defaultModules] of SIDEBAR_DEFAULT_SHAPE) {
    const existing = stored.get(sectionKey)
    if (existing === undefined) {
      sections.push({
        enabled: true,
        key: sectionKey,
        modules: defaultModules.map((moduleKey) => ({ enabled: true, key: moduleKey })),
      })
      continue
    }
    stored.delete(sectionKey)
    const known = new Set(existing.modules.map((entry) => entry.key))
    sections.push({
      ...existing,
      modules: [
        ...existing.modules,
        ...defaultModules
          .filter((moduleKey) => !known.has(moduleKey))
          .map((moduleKey) => ({ enabled: true, key: moduleKey })),
      ],
    })
  }
  for (const section of stored.values()) sections.push(section)

  return { config: { sections }, ok: true }
}

export function serializeSidebar(config: SidebarConfig): string {
  const payload: Record<string, Record<string, boolean>> = {}
  for (const section of config.sections) {
    const entry: Record<string, boolean> = { enabled: section.enabled }
    for (const module of section.modules) entry[module.key] = module.enabled
    payload[section.key] = entry
  }
  return JSON.stringify(payload)
}

/* ------------------------------------------------------------------ *
 * Edits. Pure: rows in, next stored string out.
 * ------------------------------------------------------------------ */

export function setSidebarSection(config: SidebarConfig, sectionKey: string, enabled: boolean): SidebarConfig {
  return {
    sections: config.sections.map((section) =>
      section.key === sectionKey ? { ...section, enabled } : section),
  }
}

export function setSidebarModule(
  config: SidebarConfig,
  sectionKey: string,
  moduleKey: string,
  enabled: boolean,
): SidebarConfig {
  return {
    sections: config.sections.map((section) =>
      section.key === sectionKey
        ? {
          ...section,
          modules: section.modules.map((module) =>
            module.key === moduleKey ? { ...module, enabled } : module),
        }
        : section),
  }
}
