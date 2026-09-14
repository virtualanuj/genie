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

## Goals (v1.2) — Business message triage

Inbound business messages (emails, Slack/Teams messages, customer
notes) arrive faster than they can be read carefully, and it isn't
obvious at a glance which ones need a reply first. Personal capture
doesn't fit this: these aren't things *you* want to remember, they're
things other people are waiting on.

- **Separate Business tab.** A second tab, next to the existing
  personal capture view, dedicated to triaging inbound messages.
- **Paste and triage.** You paste a message (multi-line, any length
  a normal email would be) and the genie classifies it into a
  category — request, question, complaint, sales lead, FYI, or spam —
  and assigns a priority: urgent, high, medium, or low.
- **Explained priority.** Each message shows a one-line summary and a
  short reason for the priority it was given, so you can trust (or
  mentally discount) the ranking without re-reading the whole message.
- **Correctable priority.** If the genie gets a priority wrong, you
  can change it in one click. A changed priority is visibly marked as
  edited, so you can tell your call apart from the genie's.
- **Worst-first list.** Open messages are listed by priority (urgent
  first), newest first within a priority.
- **Open → done.** You mark a message done once it's handled; done
  messages collapse out of the way but aren't lost. Messages can also
  be deleted.
- **Spam files itself away.** Messages classified as spam are saved as
  already done, so they never clutter the open list, but you can
  reopen one if the genie was wrong.
- **Visible from anywhere.** The Business tab label shows how many
  messages are still open, so you notice waiting messages while on
  the Personal tab.
- **Privacy-aware.** Email addresses, phone numbers, and long
  card/account-like numbers are stripped from a message before it
  leaves your machine for classification. The original stays in your
  local database. Only the first ~1,000 characters are analyzed.

## Non-goals (v1.2)

- No editing of category, and no record of what the genie originally
  picked once you override a priority.
- No redaction of names, company names, or other free-text details.
  Only emails, phone numbers, and long numbers are removed.
- No analysis of very long threads beyond their first ~1,000
  characters. The full text is still stored and viewable.
- No link to personal entries — business messages don't appear in
  Tasks, Due/Upcoming, or Ask Genie search, and don't create tasks or
  reminders.
- No email/Slack/inbox integration — messages are pasted by hand
  (consistent with v1's no-integrations non-goal).
- No richer workflow (in progress, waiting, assignee, SLA timers) —
  just open and done.
- No replies drafted or sent on your behalf.

## Success criteria (v1.2)

You can paste a business message and see its category, priority,
summary, and reason within a few seconds. Urgent messages sit at the
top of the open list. You can fix a wrong priority in one click. Spam
never shows up among open messages. The Business tab shows how many
messages are waiting. No email address or phone number from a pasted
message is ever included in a request to Gemini (verified by tests).

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
