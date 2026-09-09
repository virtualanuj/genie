import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  openDb, createEntry, getEntry, listEntries, listDueEntries, updateEntry, deleteEntry,
  advanceRecurringEntries,
} from '../src/db.js';

describe('db', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('creates and reads back an entry', () => {
    const entry = createEntry(db, {
      raw_text: 'pay rent $1500',
      domain: 'finance',
      type: 'expense',
      structured: { amount: 1500, currency: 'USD', category: 'rent' },
      remind_at: null,
    });
    expect(entry.id).toBeTypeOf('number');
    expect(entry.domain).toBe('finance');
    expect(JSON.parse(entry.structured)).toEqual({ amount: 1500, currency: 'USD', category: 'rent' });

    const fetched = getEntry(db, entry.id);
    expect(fetched?.raw_text).toBe('pay rent $1500');
  });

  it('lists entries newest first', () => {
    createEntry(db, { raw_text: 'first', domain: 'personal', type: 'note', structured: {} });
    createEntry(db, { raw_text: 'second', domain: 'personal', type: 'note', structured: {} });
    const entries = listEntries(db);
    expect(entries.map((e) => e.raw_text)).toEqual(['second', 'first']);
  });

  it('lists only due entries at or before the given time', () => {
    createEntry(db, {
      raw_text: 'due soon', domain: 'work', type: 'task', structured: {}, remind_at: '2020-01-01T00:00:00.000Z',
    });
    createEntry(db, {
      raw_text: 'due later', domain: 'work', type: 'task', structured: {}, remind_at: '2099-01-01T00:00:00.000Z',
    });
    createEntry(db, { raw_text: 'no due date', domain: 'work', type: 'note', structured: {} });

    const due = listDueEntries(db, '2020-06-01T00:00:00.000Z');
    expect(due.map((e) => e.raw_text)).toEqual(['due soon']);
  });

  it('updates an entry and bumps updated_at', async () => {
    const entry = createEntry(db, { raw_text: 'buy milk', domain: 'personal', type: 'task', structured: {} });
    await new Promise((r) => setTimeout(r, 5));
    const updated = updateEntry(db, entry.id, { raw_text: 'buy oat milk' });
    expect(updated?.raw_text).toBe('buy oat milk');
    expect(updated?.updated_at).not.toBe(entry.updated_at);
  });

  it('returns undefined when updating a missing entry', () => {
    expect(updateEntry(db, 999, { raw_text: 'x' })).toBeUndefined();
  });

  it('deletes an entry', () => {
    const entry = createEntry(db, { raw_text: 'temp', domain: 'personal', type: 'note', structured: {} });
    expect(deleteEntry(db, entry.id)).toBe(true);
    expect(getEntry(db, entry.id)).toBeUndefined();
    expect(deleteEntry(db, entry.id)).toBe(false);
  });

  it('stores and retrieves recurrence, series_id, and spawned_next', () => {
    const entry = createEntry(db, {
      raw_text: 'pay rent', domain: 'finance', type: 'expense', structured: { amount: 1500 },
      remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    });
    expect(JSON.parse(entry.recurrence!)).toEqual({ freq: 'monthly', interval: 1 });
    expect(entry.series_id).toBeNull();
    expect(entry.spawned_next).toBe(0);
  });

  it('updateEntry can set and clear recurrence', () => {
    const entry = createEntry(db, {
      raw_text: 'pay rent', domain: 'finance', type: 'expense', structured: {},
      remind_at: '2026-01-05T00:00:00.000Z',
    });
    const withRecurrence = updateEntry(db, entry.id, { recurrence: { freq: 'weekly', interval: 2 } });
    expect(JSON.parse(withRecurrence!.recurrence!)).toEqual({ freq: 'weekly', interval: 2 });

    const cleared = updateEntry(db, entry.id, { recurrence: null });
    expect(cleared!.recurrence).toBeNull();
  });

  it('updateEntry resets spawned_next when remind_at changes', () => {
    const entry = createEntry(db, {
      raw_text: 'pay rent', domain: 'finance', type: 'expense', structured: {},
      remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    });
    advanceRecurringEntries(db, '2026-01-06T00:00:00.000Z');
    expect(getEntry(db, entry.id)!.spawned_next).toBe(1);

    const updated = updateEntry(db, entry.id, { remind_at: '2026-03-01T00:00:00.000Z' });
    expect(updated!.spawned_next).toBe(0);
  });

  it('updateEntry leaves spawned_next untouched when remind_at/recurrence are unchanged', () => {
    const entry = createEntry(db, {
      raw_text: 'pay rent', domain: 'finance', type: 'expense', structured: {},
      remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    });
    advanceRecurringEntries(db, '2026-01-06T00:00:00.000Z');

    const updated = updateEntry(db, entry.id, { raw_text: 'pay rent (updated)' });
    expect(updated!.spawned_next).toBe(1);
  });
});

describe('advanceRecurringEntries', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('spawns the next occurrence for a due recurring entry', () => {
    const source = createEntry(db, {
      raw_text: 'pay rent', domain: 'finance', type: 'expense', structured: { amount: 1500 },
      remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    });

    const created = advanceRecurringEntries(db, '2026-01-06T00:00:00.000Z');

    expect(created).toHaveLength(1);
    expect(created[0].remind_at).toBe('2026-02-05T00:00:00.000Z');
    expect(created[0].series_id).toBe(source.id);
    expect(created[0].raw_text).toBe('pay rent');

    const updatedSource = getEntry(db, source.id)!;
    expect(updatedSource.spawned_next).toBe(1);
  });

  it('does not spawn twice for the same source', () => {
    createEntry(db, {
      raw_text: 'pay rent', domain: 'finance', type: 'expense', structured: {},
      remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    });

    advanceRecurringEntries(db, '2026-01-06T00:00:00.000Z');
    const secondPass = advanceRecurringEntries(db, '2026-01-06T00:00:00.000Z');

    expect(secondPass).toHaveLength(0);
  });

  it('chains series_id through multiple spawned occurrences', () => {
    const source = createEntry(db, {
      raw_text: 'pay rent', domain: 'finance', type: 'expense', structured: {},
      remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    });
    const [first] = advanceRecurringEntries(db, '2026-01-06T00:00:00.000Z');
    const [second] = advanceRecurringEntries(db, '2026-02-06T00:00:00.000Z');

    expect(first.series_id).toBe(source.id);
    expect(second.series_id).toBe(source.id);
  });

  it('ignores entries with no recurrence', () => {
    createEntry(db, {
      raw_text: 'one-off', domain: 'personal', type: 'note', structured: {},
      remind_at: '2020-01-01T00:00:00.000Z',
    });
    expect(advanceRecurringEntries(db, '2026-01-01T00:00:00.000Z')).toHaveLength(0);
  });

  it('ignores recurring entries that are not due yet', () => {
    createEntry(db, {
      raw_text: 'pay rent', domain: 'finance', type: 'expense', structured: {},
      remind_at: '2099-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    });
    expect(advanceRecurringEntries(db, '2026-01-01T00:00:00.000Z')).toHaveLength(0);
  });

  it('clamps monthly recurrence to the target month\'s last valid day instead of overflowing', () => {
    createEntry(db, {
      raw_text: 'month-end bill', domain: 'finance', type: 'expense', structured: {},
      remind_at: '2026-01-31T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    });
    const [spawned] = advanceRecurringEntries(db, '2026-02-01T00:00:00.000Z');
    expect(spawned.remind_at).toBe('2026-02-28T00:00:00.000Z');
  });

  it('stops the series instead of looping when recurrence freq is unrecognized', () => {
    const source = createEntry(db, {
      raw_text: 'bad freq', domain: 'finance', type: 'expense', structured: {},
      remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'hourly' as never, interval: 1 },
    });
    const created = advanceRecurringEntries(db, '2026-01-06T00:00:00.000Z');
    expect(created).toHaveLength(0);
    expect(getEntry(db, source.id)!.spawned_next).toBe(1);
    expect(advanceRecurringEntries(db, '2026-01-07T00:00:00.000Z')).toHaveLength(0);
  });

  it('stops the series instead of crashing when remind_at is unparseable', () => {
    const source = createEntry(db, {
      raw_text: 'bad date', domain: 'finance', type: 'expense', structured: {},
      remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    });
    // Lexicographically <= the "now" cutoff below (so the SQL due-filter still
    // selects it) but unparseable as a Date, to exercise the guard itself.
    db.prepare('UPDATE entries SET remind_at = ? WHERE id = ?').run('2020-01-01Xgarbage', source.id);

    expect(() => advanceRecurringEntries(db, '2026-01-06T00:00:00.000Z')).not.toThrow();
    expect(advanceRecurringEntries(db, '2026-01-06T00:00:00.000Z')).toHaveLength(0);
    expect(getEntry(db, source.id)!.spawned_next).toBe(1);
  });
});
