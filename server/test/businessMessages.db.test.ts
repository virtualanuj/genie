import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  openDb, createBusinessMessage, getBusinessMessage, listBusinessMessages, updateBusinessMessage,
  deleteBusinessMessage, listEntries, type NewBusinessMessage,
} from '../src/db.js';

const base: NewBusinessMessage = {
  raw_text: 'Hi, our invoice is wrong. Call me on 555-123-4567.',
  category: 'complaint',
  priority: 'high',
  priority_reason: 'Customer billing issue awaiting a reply',
  summary: 'Customer reports incorrect invoice',
  sender: 'Acme Corp',
};

describe('business messages db', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('creates a message with status open, no override, and timestamps', () => {
    const m = createBusinessMessage(db, base);
    expect(m).toMatchObject({ ...base, status: 'open', priority_overridden: 0 });
    expect(m.id).toBeGreaterThan(0);
    expect(m.created_at).toBe(m.updated_at);
    expect(getBusinessMessage(db, m.id)).toEqual(m);
  });

  it('saves spam as done', () => {
    expect(createBusinessMessage(db, { ...base, category: 'spam', priority: 'low' }).status).toBe('done');
  });

  it('stores a null sender when omitted', () => {
    const { sender: _omit, ...noSender } = base;
    expect(createBusinessMessage(db, noSender).sender).toBeNull();
  });

  it('lists open before done, then by priority rank, then newest first', () => {
    const lowOld = createBusinessMessage(db, { ...base, priority: 'low' });
    const urgent = createBusinessMessage(db, { ...base, priority: 'urgent' });
    const lowNew = createBusinessMessage(db, { ...base, priority: 'low' });
    const doneUrgent = createBusinessMessage(db, { ...base, priority: 'urgent' });
    updateBusinessMessage(db, doneUrgent.id, { status: 'done' });
    const medium = createBusinessMessage(db, { ...base, priority: 'medium' });

    expect(listBusinessMessages(db).map((m) => m.id))
      .toEqual([urgent.id, medium.id, lowNew.id, lowOld.id, doneUrgent.id]);
  });

  it('updating status leaves priority and the override flag alone', () => {
    const m = createBusinessMessage(db, base);
    const done = updateBusinessMessage(db, m.id, { status: 'done' })!;
    expect(done).toMatchObject({ status: 'done', priority: 'high', priority_overridden: 0 });
    expect(done.updated_at >= m.updated_at).toBe(true);
  });

  it('updating priority sets priority_overridden, even to the same value', () => {
    const m = createBusinessMessage(db, base);
    expect(updateBusinessMessage(db, m.id, { priority: 'urgent' })).toMatchObject({ priority: 'urgent', priority_overridden: 1 });

    const other = createBusinessMessage(db, base);
    expect(updateBusinessMessage(db, other.id, { priority: 'high' })!.priority_overridden).toBe(1);
  });

  it('updateBusinessMessage returns undefined for a missing id', () => {
    expect(updateBusinessMessage(db, 9999, { status: 'done' })).toBeUndefined();
  });

  it('deleteBusinessMessage removes the row and reports whether it existed', () => {
    const m = createBusinessMessage(db, base);
    expect(deleteBusinessMessage(db, m.id)).toBe(true);
    expect(getBusinessMessage(db, m.id)).toBeUndefined();
    expect(deleteBusinessMessage(db, m.id)).toBe(false);
  });

  it('does not leak business messages into entries', () => {
    createBusinessMessage(db, base);
    expect(listEntries(db)).toEqual([]);
  });
});
