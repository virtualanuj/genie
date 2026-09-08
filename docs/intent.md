# Personal Genie — Intent

## Problem

Managing work, finance, and personal life today means juggling
multiple apps and lists, and deciding up front which one a given
thing belongs to before you can even write it down. That friction
means things get forgotten or never captured at all.

The goal: a single place to capture anything — a task, an expense, a
note, a reminder — by typing or speaking, without deciding in advance
where it belongs. The genie figures out what it is, files it away,
and later helps you find it and reminds you when it's due.

## Goals (v1)

- **Single capture point.** One text box (with a mic option) is the
  only interface needed to log something.
- **Automatic classification.** The system infers the domain (work /
  finance / personal) and type (task, expense, note, reminder, event)
  from what was typed or said.
- **Automatic extraction.** Structured details present in the text —
  amounts, dates, categories, etc. — are pulled out automatically.
- **Reminders.** Anything with a due/remind date surfaces in an
  upcoming/due view when the app is opened.
- **Natural-language recall.** You can ask plain-language questions
  ("how much did I spend on food this month", "what's due this week")
  and get an answer synthesized from what's been captured.
- **Correctable.** If something is categorized or extracted wrong,
  it's easy to edit or delete.

## Goals (v1.1)

- **Recurrence detection.** If you say something recurs ("pay rent
  every month", "gym every Monday"), the genie recognizes that and
  keeps reminding you for every future occurrence — not just once.
- **History preserved.** Each occurrence of a recurring item is its
  own captured entry, so past occurrences stay searchable and countable
  (e.g. "how much have I spent on rent this year") rather than being
  overwritten.
- **Visible recurrence.** Entries the genie recognizes as recurring
  are visually marked as such.
- **Due vs. Upcoming.** The at-a-glance reminder view distinguishes
  what's due right now from what's coming up soon, instead of lumping
  both together.
- **Filterable, priority-sorted recent list.** You can filter your
  captured entries (by domain) and they're sorted so what's due
  soonest surfaces first.

## Non-goals (v1)

These are deliberately out of scope for the first version, to keep it
buildable. Revisit later if they turn out to matter:

- No actions taken on your behalf — no sending messages, paying
  bills, or creating calendar invites. The genie organizes and
  reminds; you act.
- No bank, calendar, or email integrations/sync.
- No push notifications — reminders are visible when the app is open,
  not pushed to a device.
- No multi-device accounts or auth — this is a single-user, local
  tool.
- No native mobile app.

## Success criteria

You can, from one text/voice box, log a work task, an expense, and a
personal reminder in under 10 seconds each; see them correctly
categorized; get reminded of due items when opening the app; and ask
a plain-language question that gets answered from what's stored.
