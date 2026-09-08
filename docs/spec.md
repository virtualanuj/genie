# Personal Genie — Architecture & Design

See [`intent.md`](./intent.md) for the requirements this design
serves.

## High-level architecture

One local process serves both a small API and a React/Vite frontend,
backed by a single SQLite file. It runs with one command (e.g. `npm
run dev` / `npm start`) on the user's own machine, and is reachable
from other devices on the same home network by IP. No auth is needed
since this is a single local user. (Remote access via something like
Tailscale is a possible future addition, not part of v1.)

```
Browser (capture UI, mic input)
   │  fetch/JSON
   ▼
Node/TypeScript API (Express)
   │            │
   ▼            ▼
SQLite      Gemini API (classify/extract, Q&A)
```

## Data model

A single `entries` table covers all three domains — not per-domain
tables — so reminders and search work uniformly across everything
captured:

| column          | type      | notes                                             |
|-----------------|-----------|----------------------------------------------------|
| `id`            | integer   | primary key                                        |
| `raw_text`      | text      | exactly what the user typed or the transcribed speech |
| `domain`        | text      | `work` \| `finance` \| `personal`                  |
| `type`          | text      | `task` \| `expense` \| `note` \| `reminder` \| `event` |
| `structured`    | text/json | type-specific fields, e.g. `amount`/`currency`/`category` for expenses, `due_date`/`project` for tasks |
| `tags`          | text      | optional, free-form, comma-separated                |
| `remind_at`     | text/null | ISO timestamp, nullable                             |
| `recurrence`    | text/null | JSON, nullable — `{ freq: 'daily'\|'weekly'\|'monthly'\|'yearly', interval: number }` (v1.1) |
| `series_id`     | int/null  | nullable — id of the original entry that started this recurring series; null on the original itself (v1.1) |
| `spawned_next`  | boolean   | default false — whether this row has already produced its next occurrence (v1.1) |
| `created_at`    | text      | ISO timestamp                                       |
| `updated_at`    | text      | ISO timestamp                                       |

## Capture flow

1. User types in the capture box, or clicks the mic and speaks.
   Speech-to-text uses the browser's built-in Web Speech API — no
   external transcription service in v1 (revisit if accuracy is a
   problem).
2. On submit, the raw text is sent to the backend, which calls the
   Gemini API with a prompt instructing it to return `domain`, `type`,
   a `structured` JSON object matching the type, and — v1.1 — an
   optional `recurrence` pattern if the text implies one recurs.
3. The entry is saved immediately (no confirmation step — nothing
   irreversible happens on save, matching the "organize + remind"
   autonomy level) and shown in a recent-entries list so the user can
   see how it was categorized and edit or delete it if it's wrong.

## Reminders

A "Due / Upcoming" panel on the home screen queries entries where
`remind_at` is set and falls at or before "now + 24 hours" — i.e.
already overdue, or due within the next day. This 24-hour look-ahead
window is fixed for v1 (not configurable per entry or globally). No
push notifications — the user sees this when the app is open.

As of v1.1, the panel splits that same fetch into two sections:
**Due** (`remind_at <= now`) and **Upcoming** (`now < remind_at <=
now + 24h`) — partitioned client-side from one fetch, not two
API calls.

## Recurrence (v1.1)

An entry with a non-null `recurrence` represents a repeating
task/event. Rather than overwriting `remind_at` in place when an
occurrence comes due (which would destroy history search relies on),
each occurrence is **materialized as its own independent entry**,
linked back to the original via `series_id`. This keeps every past
occurrence normal, searchable, editable, and deletable — recurrence
is not a special case elsewhere in the app.

Advancement is lazy, not a background job (the app isn't assumed to
be always running): `advanceRecurringEntries()` runs at the top of
`GET /api/entries` and `GET /api/entries/due`. For every row where
`recurrence IS NOT NULL AND spawned_next = false AND remind_at <=
now`, it inserts a new entry (same `raw_text`/`domain`/`type`/
`structured`/`recurrence`, `remind_at` advanced by one `interval` of
`freq`, `series_id` pointing at the series' original entry), then
marks the source row `spawned_next = true` so it's never spawned
twice. Deleting an entry before this check runs naturally stops the
series — no separate "stop recurring" action is needed.

Entries with `recurrence` set show a small recurrence indicator in
the UI (`EntryList`, `DuePanel`).

## Recent list: filter + sort (v1.1)

The Recent entries list gets client-side (no API change — personal-
scale data):
- **Filter** by `domain` via pill buttons (All / Work / Finance /
  Personal).
- **Sort**: entries with `remind_at` set sort ascending (soonest due
  first); entries without one follow, newest-first (matching v1's
  original default for non-deadline captures).

## Search & Q&A

A search box takes a plain-language question. The backend does a
first-pass filter over SQLite (by domain, date range, keyword match)
to narrow candidate rows, then sends those rows plus the user's
question to Gemini, which synthesizes a direct answer.

**Known v1 limitation**: the first-pass filter matches on literal
word overlap between the question and stored text/fields. A question
using different vocabulary than what was captured (e.g. asking about
"food" when an entry's category is "groceries") may fail to surface
a relevant entry, since Gemini only sees whatever passed the filter.
Acceptable for v1; revisit with embedding-based or broader recall if
it proves to be a real problem in practice.

## Tech stack

- Node.js + TypeScript
- Vite + React frontend
- Express (or similarly thin) API layer
- SQLite via `better-sqlite3`
- Google's `@google/genai` SDK for Gemini API calls (classification/extraction
  and Q&A synthesis)

## Out of scope for v1

Matches the non-goals in `intent.md`: no external integrations, no
push notifications, no multi-user auth, no actions taken on the
user's behalf, no native mobile app.
