# Easytel CRM

The live CRM at <https://easytelcrm.github.io/ops/>: a Vite + React + TypeScript port of
the old single-file `index.html` app, built to look and behave identically to it. The
stylesheet is copied over verbatim and the markup uses the same class names, so the CSS
is the contract.

The root `index.html` is frozen as the rollback and nothing deploys it — see
[Deploying](#deploying).

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
src/lib/         supabase client, db types, formatters, role helpers, per-feature logic
src/state/       auth, modals, toasts, sync status, topbar slot — React context
src/hooks/       data loading per table/area, dark mode, update check
src/components/  auth screens, app shell, split view, and one folder per feature
                 (clients, jobs, porting, complaints, notes, users)
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
The frozen rollback `index.html` still loads `@latest`, so if it is ever redeployed it
may come up with v3 glyphs.

**Version checking uses `version.json`.** The old app re-fetched `index.html` and read
`<meta name="version">`. Vite emits hash-named bundles, so the build writes a
`version.json` for the same 5-minute poll to read. `version` in `package.json` is the
single value that feeds the topbar, the build and the update bar. `.githooks/pre-commit`
bumps the patch number on any commit that touches `app/` (and leaves a hand-set version
alone), but only on machines with `git config core.hooksPath .githooks` set.

**The sync dot is derived, not driven.** The old app called `setSyncStatus()` by hand in
every load function. Here it reads TanStack Query's fetch state, so every query gets the
amber dot, the 10s watchdog and click-to-retry without wiring.

**Unsaved-work checks are a registry.** `lib/unsavedWork.ts` — each editing surface
registers its own check as it mounts, instead of one function reaching into every dirty
flag by element id.

## History

The port went in phases on the `react-rebuild` branch: scaffold and auth (0), shared
primitives (1), clients (2), New Installs and Service Tickets (3), Porting and Complaints
(4), Dashboard (5), Users and Audit Log (6), then cutover. Every page of the old app now
exists here.

## Database types

`src/lib/db.types.ts` is hand-written from the columns `index.html` actually uses, because
the Supabase connection available here has no schema read permission. Tables are added
phase by phase. Once credentials allow it, replace the file with:

```bash
npx supabase gen types typescript --project-id leppwkkzuscdobqehhts > src/lib/db.types.ts
```

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci`, typecheck, build with
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON` from the repo secrets, then publish `app/dist`
to the `gh-pages` branch, served at <https://easytelcrm.github.io/ops/>. A type error
fails the deploy.

It uses `force_orphan: true`, so `gh-pages` is rebuilt from scratch each time and stale
hashed assets don't pile up. That's safe because only this one site publishes there; the
`/ops/next/` preview and its `preview.yml` were removed at cutover.

**Rollback:** the root `index.html` is the old app, left untouched. Reverting the cutover
commit (the one that changed `deploy.yml` to build `app/`) puts it back on the live site on
the next push.
