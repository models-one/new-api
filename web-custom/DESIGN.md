# Custom Frontend Architecture

`web-custom` is an independent React application for the custom console. It
does not import source files from `web/`, so upstream frontend updates can be
merged without coupling the two implementations.

## Stack

- React 19 and TypeScript
- Rsbuild
- Tailwind CSS 4
- TanStack Router
- i18next and react-i18next
- Bun for scripts and dependency management

The dependency versions and compiler settings follow `web/` where practical.

## Layout Ownership

The authenticated console uses one shared application shell:

- `src/components/layout/Sidebar.tsx` owns the Usage-derived left navigation.
- `src/components/layout/TopHeader.tsx` owns the Usage-derived top header.
- `src/components/layout/AppShell.tsx` composes navigation, header, and content.
- `src/styles/index.css` owns the Settings-derived dark canvas background and
  design tokens.

Desktop and mobile use the same component tree. The sidebar becomes an
accessible overlay on narrow viewports; there is no separate mobile page set.

## Feature Ownership

Each console module is isolated under `src/features/<feature>/`:

- `dashboard`
- `settings` (API key management)
- `models`
- `usage`
- `analytics`
- `logs`
- `organization`
- `wallet`

Routes lazy-load each feature to keep the initial console bundle focused on the
shared shell. The public landing page lives under `src/features/landing/` and
does not use the authenticated shell.

## Internationalization

All visible interface text uses `react-i18next`. Locale files live under
`src/i18n/locales/` for `en`, `zh`, `zh-TW`, `fr`, `ja`, `ru`, and `vi`.

Run the consistency check from this directory:

```bash
bun run i18n:sync
```

## Local Development

```bash
bun install
bun run dev
```

The router uses root-level paths. The local preview is available at
`http://127.0.0.1:4173/` when port 4173 is free, with console pages such as
`http://127.0.0.1:4173/dashboard` available directly.

Development mode uses preview data by default so the UI remains accessible
without a backend process. Set `PUBLIC_PREVIEW_MODE=false` to exercise real
authentication and use `API_PROXY_TARGET` to point `/api` requests at a
different backend. Production builds always enforce authentication.

The Go web router serves the custom frontend for `/`, `/dashboard`,
`/settings`, `/models`, `/usage`, `/analytics`, `/logs`, `/organization`, and
`/wallet`. The upstream `web/` frontend continues to serve authentication,
OAuth, administration, and all routes that have not moved to `web-custom`.
