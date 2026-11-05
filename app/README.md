# Easytel CRM — React rebuild

Port of the single-file `index.html` CRM to Vite + React + TypeScript. The goal is that
it looks and behaves identically to the live site; the stylesheet is copied over verbatim
and the markup uses the same class names, so the CSS is the contract.

## Running it

```bash
cd app
npm install
cp .env.example .env.local   # then paste the anon key
npm run dev                  # http://localhost:5173/ops/
```

Both env values are public by design — the anon key is already in the deployed bundle and
access is governed by RLS. `.env.local` is gitignored all the same.

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server on 5173 |
| `npm run build` | Typecheck, then build to `app/dist` |
| `npm run typecheck` | Types only |

## Layout

```
src/lib/         supabase client, db types, formatters, role helpers
src/state/       auth, toasts, sync status, topbar slot — React context
src/hooks/       dark mode, update check
src/components/  auth screens, app shell
src/pages/       one per route
src/styles/      app.css — copied verbatim from index.html, do not restyle
src/nav.ts       sidebar items, order, icons and topbar titles
```

## Decisions worth knowing

**The stylesheet is frozen.** `src/styles/app.css` is lines 11–461 of `index.html`,
unchanged. Markup is written to fit the existing classes rather than the other way round.
If something looks off, the markup is wrong, not the CSS.

**Nav items are divs, not links.** The stylesheet has no anchor reset, so rendering
`.nav-item` as an `<a>` picks up the browser's underline and the sidebar stops matching.

**Tabler icons are pinned to 2.47.0.** `index.html` on main loads `@latest`, which
jsdelivr is *currently* still resolving to 2.47.0 even though npm's latest tag is 3.50.0.
So 2.47.0 is the glyph set the live site actually renders today, and the pin keeps the
rebuild matching it. All 42 icons the app uses also exist in 3.50.0, so a later bump is
low risk — but it is a deliberate change, not a free one, because v3 redrew some glyphs.
The same `@latest` on main will flip to v3 whenever jsdelivr's cache rolls over, which is
worth fixing there too.

**Version checking uses `version.json`.** The old app re-fetched `index.html` and read
`<meta name="version">`. Vite emits hash-named bundles, so the build writes a
`version.json` for the same 5-minute poll to read. Bump `version` in `package.json` to
cut a new version — that single value feeds the topbar, the build and the update bar.

**The sync dot is derived, not driven.** The old app called `setSyncStatus()` by hand in
every load function. Here it reads TanStack Query's fetch state, so every query gets the
amber dot, the 10s watchdog and click-to-retry without wiring.

**Unsaved-work checks are a registry.** `lib/unsavedWork.ts` — each editing surface
registers its own check as it mounts, instead of one function reaching into every dirty
flag by element id.

## Not done yet

Phase 0 is the scaffold: auth, app shell, routing, cross-cutting UI. Every page is a
placeholder. Still to port:

- **Phase 1** — shared primitives: badges, confirm-discard, the modal system (including
  back-button-closes-modal, which Phase 0 leaves out), the notes component, split-view
- **Phase 2** — Clients list, client profile and its six tabs, client/site modals
- **Phase 3** — New Installs, Service Tickets
- **Phase 4** — Porting, Complaints
- **Phase 5** — Dashboard
- **Phase 6** — Users, Audit Log
- **Phase 7** — parity sweep and cutover

`src/lib/db.types.ts` is hand-written from the columns `index.html` actually uses, because
the Supabase connection available here has no schema read permission. Tables are added
phase by phase. Once credentials allow it, replace the file with:

```bash
npx supabase gen types typescript --project-id leppwkkzuscdobqehhts > src/lib/db.types.ts
```

## Deploying

`.github/workflows/preview.yml` builds this branch to `gh-pages:/next`, served at
<https://easytelcrm.github.io/ops/next/>. The live site at `/ops/` keeps coming from
`index.html` on main until cutover.

Main's `deploy.yml` had `force_orphan: true`, which recreated the whole `gh-pages` branch
on every deploy and would have deleted the preview. It now uses `keep_files: true`
instead. The trade-off is that files a build stops producing are left behind, so the
cutover should include one `force_orphan` deploy to clear them out.
