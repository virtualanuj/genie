import Database from 'better-sqlite3';

export type Domain = 'work' | 'finance' | 'personal';
export type EntryType = 'task' | 'expense' | 'note' | 'reminder' | 'event';
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number;
}

export interface Entry {
  id: number;
  raw_text: string;
  domain: Domain;
  type: EntryType;
  structured: string;
  tags: string | null;
  remind_at: string | null;
  recurrence: string | null;
  series_id: number | null;
  spawned_next: 0 | 1;
  created_at: string;
  updated_at: string;
}

export const DOMAINS: Domain[] = ['work', 'finance', 'personal'];
export const TYPES: EntryType[] = ['task', 'expense', 'note', 'reminder', 'event'];
export const RECURRENCE_FREQS: RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];

export function isValidRecurrence(value: unknown): value is Recurrence | null {
  if (value === null) return true;
  if (typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.freq === 'string' && RECURRENCE_FREQS.includes(v.freq as RecurrenceFreq) &&
    typeof v.interval === 'number' && v.interval > 0
  );
}

export interface NewEntry {
  raw_text: string;
  domain: Domain;
  type: EntryType;
  structured: Record<string, unknown>;
  tags?: string | null;
  remind_at?: string | null;
  recurrence?: Recurrence | null;
  series_id?: number | null;
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_text TEXT NOT NULL,
      domain TEXT NOT NULL,
      type TEXT NOT NULL,
      structured TEXT NOT NULL,
      tags TEXT,
      remind_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  for (const migration of [
    'ALTER TABLE entries ADD COLUMN recurrence TEXT',
    'ALTER TABLE entries ADD COLUMN series_id INTEGER',
    'ALTER TABLE entries ADD COLUMN spawned_next INTEGER NOT NULL DEFAULT 0',
  ]) {
    try {
      db.exec(migration);
    } catch {
      // column already exists (pre-existing db from before v1.1)
    }
  }
  return db;
}

export function createEntry(db: Database.Database, entry: NewEntry): Entry {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO entries (raw_text, domain, type, structured, tags, remind_at, recurrence, series_id, spawned_next, created_at, updated_at)
    VALUES (@raw_text, @domain, @type, @structured, @tags, @remind_at, @recurrence, @series_id, 0, @created_at, @updated_at)
  `);
  const info = stmt.run({
    raw_text: entry.raw_text,
    domain: entry.domain,
    type: entry.type,
    structured: JSON.stringify(entry.structured),
    tags: entry.tags ?? null,
    remind_at: entry.remind_at ?? null,
    recurrence: entry.recurrence ? JSON.stringify(entry.recurrence) : null,
    series_id: entry.series_id ?? null,
    created_at: now,
    updated_at: now,
  });
  return getEntry(db, Number(info.lastInsertRowid))!;
}

export function getEntry(db: Database.Database, id: number): Entry | undefined {
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry | undefined;
}

export function listEntries(db: Database.Database, limit = 50): Entry[] {
  return db.prepare('SELECT * FROM entries ORDER BY created_at DESC, id DESC LIMIT ?').all(limit) as Entry[];
}

export function listDueEntries(db: Database.Database, before: string): Entry[] {
  return db
    .prepare('SELECT * FROM entries WHERE remind_at IS NOT NULL AND remind_at <= ? ORDER BY remind_at ASC')
    .all(before) as Entry[];
}

export function updateEntry(db: Database.Database, id: number, fields: Partial<NewEntry>): Entry | undefined {
  const existing = getEntry(db, id);
  if (!existing) return undefined;
  const merged = {
    id,
    raw_text: fields.raw_text ?? existing.raw_text,
    domain: fields.domain ?? existing.domain,
    type: fields.type ?? existing.type,
    structured: fields.structured ? JSON.stringify(fields.structured) : existing.structured,
    tags: fields.tags !== undefined ? fields.tags : existing.tags,
    remind_at: fields.remind_at !== undefined ? fields.remind_at : existing.remind_at,
    recurrence: fields.recurrence !== undefined
      ? (fields.recurrence === null ? null : JSON.stringify(fields.recurrence))
      : existing.recurrence,
    updated_at: new Date().toISOString(),
  };
  // Editing when the reminder fires or how it repeats should let the series
  // fire again, even if the previous occurrence already spawned its successor.
  const spawnedNext =
    merged.remind_at !== existing.remind_at || merged.recurrence !== existing.recurrence
      ? 0
      : existing.spawned_next;
  db.prepare(`
    UPDATE entries SET raw_text=@raw_text, domain=@domain, type=@type, structured=@structured,
      tags=@tags, remind_at=@remind_at, recurrence=@recurrence, spawned_next=@spawned_next, updated_at=@updated_at
    WHERE id=@id
  `).run({ ...merged, spawned_next: spawnedNext });
  return getEntry(db, id);
}

export function deleteEntry(db: Database.Database, id: number): boolean {
  const info = db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  return info.changes > 0;
}

function advanceDate(iso: string, recurrence: Recurrence): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`cannot advance an invalid date: ${iso}`);
  }
  switch (recurrence.freq) {
    case 'daily':
      date.setDate(date.getDate() + recurrence.interval);
      break;
    case 'weekly':
      date.setDate(date.getDate() + recurrence.interval * 7);
      break;
    case 'monthly':
    case 'yearly': {
      // Move to the 1st before changing month/year so e.g. Jan 31 + 1 month
      // can't overflow into March; then clamp back to the target month's
      // last valid day (e.g. Feb 28/29) instead of drifting forward.
      const day = date.getDate();
      date.setDate(1);
      if (recurrence.freq === 'monthly') date.setMonth(date.getMonth() + recurrence.interval);
      else date.setFullYear(date.getFullYear() + recurrence.interval);
      const daysInTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(day, daysInTargetMonth));
      break;
    }
    default:
      throw new Error(`unknown recurrence frequency: ${(recurrence as Recurrence).freq}`);
  }
  return date.toISOString();
}

export function advanceRecurringEntries(db: Database.Database, nowISO: string): Entry[] {
  const due = db
    .prepare(`
      SELECT * FROM entries
      WHERE recurrence IS NOT NULL AND spawned_next = 0
        AND remind_at IS NOT NULL AND remind_at <= ?
    `)
    .all(nowISO) as Entry[];

  const created: Entry[] = [];
  for (const source of due) {
    let recurrence: Recurrence;
    let nextRemindAt: string;
    try {
      recurrence = JSON.parse(source.recurrence!) as Recurrence;
      nextRemindAt = advanceDate(source.remind_at!, recurrence);
    } catch {
      // Malformed recurrence or remind_at: stop this series rather than
      // retrying (and re-failing) it on every future request, or spawning
      // an unbounded pile of duplicate occurrences at the same timestamp.
      db.prepare('UPDATE entries SET spawned_next = 1 WHERE id = ?').run(source.id);
      continue;
    }
    const seriesId = source.series_id ?? source.id;

    const spawned = createEntry(db, {
      raw_text: source.raw_text,
      domain: source.domain,
      type: source.type,
      structured: JSON.parse(source.structured),
      tags: source.tags,
      remind_at: nextRemindAt,
      recurrence,
      series_id: seriesId,
    });
    db.prepare('UPDATE entries SET spawned_next = 1 WHERE id = ?').run(source.id);
    created.push(spawned);
  }
  return created;
}
