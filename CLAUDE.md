# Easytel CRM — Claude Rules

## ⚠️ HARD RULES — NEVER SKIP

1. **NEVER push to git without explicit user confirmation.** Always stop and ask before running any `git push`. Batch all pending changes together and wait for the user to say "push it" or equivalent before pushing.
2. **NEVER write any code until the user explicitly says to go ahead.** Always plan changes first, confirm the user understands and agrees, then write.
3. **Check for clashes/conflicts before applying changes** and warn the user if any are found.

## Project Overview

CRM for a small Australian Telco. Vite + React 19 + TypeScript app in `app/` (TanStack Query, React Router with hash routes). Supabase backend, GitHub Pages hosting at `/ops/`, GitHub Actions deploy (`.github/workflows/deploy.yml` builds `app/` and publishes `app/dist`).

`index.html` at the repo root is the **old single-file app, frozen as the rollback** — do not edit it. Nothing deploys it; to roll back, revert the commit that changed `deploy.yml`.

## How to Apply Changes

- Edit files under `app/src/`:
  - `pages/` — one per route
  - `components/` — feature pieces (clients, jobs, porting, complaints, notes, shell, split view, users)
  - `hooks/` — data loading (one per table/area)
  - `lib/` — helpers, Supabase client, `db.types.ts`
  - `state/` — React context (auth, modals, toasts, sync, topbar)
  - `nav.ts` — sidebar items, order, icons and topbar titles
- **Don't restyle `src/styles/app.css`** — it's copied verbatim from the old app and is the contract. Write markup to fit the existing classes.
- **Credentials** come from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON` — `app/.env.local` locally (copy from `.env.example`), GitHub secrets in the deploy. Never hard-code them.
- **Adding a field:** ALTER TABLE in Supabase → add to `lib/db.types.ts` → add modal input → add to the save payload → add to display. A new table also needs RLS policies (see the role model memory).
- **Version** lives in `app/package.json` and feeds the topbar, the build and the update bar (`version.json`). The `.githooks/pre-commit` hook bumps it on commits that touch `app/` — but only if `git config core.hooksPath .githooks` is set on that machine; otherwise bump it by hand.
- **Before committing** run `npm run typecheck` in `app/` — the deploy fails on type errors.
- **Running locally:** `cd app && npm install && npm run dev` → http://localhost:5173/ops/
- See `app/README.md` for the design decisions behind the port.
