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
SQLite      Claude API (classify/extract, Q&A)
```

## Data model

A single `entries` table covers all three domains — not per-domain
tables — so reminders and search work uniformly across everything
captured:

| column        | type      | notes                                             |
|---------------|-----------|----------------------------------------------------|
| `id`          | integer   | primary key                                        |
| `raw_text`    | text      | exactly what the user typed or the transcribed speech |
| `domain`      | text      | `work` \| `finance` \| `personal`                  |
| `type`        | text      | `task` \| `expense` \| `note` \| `reminder` \| `event` |
| `structured`  | text/json | type-specific fields, e.g. `amount`/`currency`/`category` for expenses, `due_date`/`project` for tasks |
| `tags`        | text      | optional, free-form, comma-separated                |
| `remind_at`   | text/null | ISO timestamp, nullable                             |
| `created_at`  | text      | ISO timestamp                                       |
| `updated_at`  | text      | ISO timestamp                                       |

## Capture flow

1. User types in the capture box, or clicks the mic and speaks.
   Speech-to-text uses the browser's built-in Web Speech API — no
   external transcription service in v1 (revisit if accuracy is a
   problem).
2. On submit, the raw text is sent to the backend, which calls the
   Claude API with a prompt instructing it to return `domain`, `type`,
   and a `structured` JSON object matching the type.
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

## Search & Q&A

A search box takes a plain-language question. The backend does a
first-pass filter over SQLite (by domain, date range, keyword match)
to narrow candidate rows, then sends those rows plus the user's
question to Claude, which synthesizes a direct answer.

**Known v1 limitation**: the first-pass filter matches on literal
word overlap between the question and stored text/fields. A question
using different vocabulary than what was captured (e.g. asking about
"food" when an entry's category is "groceries") may fail to surface
a relevant entry, since Claude only sees whatever passed the filter.
Acceptable for v1; revisit with embedding-based or broader recall if
it proves to be a real problem in practice.

## Tech stack

- Node.js + TypeScript
- Vite + React frontend
- Express (or similarly thin) API layer
- SQLite via `better-sqlite3`
- Anthropic SDK for Claude API calls (classification/extraction and
  Q&A synthesis)

## Out of scope for v1

Matches the non-goals in `intent.md`: no external integrations, no
push notifications, no multi-user auth, no actions taken on the
user's behalf, no native mobile app.
