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

The one exception to "a single table" is v1.2's business message
triage, which lives in its own `business_messages` table (see "Business
message triage (v1.2)" below). That's deliberate: triaged messages
must *not* show up in Tasks, Due/Upcoming, search, or recurrence, and
keeping them out of `entries` guarantees that without adding a filter
to every existing query.

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

## Business message triage (v1.2)

A self-contained vertical slice — its own table, redaction step,
classifier, route, and tab — that mirrors the capture flow's shape
but shares no data with `entries`. Everything is named "business
message" (`business_messages` table, `/api/business-messages`,
`BusinessMessage` type) so it isn't mistaken for any other kind of
message.

### Data model

`business_messages` table, created in `openDb()` alongside `entries`
(`CREATE TABLE IF NOT EXISTS`, so existing databases pick it up on
next start with no migration):

| column                | type      | notes                                                    |
|-----------------------|-----------|-----------------------------------------------------------|
| `id`                  | integer   | primary key                                               |
| `raw_text`            | text      | the pasted message, verbatim and **unredacted** (it never leaves the machine) |
| `category`            | text      | `request` \| `question` \| `complaint` \| `sales_lead` \| `fyi` \| `spam` |
| `priority`            | text      | `urgent` \| `high` \| `medium` \| `low`                   |
| `priority_overridden` | integer   | `0` \| `1`, default `0`; set to `1` whenever the user sets `priority` |
| `priority_reason`     | text      | one short sentence from Gemini explaining the priority it chose |
| `summary`             | text      | one-line summary from Gemini                              |
| `sender`              | text/null | sender name/org if identifiable from the text, else null  |
| `status`              | text      | `open` \| `done`; set at insert to `done` if `category = 'spam'`, else `open` |
| `created_at`          | text      | ISO timestamp                                             |
| `updated_at`          | text      | ISO timestamp                                             |

### Redaction and truncation

Before any business message text is sent to Gemini it goes through
`redactSensitive()` (`server/src/redact.ts`), applied in this order:

| pattern | example | replaced with |
|---------|---------|---------------|
| email address | `jane.doe+sales@globex.co.uk` | `[EMAIL]` |
| international phone (leading `+` and country code) | `+44 20 7946 0958`, `+1 (555) 123-4567` | `[PHONE]` |
| long number: 12+ digits, optionally separated by spaces/dashes (cards, account numbers) | `4111 1111 1111 1111` | `[NUMBER]` |
| North American local phone | `(555) 123-4567`, `555-123-4567`, `555.123.4567` | `[PHONE]` |

Short numbers (quantities, amounts, times, invoice ids, ISO dates like
`2026-09-14`) are left alone, because priority often depends on them.
Names are not redacted, so sender extraction still works.

The redacted text is then truncated to its first **1,000 characters**
(`MAX_TRIAGE_CHARS`). Redaction runs *before* truncation so a cut can
never leave a partial, unredacted email address or number behind.
Longer pastes are never rejected: the full original is still stored
in `raw_text`, and only the first 1,000 redacted characters are
classified.

Known limitation: these are regexes, not a PII detector. Other local
phone formats (e.g. UK `020 7946 0958`) and non-numeric identifiers
won't be caught. Revisit if that matters in practice.

### Triage flow

1. User pastes a message into the Business tab's textarea and submits.
2. `POST /api/business-messages` calls `triageBusinessMessage()`
   (`server/src/gemini.ts`). It computes
   `redactSensitive(rawText).slice(0, MAX_TRIAGE_CHARS)` itself, so
   no caller can bypass redaction, and sends only that text to Gemini.
   It uses the same model (`gemini-flash-lite-latest`) and JSON
   response mode as `classifyEntry()`, with a system prompt asking for
   `{ category, priority, priority_reason, summary, sender }`. The
   prompt explains the `[EMAIL]`/`[PHONE]`/`[NUMBER]` placeholders and
   gives priority guidance:
   - **urgent** — time-sensitive or blocking (outage, legal/security
     issue, deadline today, an angry customer threatening to leave)
   - **high** — needs a reply soon (a customer or stakeholder waiting
     on a decision, a warm sales lead)
   - **medium** — routine requests and questions without time pressure
   - **low** — FYI, newsletters, cold outreach, spam
3. An unrecognized `category` or `priority` throws (same policy as
   `domain`/`type` in `classifyEntry`). These values drive sorting and
   display, so a bad value is a failure, not something to store.
   Missing `summary`/`priority_reason` default to `''`, and a missing,
   empty, or non-string `sender` becomes `null`.
4. The message is saved immediately with the **unredacted** `raw_text`
   and no confirmation step, matching the capture flow. Status is
   `done` for spam and `open` for everything else.

### API

| route                                | behavior |
|--------------------------------------|----------|
| `POST /api/business-messages`        | body `{ raw_text }`; 400 if empty; triage + save → 201 with the message; 502 `{ error: 'triage failed', detail }` if Gemini fails or returns invalid output. Logs one `logPerf('triage', { raw_text_len, classify_ms, db_ms, total_ms })` line (or `triage_failed`). |
| `GET /api/business-messages`         | all messages, sorted: open before done, then priority rank (urgent → low), then newest first (`id` breaks ties) |
| `PATCH /api/business-messages/:id`   | body is a non-empty object whose only keys are `status` (`open` \| `done`) and/or `priority` (`urgent` \| `high` \| `medium` \| `low`). Any other key (including `category`), an empty body, an invalid value, or a non-numeric id → 400; a missing row → 404. Any request that includes `priority` sets `priority_overridden = 1`, even if the value is unchanged; a status-only update leaves the flag alone. Returns the updated message. |
| `DELETE /api/business-messages/:id`  | 204; 400 for non-numeric id; 404 if missing |

`category` is never patchable. There's no way to reset
`priority_overridden` back to 0, and the AI's original priority isn't
kept (see intent.md non-goals).

### UI

- `App.tsx` gains a tab bar under the header: **Personal** (the
  existing capture box, Due/Upcoming, Tasks, and Search, unchanged)
  and **Business**. The selected tab is plain React state (default
  Personal, not remembered across reloads), not a URL route, since
  two views don't justify a router.
- **Tab count.** The Business tab label reads `Business (n)` where
  `n` is the number of open business messages, or plain `Business`
  when `n` is 0. `App` fetches `GET /api/business-messages` once on
  mount to seed the count. After that, `BusinessTab` reports changes
  through an `onOpenCountChange(n)` prop, calling it only once its
  own initial load has finished so the badge never flashes to 0.
- `BusinessTab.tsx` owns its own message list (fetched on mount):
  - A multi-line textarea + **Triage** button. While waiting, the
    button is disabled; errors show inline (`role="alert"`) the same
    way `CaptureBox` does. No length counter, since long pastes are
    truncated server-side, not rejected.
  - **Voice input.** A mic button appears when the browser supports
    the Web Speech API (same detection as `CaptureBox`, shared via
    `client/src/speech.ts`). Unlike the Personal box, each transcript
    is **appended** to the textarea (space-separated) rather than
    replacing it, so a longer message can be dictated in parts.
  - **Filters and layout** (client-only, no API params — same approach
    as the Personal Tasks list). Once any messages exist, the Open
    section shows two single-select pill rows, **Priority** (All /
    Urgent / High / Medium / Low) and **Category** (All / Request /
    Question / Complaint / Sales lead / FYI / Spam), combined with AND
    and applied to both Open and Done. Section counts reflect the
    filtered results, but the tab badge always counts all open
    messages. If messages exist but none match, Open reads "No messages
    match these filters." Beside the filters, the same **list / card**
    toggle as the Tasks list (☰ / ▦, default list, not persisted)
    switches both sections between rows and the shared `entry-cards`
    grid. Filter and layout choices reset when the tab remounts.
  - An **Open** list. Each row shows:
    - a colored priority badge, which is a `<select>` (aria-label
      "Priority") so it can be changed in place, plus a small
      **edited** marker when `priority_overridden = 1`
    - a category chip, the sender (if any), and the summary
    - the priority reason, labeled as the AI's reasoning
    - the full raw text, expandable

    Row actions: a **Mark done** / **Reopen** toggle button
    (`aria-pressed`, accent-highlighted when done) and **Delete**.
  - A collapsed **Done (n)** section holding done messages (including
    auto-filed spam), with the same row UI; **Reopen** moves a message
    back to Open.
  - Order comes from the API's sort. A newly triaged message is
    inserted in its sorted position client-side, and changing status
    or priority re-sorts locally.
  - **Row errors.** Changing done/priority or deleting is not
    optimistic: the row updates only after the server responds. If
    the request fails, the row stays exactly as it was and shows a
    small inline `role="alert"` error, which clears on that row's
    next successful action.

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
