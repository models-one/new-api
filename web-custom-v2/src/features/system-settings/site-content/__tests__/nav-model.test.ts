import { describe, expect, it } from 'vitest'

import {
  HEADER_NAV_DEFAULT,
  defaultSidebarConfig,
  parseHeaderNav,
  parseSidebar,
  serializeHeaderNav,
  serializeSidebar,
  setSidebarModule,
  setSidebarSection,
} from '@/features/system-settings/site-content/nav-model'

/**
 * `HeaderNavModules` and `SidebarModulesAdmin` are stored with NO server-side validation —
 * the dev server accepted the literal text `garbage{` — so this parser is the only thing
 * standing between an operator and a navigation blob nobody can read. These tests are
 * about the two things that matters: it agrees with `middleware/header_nav.go` on what a
 * value means, and it never silently discards part of one.
 */

describe('parseHeaderNav', () => {
  it('reads an unset key as the backend’s own fallback: everything on, nothing gated', () => {
    const parsed = parseHeaderNav('')
    expect(parsed.ok && parsed.config).toEqual(HEADER_NAV_DEFAULT)
  })

  it('accepts the string forms parseHeaderNavBool accepts', () => {
    const parsed = parseHeaderNav('{"home":"false","console":"1","docs":0,"about":true}')
    expect(parsed.ok && parsed.config.home).toBe(false)
    expect(parsed.ok && parsed.config.console).toBe(true)
    expect(parsed.ok && parsed.config.docs).toBe(false)
    expect(parsed.ok && parsed.config.about).toBe(true)
  })

  it('accepts a bare boolean for an access module, as the middleware does', () => {
    const parsed = parseHeaderNav('{"pricing":false}')
    expect(parsed.ok && parsed.config.pricing).toEqual({ enabled: false, requireAuth: false })
  })

  it('reads the access object’s two flags independently', () => {
    const parsed = parseHeaderNav('{"rankings":{"enabled":true,"requireAuth":"true"}}')
    expect(parsed.ok && parsed.config.rankings).toEqual({ enabled: true, requireAuth: true })
  })

  it('reports a value the middleware would silently ignore instead of hiding it', () => {
    // `getHeaderNavAccess` falls back to "enabled" here and says nothing, so the operator
    // would never learn their setting was not applied.
    const parsed = parseHeaderNav('{"pricing":{"enabled":"yes"}}')
    expect(!parsed.ok && parsed.issue).toEqual({ kind: 'value-unreadable', path: 'pricing.enabled' })
  })

  it('refuses malformed text and a non-object', () => {
    expect(!parseHeaderNav('garbage{').ok).toBe(true)
    expect(parseHeaderNav('[]').ok).toBe(false)
    expect(parseHeaderNav('null').ok).toBe(false)
  })

  it('preserves a key it does not model through a round trip', () => {
    const parsed = parseHeaderNav('{"home":true,"experimental":{"x":1}}')
    expect(parsed.ok && parsed.config.extra).toEqual({ experimental: { x: 1 } })

    const written = parsed.ok ? serializeHeaderNav(parsed.config) : ''
    expect(JSON.parse(written).experimental).toEqual({ x: 1 })
  })

  it('always writes both access modules as objects, so requireAuth survives', () => {
    const written = JSON.parse(serializeHeaderNav(HEADER_NAV_DEFAULT))
    expect(written.pricing).toEqual({ enabled: true, requireAuth: false })
    expect(written.rankings).toEqual({ enabled: true, requireAuth: false })
  })
})

describe('parseSidebar', () => {
  it('reads an unset key as every section and module shown', () => {
    const parsed = parseSidebar('')
    expect(parsed.ok && parsed.config).toEqual(defaultSidebarConfig())
  })

  it('adds a default module the stored blob predates, on rather than off', () => {
    const parsed = parseSidebar('{"chat":{"enabled":true,"playground":false}}')
    const chat = parsed.ok ? parsed.config.sections.find((section) => section.key === 'chat') : undefined
    expect(chat?.modules).toEqual([
      { enabled: false, key: 'playground' },
      { enabled: true, key: 'chat' },
    ])
  })

  it('keeps a section this build does not know about', () => {
    const parsed = parseSidebar('{"labs":{"enabled":false,"beta":true}}')
    const labs = parsed.ok ? parsed.config.sections.find((section) => section.key === 'labs') : undefined
    expect(labs).toEqual({ enabled: false, key: 'labs', modules: [{ enabled: true, key: 'beta' }] })

    const written = parsed.ok ? JSON.parse(serializeSidebar(parsed.config)) : {}
    expect(written.labs).toEqual({ beta: true, enabled: false })
  })

  it('refuses a section that is not an object, and a module flag it cannot read', () => {
    expect(!parseSidebar('{"chat":true}').ok).toBe(true)
    expect(parseSidebar('{"chat":true}')).toEqual({
      issue: { kind: 'value-unreadable', path: 'chat' },
      ok: false,
    })
    expect(parseSidebar('{"chat":{"playground":"maybe"}}')).toEqual({
      issue: { kind: 'value-unreadable', path: 'chat.playground' },
      ok: false,
    })
  })

  it('round-trips the defaults into the shape the console reads', () => {
    const written = JSON.parse(serializeSidebar(defaultSidebarConfig()))
    expect(written.admin).toEqual({
      channel: true,
      enabled: true,
      models: true,
      redemption: true,
      setting: true,
      subscription: true,
      user: true,
    })
  })
})

describe('sidebar edits', () => {
  it('changes one section flag and leaves its modules alone', () => {
    const next = setSidebarSection(defaultSidebarConfig(), 'admin', false)
    const admin = next.sections.find((section) => section.key === 'admin')
    expect(admin?.enabled).toBe(false)
    expect(admin?.modules.every((module) => module.enabled)).toBe(true)
  })

  it('changes one module in one section', () => {
    const next = setSidebarModule(defaultSidebarConfig(), 'console', 'log', false)
    const written = JSON.parse(serializeSidebar(next))
    expect(written.console.log).toBe(false)
    expect(written.console.token).toBe(true)
    expect(written.chat.chat).toBe(true)
  })
})
