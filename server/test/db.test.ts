import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  openDb, createEntry, getEntry, listEntries, listDueEntries, updateEntry, deleteEntry,
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
});
