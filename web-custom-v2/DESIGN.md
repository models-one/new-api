# Custom Frontend Architecture

`web-custom-v2` is an independent copy of `web-custom` at commit `197e71579`,
on branch `codex/requesty-style-redesign`. It does not import source files from
either `web/` or `web-custom/`. Existing new-api APIs and authorization rules
remain the integration boundary. The original custom frontend is preserved.

## Visual Direction

The Requesty model library informs the compact navigation, filters, table/card
views and expandable rows. This implementation uses its own graphite/amber
palette: background `#111214`, sidebar `#18191c`, surfaces `#191b1e`, primary
`#e7ad57`, and muted sage for secondary emphasis. Thin borders replace luminous
panels. The shared shell and primitives apply the palette across copied modules;
the model library receives the full layout and interaction redesign.

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

- `src/components/layout/Sidebar.tsx` owns the compact, role-aware left navigation.
- `src/components/layout/TopHeader.tsx` owns the workspace header and account menu.
- `src/components/layout/AppShell.tsx` composes navigation, header, and content.
- `src/styles/index.css` owns the neutral canvas and shared design tokens.

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
`http://127.0.0.1:4174/`, with console pages such as
`http://127.0.0.1:4174/models` available directly. The port is strict so a running
original console at 4173 can be compared alongside this one.

Ordinary routes use real APIs. Development mode retains the source application's
optional auth bypass; set `PUBLIC_PREVIEW_MODE=false` to exercise real
authentication. `API_PROXY_TARGET` points `/api` requests at the backend and
defaults to `http://127.0.0.1:3000`. Production builds enforce authentication.

For a standalone visual review, open `/models?preview=1` in development. This
explicitly loads sample model data through a development-only adapter. A visible
notice identifies the samples. No requests, including writes, are forwarded to
the backend in this mode. Other pages are not simulated. Reload `/models` without
the parameter to return to real APIs. Sample fixtures are excluded from production.

## Model Library Contract

- `GET /api/pricing` supplies models, vendor names, tags, endpoints and groups.
- `GET /api/user/self` selects the account's pricing group by default.
- Search, endpoint/provider/capability filters, availability and pagination work
  locally against that catalogue. Table/card switching preserves filters and comparison.
- Input/output sorting compares flat token rates in the selected group. Per-request
  and tiered models follow in name order because their units are not comparable.
- Details reveal published API routes, groups and billing multipliers, and allow
  copying the model ID. At most two models can be compared.
- Tiered billing never displays fallback ratios as flat prices. Missing group
  multipliers remain unknown. The UI does not fabricate context windows, regions,
  endpoint-specific supplier prices, quantization or data policies.

## Deployment Boundary

The copied application's production asset prefix is `/web-custom-v2-assets/`.
This iteration does not switch the Go router, embedded assets or Docker build
to v2. Existing deployments continue to use `web-custom`. A later integration
must deliberately wire v2's `dist/` and route fallback into the chosen deployment.
