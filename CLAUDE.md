# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Genie is a local-first personal capture app: type or speak anything (a task,
expense, note, reminder) and it's classified, stored, and later searchable.
Full product intent is in `docs/intent.md`; full architecture and data model
is in `docs/spec.md`. Read those before making changes that touch the data
model, recurrence, or search — this file only summarizes what's needed for
day-to-day work.

npm workspaces monorepo: `client` (React + Vite) and `server` (Express +
TypeScript), backed by a single SQLite file (`better-sqlite3`), with Google's
Gemini API (`@google/genai`) doing classification/extraction and Q&A
synthesis.

## Commands

- `npm install` — installs both workspaces (root).
- `npm run dev` — runs server (`tsx watch`, :3001) and client (Vite, :5173,
  proxying `/api` to :3001) concurrently.
- `npm run build` — builds client then server.
- `npm start` — production mode: one Express process serves the built client
  and the API on :3001 (override with `PORT`).
- `npm test` — runs server then client vitest suites.
- Single test file: `npm run test --workspace=server -- test/db.test.ts` (or
  `--workspace=client -- test/App.test.tsx`); add `-t "test name"` to run one
  test.
- Requires `GEMINI_API_KEY` — set as an env var, or put
  `GEMINI_API_KEY=<key>` in a gitignored `local.properties` file at the repo
  root (loaded automatically by the server on startup if the env var isn't
  already set).

## Architecture notes

- **One `entries` table for everything.** Work/finance/personal items and
  task/expense/note/reminder/event types all live in a single `entries`
  table (`server/src/db.ts`), not per-domain tables, so reminders and search
  work uniformly. Type-specific fields go in the `structured` JSON column.
  Full column reference in `docs/spec.md`.

- **Capture flow.** Raw text → `classifyEntry()` (`server/src/gemini.ts`)
  calls Gemini to produce `domain`/`type`/`structured`/`remind_at`/
  `recurrence` → saved immediately via `createEntry()`, no confirmation
  step (nothing irreversible happens on save).

- **Recurrence is lazily materialized, not a background job.**
  `advanceRecurringEntries()` (`server/src/db.ts`) runs at the top of both
  `GET /api/entries` and `GET /api/entries/due` (`server/src/routes/entries.ts`).
  For any row with `recurrence` set, `spawned_next = 0`, and `remind_at` in
  the past, it inserts a new entry for the next occurrence (linked via
  `series_id`) and marks the source row `spawned_next = 1` so it's never
  spawned twice. Each occurrence is its own row — history is never
  overwritten. Deleting an entry before this check runs simply stops the
  series.

- **Search is two-stage.** `filterCandidates()` (`server/src/search.ts`)
  does a literal keyword pre-filter over SQLite rows to narrow candidates,
  then `answerQuestion()` sends those rows to Gemini to synthesize an
  answer. Known limitation: vocabulary mismatch between the question and
  stored text (e.g. "food" vs. a category of "groceries") can cause the
  filter to miss relevant entries before Gemini ever sees them.

- **DI seam for testing.** `buildApp(db, gemini)` (`server/src/app.ts`)
  takes the SQLite handle and a `Pick<GoogleGenAI, 'models'>` directly, so
  routers are testable with fakes/mocks — see `server/test/*.test.ts` for
  the pattern.

- **Production serving.** `server/src/index.ts` serves the built client
  (`client/dist`) as static files and falls back to `index.html` for
  client-side routing, alongside the `/api` routes — no separate frontend
  server in production.

- **Forced IPv4 for Gemini requests.** `server/src/index.ts` calls
  `setDefaultResultOrder('ipv4first')` *and* `setGlobalDispatcher(new
  Agent({ connect: { family: 4 } }))` (from `undici`) because Gemini's
  hostname can resolve to IPv6 in some environments and hang or take
  30-40+ seconds per request instead of erroring or falling back. The DNS
  fix alone isn't sufficient: `@google/genai` calls the global `fetch`,
  which does its own per-request dual-stack connection attempt and doesn't
  reliably honor the DNS order, so the undici dispatcher forcing IPv4-only
  sockets is the fix that actually matters; the DNS order change is kept
  as defense-in-depth for other lookups. Both are deliberate workarounds,
  not incidental — measured directly (see git history) at ~40s/request
  without the dispatcher fix vs. sub-2s with it.

- **Some list behavior is client-only, with no API surface.** The Recent
  list's domain filter and due-date-ascending sort, and the Due/Upcoming
  split, are all computed client-side from the existing `/api/entries` and
  `/api/entries/due` responses (`client/src/EntryList.tsx`,
  `client/src/DuePanel.tsx`) — there's no server-side filter/sort param.

# Development Workflow Rules

## Main Branch Protection
* **No Direct Fixes:** Do not make bug fixes, code review updates, or lint error corrections directly on the `main` branch.
* **Working Build Trigger:** This rule is active as soon as the repository has a stable, working software build.
* **Branch Requirement:** Always create a new branch for any fixes, refactoring, or code improvements.
