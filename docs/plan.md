# Personal Genie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first web app where the user captures anything (text or voice) into one box, has it auto-classified/extracted by Gemini and stored in SQLite, sees due reminders, and can ask natural-language questions over what's captured.

**Architecture:** An npm-workspaces monorepo with two packages: `server` (Express + TypeScript API backed by SQLite, calling the Gemini API for classification and Q&A) and `client` (Vite + React frontend). In dev, Vite proxies `/api` to the Express server; in production, Express serves the built client.

**Tech Stack:** Node.js + TypeScript, Express, better-sqlite3, @google/genai, Vite, React, Vitest (+ supertest for API tests, @testing-library/react for component tests).

**Spec:** `docs/spec.md` (requirements: `docs/intent.md`)

## Global Constraints

- Single `entries` table for all domains/types (per spec's Data Model) — no per-domain tables.
- No confirmation step before saving a captured entry (spec: "organize + remind" autonomy, nothing irreversible happens on save).
- No push notifications, no external integrations, no multi-user auth in v1 (spec's out-of-scope list).
- Voice input uses the browser's built-in Web Speech API — no external transcription service.
- All Gemini API calls take the client as a parameter (dependency injection) so tests can mock it — no test should hit the real Gemini API.
- Model id for all Gemini calls: `gemini-flash-lite-latest`.
- The Due/Upcoming panel uses a fixed 24-hour look-ahead window (entries due now, overdue, or due within the next 24 hours) — not just past-due (per spec's Reminders section).
- Route handlers that take an `:id` param must reject a non-numeric id with 400 before touching the database.
- `PATCH /api/entries/:id` must reject a `domain`/`type` value outside the allowed enums with 400.
- Editing an entry's `raw_text`, `domain`, and `type` from the UI is a v1 requirement (per intent.md's "Correctable" goal) — not just delete.
- **v1.1 (Tasks 11-15):** a recurring entry's occurrences are never overwritten in place — each occurrence is its own row, linked via `series_id`, so history stays searchable (per spec.md's Recurrence section).
- Recurrence advancement (`advanceRecurringEntries`) is lazy — triggered by `GET /api/entries` and `GET /api/entries/due` — never a background job/cron.
- Recurrence shape everywhere (Gemini prompt, DB, API, client): `{ freq: 'daily'|'weekly'|'monthly'|'yearly', interval: number }`, stored as nullable JSON text, same convention as `structured`.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `client/package.json` (placeholder, fleshed out in Task 6)
- Test: `server/test/smoke.test.ts`

**Interfaces:**
- Produces: root npm scripts `dev`, `build`, `start`, `test` that later tasks rely on; `server` workspace with its own `dev`/`build`/`start`/`test` scripts.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "genie",
  "private": true,
  "workspaces": ["server", "client"],
  "scripts": {
    "dev": "concurrently -k -n server,client \"npm run dev --workspace=server\" \"npm run dev --workspace=client\"",
    "build": "npm run build --workspace=client && npm run build --workspace=server",
    "start": "npm run start --workspace=server",
    "test": "npm run test --workspace=server && npm run test --workspace=client"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
*.db
.env
```

- [ ] **Step 3: Create `server/package.json`**

```json
{
  "name": "server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@google/genai": "^1.0.0",
    "better-sqlite3": "^11.3.0",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create a placeholder `client/package.json`** (full setup in Task 6)

```json
{
  "name": "client",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "echo 'client not yet scaffolded'",
    "build": "echo 'client not yet scaffolded'"
  }
}
```

- [ ] **Step 6: Write a smoke test to prove the server workspace's test runner works**

`server/test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install dependencies from repo root**

Run: `npm install`
Expected: installs root + `server` + `client` workspace dependencies without error.

- [ ] **Step 8: Run the server test suite to verify it passes**

Run: `npm run test --workspace=server`
Expected: `smoke` test passes.

- [ ] **Step 9: Commit**

```bash
git add package.json .gitignore server/package.json server/tsconfig.json server/test/smoke.test.ts client/package.json
git commit -m "chore: scaffold npm workspaces monorepo"
```

---

### Task 2: SQLite data access layer

**Files:**
- Create: `server/src/db.ts`
- Test: `server/test/db.test.ts`

**Interfaces:**
- Consumes: nothing (first data layer).
- Produces: `openDb(path: string): Database.Database`, `createEntry(db, NewEntry): Entry`, `getEntry(db, id: number): Entry | undefined`, `listEntries(db, limit?: number): Entry[]`, `listDueEntries(db, before: string): Entry[]`, `updateEntry(db, id: number, fields: Partial<NewEntry>): Entry | undefined`, `deleteEntry(db, id: number): boolean`, and types `Domain`, `EntryType`, `Entry`, `NewEntry` — all used by Tasks 3–5.

- [ ] **Step 1: Write failing tests for the data access layer**

`server/test/db.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `../src/db.js` does not exist.

- [ ] **Step 3: Implement `server/src/db.ts`**

```ts
import Database from 'better-sqlite3';

export type Domain = 'work' | 'finance' | 'personal';
export type EntryType = 'task' | 'expense' | 'note' | 'reminder' | 'event';

export interface Entry {
  id: number;
  raw_text: string;
  domain: Domain;
  type: EntryType;
  structured: string;
  tags: string | null;
  remind_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewEntry {
  raw_text: string;
  domain: Domain;
  type: EntryType;
  structured: Record<string, unknown>;
  tags?: string | null;
  remind_at?: string | null;
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
  return db;
}

export function createEntry(db: Database.Database, entry: NewEntry): Entry {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO entries (raw_text, domain, type, structured, tags, remind_at, created_at, updated_at)
    VALUES (@raw_text, @domain, @type, @structured, @tags, @remind_at, @created_at, @updated_at)
  `);
  const info = stmt.run({
    raw_text: entry.raw_text,
    domain: entry.domain,
    type: entry.type,
    structured: JSON.stringify(entry.structured),
    tags: entry.tags ?? null,
    remind_at: entry.remind_at ?? null,
    created_at: now,
    updated_at: now,
  });
  return getEntry(db, Number(info.lastInsertRowid))!;
}

export function getEntry(db: Database.Database, id: number): Entry | undefined {
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry | undefined;
}

export function listEntries(db: Database.Database, limit = 50): Entry[] {
  return db.prepare('SELECT * FROM entries ORDER BY created_at DESC LIMIT ?').all(limit) as Entry[];
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
    updated_at: new Date().toISOString(),
  };
  db.prepare(`
    UPDATE entries SET raw_text=@raw_text, domain=@domain, type=@type, structured=@structured,
      tags=@tags, remind_at=@remind_at, updated_at=@updated_at WHERE id=@id
  `).run(merged);
  return getEntry(db, id);
}

export function deleteEntry(db: Database.Database, id: number): boolean {
  const info = db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  return info.changes > 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: all `db.test.ts` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts server/test/db.test.ts
git commit -m "feat: add SQLite data access layer for entries"
```

---

### Task 3: Gemini classification module

**Files:**
- Create: `server/src/gemini.ts`
- Test: `server/test/gemini.test.ts`

**Interfaces:**
- Consumes: `Domain`, `EntryType` from `server/src/db.ts` (Task 2).
- Produces: `classifyEntry(client: Pick<GoogleGenAI, 'models'>, rawText: string): Promise<{ domain: Domain; type: EntryType; structured: Record<string, unknown>; remind_at: string | null }>` — used by Task 4's capture route.

- [ ] **Step 1: Write failing tests with a mocked Gemini client**

`server/test/gemini.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { classifyEntry } from '../src/gemini.js';

function mockClient(responseText: string | undefined) {
  return {
    models: {
      generateContent: vi.fn().mockResolvedValue({ text: responseText }),
    },
  };
}

describe('classifyEntry', () => {
  it('parses a well-formed classification response', async () => {
    const client = mockClient(JSON.stringify({
      domain: 'finance',
      type: 'expense',
      structured: { amount: 42, currency: 'USD', category: 'groceries' },
      remind_at: null,
    }));

    const result = await classifyEntry(client, 'spent $42 on groceries');

    expect(result).toEqual({
      domain: 'finance',
      type: 'expense',
      structured: { amount: 42, currency: 'USD', category: 'groceries' },
      remind_at: null,
    });
    expect(client.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-flash-lite-latest',
        contents: 'spent $42 on groceries',
      })
    );
  });

  it('defaults structured to {} when omitted', async () => {
    const client = mockClient(JSON.stringify({ domain: 'personal', type: 'note', remind_at: null }));
    const result = await classifyEntry(client, 'saw a nice sunset');
    expect(result.structured).toEqual({});
  });

  it('throws when the response has no text content', async () => {
    const client = mockClient(undefined);
    await expect(classifyEntry(client, 'x')).rejects.toThrow('no text content');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `../src/gemini.js` does not exist.

- [ ] **Step 3: Implement `server/src/gemini.ts`**

```ts
import type { GoogleGenAI } from '@google/genai';
import type { Domain, EntryType } from './db.js';

export interface ClassifyResult {
  domain: Domain;
  type: EntryType;
  structured: Record<string, unknown>;
  remind_at: string | null;
}

const CLASSIFY_SYSTEM_PROMPT = `You are a personal organizer. Given a short note the user typed or spoke, classify it and extract structured details.

Respond with ONLY a JSON object, no other text, matching this shape:
{
  "domain": "work" | "finance" | "personal",
  "type": "task" | "expense" | "note" | "reminder" | "event",
  "structured": { <type-specific fields, e.g. amount/currency/category for expense, due_date/project for task, date/location for event> },
  "remind_at": "<ISO 8601 timestamp, or null if there's no clear due date/time>"
}

Today's date is {{today}}.`;

export async function classifyEntry(
  client: Pick<GoogleGenAI, 'models'>,
  rawText: string
): Promise<ClassifyResult> {
  const systemInstruction = CLASSIFY_SYSTEM_PROMPT.replace('{{today}}', new Date().toISOString().slice(0, 10));
  const response = await client.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: rawText,
    config: { systemInstruction },
  });

  if (!response.text) throw new Error('Gemini response had no text content');

  const parsed = JSON.parse(response.text);
  return {
    domain: parsed.domain,
    type: parsed.type,
    structured: parsed.structured ?? {},
    remind_at: parsed.remind_at ?? null,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: all `gemini.test.ts` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/gemini.ts server/test/gemini.test.ts
git commit -m "feat: add Gemini classification module"
```

---

### Task 4: Entries API (capture, list, due, update, delete)

**Files:**
- Create: `server/src/routes/entries.ts`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`
- Test: `server/test/entries.route.test.ts`

**Interfaces:**
- Consumes: `openDb`, `createEntry`, `listEntries`, `listDueEntries`, `updateEntry`, `deleteEntry` (Task 2); `classifyEntry` (Task 3).
- Produces: `entriesRouter(db, gemini): Router` mounted at `/api/entries`; `buildApp(db, gemini): express.Express` (used by Task 5's search route wiring and by `index.ts`) — both reused by later tasks/tests.

- [ ] **Step 1: Write failing route tests with an in-memory DB and mocked Gemini client**

`server/test/entries.route.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/app.js';

function mockGemini(responseText: string) {
  return { models: { generateContent: vi.fn().mockResolvedValue({ text: responseText }) } };
}

describe('entries API', () => {
  let db: ReturnType<typeof openDb>;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('POST /api/entries classifies and saves a new entry', async () => {
    const gemini = mockGemini(JSON.stringify({
      domain: 'work', type: 'task', structured: { project: 'genie' }, remind_at: null,
    }));
    const app = buildApp(db, gemini as never);

    const res = await request(app).post('/api/entries').send({ raw_text: 'finish the genie plan' });

    expect(res.status).toBe(201);
    expect(res.body.domain).toBe('work');
    expect(res.body.raw_text).toBe('finish the genie plan');
  });

  it('POST /api/entries rejects empty raw_text', async () => {
    const app = buildApp(db, mockGemini('{}') as never);
    const res = await request(app).post('/api/entries').send({ raw_text: '  ' });
    expect(res.status).toBe(400);
  });

  it('GET /api/entries lists saved entries', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'personal', type: 'note', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    await request(app).post('/api/entries').send({ raw_text: 'note one' });

    const res = await request(app).get('/api/entries');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/entries/due filters by remind_at', async () => {
    const gemini = mockGemini(JSON.stringify({
      domain: 'work', type: 'task', structured: {}, remind_at: '2020-01-01T00:00:00.000Z',
    }));
    const app = buildApp(db, gemini as never);
    await request(app).post('/api/entries').send({ raw_text: 'overdue task' });

    const res = await request(app).get('/api/entries/due').query({ before: '2020-06-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('PATCH /api/entries/:id updates fields', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'personal', type: 'note', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const created = await request(app).post('/api/entries').send({ raw_text: 'wrong text' });

    const res = await request(app).patch(`/api/entries/${created.body.id}`).send({ raw_text: 'right text' });
    expect(res.status).toBe(200);
    expect(res.body.raw_text).toBe('right text');
  });

  it('PATCH /api/entries/:id returns 404 for missing entry', async () => {
    const app = buildApp(db, mockGemini('{}') as never);
    const res = await request(app).patch('/api/entries/999').send({ raw_text: 'x' });
    expect(res.status).toBe(404);
  });

  it('PATCH /api/entries/:id returns 400 for a non-numeric id', async () => {
    const app = buildApp(db, mockGemini('{}') as never);
    const res = await request(app).patch('/api/entries/not-a-number').send({ raw_text: 'x' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/entries/:id returns 400 for an invalid domain', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'personal', type: 'note', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const created = await request(app).post('/api/entries').send({ raw_text: 'note' });

    const res = await request(app).patch(`/api/entries/${created.body.id}`).send({ domain: 'nonsense' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/entries/:id returns 400 for an invalid type', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'personal', type: 'note', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const created = await request(app).post('/api/entries').send({ raw_text: 'note' });

    const res = await request(app).patch(`/api/entries/${created.body.id}`).send({ type: 'nonsense' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/entries/:id allows editing raw_text, domain, and type together', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'work', type: 'task', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const created = await request(app).post('/api/entries').send({ raw_text: 'miscategorized' });

    const res = await request(app)
      .patch(`/api/entries/${created.body.id}`)
      .send({ raw_text: 'fixed text', domain: 'personal', type: 'note' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ raw_text: 'fixed text', domain: 'personal', type: 'note' });
  });

  it('DELETE /api/entries/:id returns 400 for a non-numeric id', async () => {
    const app = buildApp(db, mockGemini('{}') as never);
    const res = await request(app).delete('/api/entries/not-a-number');
    expect(res.status).toBe(400);
  });

  it('DELETE /api/entries/:id removes the entry', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'personal', type: 'note', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const created = await request(app).post('/api/entries').send({ raw_text: 'delete me' });

    const res = await request(app).delete(`/api/entries/${created.body.id}`);
    expect(res.status).toBe(204);
    expect((await request(app).get('/api/entries')).body).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `../src/app.js` does not exist.

- [ ] **Step 3: Implement `server/src/routes/entries.ts`**

```ts
import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { classifyEntry } from '../gemini.js';
import {
  createEntry, listEntries, listDueEntries, updateEntry, deleteEntry,
  type Domain, type EntryType,
} from '../db.js';

const DOMAINS: Domain[] = ['work', 'finance', 'personal'];
const TYPES: EntryType[] = ['task', 'expense', 'note', 'reminder', 'event'];

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) ? id : undefined;
}

export function entriesRouter(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const rawText = req.body?.raw_text;
    if (typeof rawText !== 'string' || rawText.trim() === '') {
      return res.status(400).json({ error: 'raw_text is required' });
    }
    try {
      const classified = await classifyEntry(gemini, rawText);
      const entry = createEntry(db, {
        raw_text: rawText,
        domain: classified.domain,
        type: classified.type,
        structured: classified.structured,
        remind_at: classified.remind_at,
      });
      res.status(201).json(entry);
    } catch (err) {
      res.status(502).json({ error: 'classification failed', detail: (err as Error).message });
    }
  });

  router.get('/', (_req, res) => {
    res.json(listEntries(db));
  });

  router.get('/due', (req, res) => {
    const before = typeof req.query.before === 'string' ? req.query.before : new Date().toISOString();
    res.json(listDueEntries(db, before));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === undefined) return res.status(400).json({ error: 'invalid id' });

    const body = req.body ?? {};
    if (body.domain !== undefined && !DOMAINS.includes(body.domain)) {
      return res.status(400).json({ error: `domain must be one of ${DOMAINS.join(', ')}` });
    }
    if (body.type !== undefined && !TYPES.includes(body.type)) {
      return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
    }

    const updated = updateEntry(db, id, body);
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === undefined) return res.status(400).json({ error: 'invalid id' });

    const ok = deleteEntry(db, id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.status(204).send();
  });

  return router;
}
```

- [ ] **Step 4: Implement `server/src/app.ts`** (kept separate from `index.ts` so tests can build an app without starting a server or requiring an API key)

```ts
import express from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { entriesRouter } from './routes/entries.js';

export function buildApp(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/entries', entriesRouter(db, gemini));
  return app;
}
```

- [ ] **Step 5: Implement `server/src/index.ts`**

```ts
import path from 'node:path';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { openDb } from './db.js';
import { buildApp } from './app.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const DB_PATH = process.env.GENIE_DB_PATH ?? path.join(process.cwd(), 'genie.db');

const db = openDb(DB_PATH);
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const app = buildApp(db, gemini);

const clientDist = path.join(process.cwd(), '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`genie server listening on http://localhost:${PORT}`);
});
```

(This is already the final version of `index.ts` — no further changes needed in later tasks. Task 4's `buildApp`/`index.ts` split means this file has no test coverage of its own, which is fine since `app.ts` carries all the logic tests exercise.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: all `entries.route.test.ts` tests PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/entries.ts server/src/app.ts server/src/index.ts server/test/entries.route.test.ts
git commit -m "feat: add entries capture/list/due/update/delete API"
```

---

### Task 5: Search / Q&A module and route

**Files:**
- Create: `server/src/search.ts`
- Create: `server/src/routes/search.ts`
- Modify: `server/src/app.ts` — mount the search router
- Test: `server/test/search.test.ts`
- Test: `server/test/search.route.test.ts`

**Interfaces:**
- Consumes: `Entry`, `listEntries` (Task 2).
- Produces: `filterCandidates(entries: Entry[], query: string, limit?: number): Entry[]`, `answerQuestion(client, question: string, candidates: Entry[]): Promise<string>`, `searchRouter(db, gemini): Router` mounted at `/api/search`.

- [ ] **Step 1: Write failing tests for `filterCandidates` and `answerQuestion`**

`server/test/search.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { filterCandidates, answerQuestion } from '../src/search.js';
import type { Entry } from '../src/db.js';

function entry(overrides: Partial<Entry>): Entry {
  return {
    id: 1, raw_text: '', domain: 'personal', type: 'note', structured: '{}', tags: null,
    remind_at: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterCandidates', () => {
  it('ranks entries containing more query words higher', () => {
    const groceries = entry({ id: 1, raw_text: 'bought groceries for $50' });
    const rent = entry({ id: 2, raw_text: 'paid rent' });
    const result = filterCandidates([rent, groceries], 'how much on groceries');
    expect(result[0].id).toBe(1);
  });

  it('excludes entries with no matching words', () => {
    const result = filterCandidates([entry({ raw_text: 'unrelated note' })], 'groceries spending');
    expect(result).toHaveLength(0);
  });
});

describe('answerQuestion', () => {
  it('sends candidate entries and the question to Gemini and returns the text', async () => {
    const client = { models: { generateContent: vi.fn().mockResolvedValue({ text: 'You spent $50.' }) } };
    const answer = await answerQuestion(client as never, 'how much on groceries?', [entry({ raw_text: 'bought groceries for $50' })]);
    expect(answer).toBe('You spent $50.');
    expect(client.models.generateContent).toHaveBeenCalled();
  });
});
```

`server/test/search.route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { openDb, createEntry } from '../src/db.js';
import { buildApp } from '../src/app.js';

describe('search API', () => {
  it('POST /api/search returns a synthesized answer', async () => {
    const db = openDb(':memory:');
    createEntry(db, { raw_text: 'bought groceries for $50', domain: 'finance', type: 'expense', structured: { amount: 50 } });
    const gemini = { models: { generateContent: vi.fn().mockResolvedValue({ text: 'You spent $50 on groceries.' }) } };

    const app = buildApp(db, gemini as never);
    const res = await request(app).post('/api/search').send({ question: 'how much on groceries?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('You spent $50 on groceries.');
  });

  it('POST /api/search rejects an empty question', async () => {
    const app = buildApp(openDb(':memory:'), { models: { generateContent: vi.fn() } } as never);
    const res = await request(app).post('/api/search').send({ question: '' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `../src/search.js` and `../src/routes/search.js` do not exist.

- [ ] **Step 3: Implement `server/src/search.ts`**

```ts
import type { GoogleGenAI } from '@google/genai';
import type { Entry } from './db.js';

export function filterCandidates(entries: Entry[], query: string, limit = 30): Entry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = entries.map((e) => {
    const haystack = `${e.raw_text} ${e.domain} ${e.type} ${e.structured}`.toLowerCase();
    const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
    return { entry: e, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

const ANSWER_SYSTEM_PROMPT = `You are a personal assistant answering questions about the user's own notes, tasks, and expenses. Use only the provided entries as ground truth — do not invent details. If nothing relevant is present, say so plainly.`;

export async function answerQuestion(
  client: Pick<GoogleGenAI, 'models'>,
  question: string,
  candidates: Entry[]
): Promise<string> {
  const context = candidates
    .map((e) => `- [${e.domain}/${e.type}] ${e.raw_text} (structured: ${e.structured}, created: ${e.created_at})`)
    .join('\n');
  const response = await client.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: `Entries:\n${context || '(none found)'}\n\nQuestion: ${question}`,
    config: { systemInstruction: ANSWER_SYSTEM_PROMPT },
  });
  return response.text ?? '';
}
```

- [ ] **Step 4: Implement `server/src/routes/search.ts`**

```ts
import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { listEntries } from '../db.js';
import { filterCandidates, answerQuestion } from '../search.js';

export function searchRouter(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    const question = req.body?.question;
    if (typeof question !== 'string' || question.trim() === '') {
      return res.status(400).json({ error: 'question is required' });
    }
    const candidates = filterCandidates(listEntries(db, 500), question);
    try {
      const answer = await answerQuestion(gemini, question, candidates);
      res.json({ answer, matched: candidates.length });
    } catch (err) {
      res.status(502).json({ error: 'search failed', detail: (err as Error).message });
    }
  });
  return router;
}
```

- [ ] **Step 5: Wire it into `server/src/app.ts`**

```ts
import express from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { entriesRouter } from './routes/entries.js';
import { searchRouter } from './routes/search.js';

export function buildApp(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/entries', entriesRouter(db, gemini));
  app.use('/api/search', searchRouter(db, gemini));
  return app;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: all `search.test.ts` and `search.route.test.ts` tests PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/search.ts server/src/routes/search.ts server/src/app.ts server/test/search.test.ts server/test/search.route.test.ts
git commit -m "feat: add search/Q&A module and API route"
```

---

### Task 6: Client scaffold (Vite + React + TypeScript)

**Files:**
- Modify: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Test: `client/test/App.test.tsx`
- Create: `client/vitest.config.ts`

**Interfaces:**
- Produces: `client` dev/build/test scripts that the root `package.json` (Task 1) already references; a base `App` component that Tasks 7–9 extend.

- [ ] **Step 1: Replace `client/package.json` with the full config**

```json
{
  "name": "client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `client/vite.config.ts`** (proxies `/api` to the Express server in dev)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 4: Create `client/vitest.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
```

`client/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Genie</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Write a failing test for a base `App` shell**

`client/test/App.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App.js';

describe('App', () => {
  it('renders the Genie heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Genie' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm run test --workspace=client`
Expected: FAIL — `../src/App.js` does not exist.

- [ ] **Step 8: Implement `client/src/App.tsx` and `client/src/main.tsx`**

`client/src/App.tsx`:
```tsx
export default function App() {
  return (
    <div>
      <h1>Genie</h1>
    </div>
  );
}
```

`client/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm run test --workspace=client`
Expected: PASS.

- [ ] **Step 10: Install client dependencies and commit**

```bash
npm install
git add client/package.json client/tsconfig.json client/vite.config.ts client/vitest.config.ts client/index.html client/src/App.tsx client/src/main.tsx client/test/App.test.tsx client/test/setup.ts
git commit -m "chore: scaffold Vite + React client"
```

---

### Task 7: Capture box + recent entries list

**Files:**
- Create: `client/src/api.ts`
- Create: `client/src/CaptureBox.tsx`
- Create: `client/src/EntryList.tsx`
- Modify: `client/src/App.tsx`
- Test: `client/test/CaptureBox.test.tsx`
- Test: `client/test/EntryList.test.tsx`

**Interfaces:**
- Consumes: `/api/entries` (Task 4).
- Produces: `createEntry(rawText: string): Promise<Entry>`, `listEntries(): Promise<Entry[]>`, `deleteEntry(id: number): Promise<void>`, `updateEntry(id: number, fields): Promise<Entry>`, `DOMAINS`, `TYPES` in `client/src/api.ts` (also used by Task 8); `<CaptureBox onCaptured={(entry) => void}>`; `<EntryList entries={Entry[]} onDelete={(id) => void} onEdit={(id, fields) => void}>` — `onEdit` implements intent.md's "Correctable" requirement (edit raw_text/domain/type, not just delete).

- [ ] **Step 1: Write failing tests for `CaptureBox` and `EntryList`**

`client/test/CaptureBox.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CaptureBox from '../src/CaptureBox.js';

describe('CaptureBox', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, raw_text: 'buy milk', domain: 'personal', type: 'task' }),
    }) as never;
  });

  it('submits raw text and calls onCaptured with the created entry', async () => {
    const onCaptured = vi.fn();
    render(<CaptureBox onCaptured={onCaptured} />);

    fireEvent.change(screen.getByPlaceholderText(/type or say something/i), { target: { value: 'buy milk' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => expect(onCaptured).toHaveBeenCalledWith(expect.objectContaining({ raw_text: 'buy milk' })));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/entries', expect.objectContaining({ method: 'POST' }));
  });

  it('clears the input after a successful submit', async () => {
    render(<CaptureBox onCaptured={() => {}} />);
    const input = screen.getByPlaceholderText(/type or say something/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'buy milk' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    await waitFor(() => expect(input.value).toBe(''));
  });
});
```

`client/test/EntryList.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EntryList from '../src/EntryList.js';
import type { Entry } from '../src/api.js';

const entry: Entry = {
  id: 1, raw_text: 'buy milk', domain: 'personal', type: 'task', structured: '{}',
  tags: null, remind_at: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
};

describe('EntryList', () => {
  it('renders each entry\'s text and domain/type', () => {
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('buy milk')).toBeInTheDocument();
    expect(screen.getByText(/personal\/task/)).toBeInTheDocument();
  });

  it('calls onDelete with the entry id when delete is clicked', () => {
    const onDelete = vi.fn();
    render(<EntryList entries={[entry]} onDelete={onDelete} onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('clicking Edit reveals editable fields pre-filled with the entry\'s current values', () => {
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByDisplayValue('buy milk')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /domain/i })).toHaveValue('personal');
    expect(screen.getByRole('combobox', { name: /type/i })).toHaveValue('task');
  });

  it('calls onEdit with the edited fields when Save is clicked', () => {
    const onEdit = vi.fn();
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    fireEvent.change(screen.getByDisplayValue('buy milk'), { target: { value: 'buy oat milk' } });
    fireEvent.change(screen.getByRole('combobox', { name: /domain/i }), { target: { value: 'work' } });
    fireEvent.change(screen.getByRole('combobox', { name: /type/i }), { target: { value: 'note' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEdit).toHaveBeenCalledWith(1, { raw_text: 'buy oat milk', domain: 'work', type: 'note' });
  });

  it('Cancel exits edit mode without calling onEdit', () => {
    const onEdit = vi.fn();
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText('buy milk')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=client`
Expected: FAIL — `../src/CaptureBox.js`, `../src/EntryList.js`, `../src/api.js` do not exist.

- [ ] **Step 3: Implement `client/src/api.ts`**

```ts
export interface Entry {
  id: number;
  raw_text: string;
  domain: 'work' | 'finance' | 'personal';
  type: 'task' | 'expense' | 'note' | 'reminder' | 'event';
  structured: string;
  tags: string | null;
  remind_at: string | null;
  created_at: string;
  updated_at: string;
}

export const DOMAINS: Entry['domain'][] = ['work', 'finance', 'personal'];
export const TYPES: Entry['type'][] = ['task', 'expense', 'note', 'reminder', 'event'];

export async function createEntry(rawText: string): Promise<Entry> {
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text: rawText }),
  });
  if (!res.ok) throw new Error(`failed to create entry: ${res.status}`);
  return res.json();
}

export async function listEntries(): Promise<Entry[]> {
  const res = await fetch('/api/entries');
  if (!res.ok) throw new Error(`failed to list entries: ${res.status}`);
  return res.json();
}

const DUE_WINDOW_HOURS = 24;

export async function listDueEntries(): Promise<Entry[]> {
  const cutoff = new Date(Date.now() + DUE_WINDOW_HOURS * 60 * 60 * 1000);
  const res = await fetch(`/api/entries/due?before=${encodeURIComponent(cutoff.toISOString())}`);
  if (!res.ok) throw new Error(`failed to list due entries: ${res.status}`);
  return res.json();
}

export async function deleteEntry(id: number): Promise<void> {
  const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`failed to delete entry: ${res.status}`);
}

export async function updateEntry(
  id: number,
  fields: Pick<Entry, 'raw_text' | 'domain' | 'type'>
): Promise<Entry> {
  const res = await fetch(`/api/entries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`failed to update entry: ${res.status}`);
  return res.json();
}

export async function askQuestion(question: string): Promise<{ answer: string; matched: number }> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Implement `client/src/CaptureBox.tsx`**

```tsx
import { useState } from 'react';
import { createEntry, type Entry } from './api.js';

export default function CaptureBox({ onCaptured }: { onCaptured: (entry: Entry) => void }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const entry = await createEntry(text);
      onCaptured(entry);
      setText('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="Type or say something..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" disabled={submitting}>Add</button>
    </form>
  );
}
```

- [ ] **Step 5: Implement `client/src/EntryList.tsx`**

```tsx
import { useState } from 'react';
import { DOMAINS, TYPES, type Entry } from './api.js';

type Draft = { raw_text: string; domain: Entry['domain']; type: Entry['type'] };

export default function EntryList({
  entries, onDelete, onEdit,
}: {
  entries: Entry[];
  onDelete: (id: number) => void;
  onEdit: (id: number, fields: Draft) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setDraft({ raw_text: entry.raw_text, domain: entry.domain, type: entry.type });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit() {
    if (editingId !== null && draft) onEdit(editingId, draft);
    cancelEdit();
  }

  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id}>
          {editingId === entry.id && draft ? (
            <>
              <input
                value={draft.raw_text}
                onChange={(e) => setDraft({ ...draft, raw_text: e.target.value })}
              />
              <select
                aria-label="domain"
                value={draft.domain}
                onChange={(e) => setDraft({ ...draft, domain: e.target.value as Entry['domain'] })}
              >
                {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select
                aria-label="type"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as Entry['type'] })}
              >
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={saveEdit}>Save</button>
              <button onClick={cancelEdit}>Cancel</button>
            </>
          ) : (
            <>
              <span>{entry.raw_text}</span>
              <small> ({entry.domain}/{entry.type})</small>
              <button onClick={() => startEdit(entry)}>Edit</button>
              <button onClick={() => onDelete(entry.id)}>Delete</button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Wire both into `client/src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import CaptureBox from './CaptureBox.js';
import EntryList from './EntryList.js';
import { listEntries, deleteEntry, updateEntry, type Entry } from './api.js';

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    listEntries().then(setEntries).catch(() => {});
  }, []);

  return (
    <div>
      <h1>Genie</h1>
      <CaptureBox onCaptured={(entry) => setEntries((prev) => [entry, ...prev])} />
      <EntryList
        entries={entries}
        onDelete={async (id) => {
          await deleteEntry(id);
          setEntries((prev) => prev.filter((e) => e.id !== id));
        }}
        onEdit={async (id, fields) => {
          const updated = await updateEntry(id, fields);
          setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: all `CaptureBox.test.tsx` and `EntryList.test.tsx` tests PASS (the pre-existing `App.test.tsx` heading test still passes too, since `App` still renders an `<h1>Genie</h1>`).

- [ ] **Step 8: Commit**

```bash
git add client/src/api.ts client/src/CaptureBox.tsx client/src/EntryList.tsx client/src/App.tsx client/test/CaptureBox.test.tsx client/test/EntryList.test.tsx
git commit -m "feat: add capture box and recent entries list"
```

---

### Task 8: Voice input (Web Speech API) on the capture box

**Files:**
- Modify: `client/src/CaptureBox.tsx`
- Test: `client/test/CaptureBox.test.tsx`

**Interfaces:**
- Consumes: browser `window.SpeechRecognition` / `window.webkitSpeechRecognition` (feature-detected; no dependency added).
- Produces: no new exports — extends `CaptureBox`'s existing UI with a mic button.

- [ ] **Step 1: Add a failing test for mic-driven capture**

Append to `client/test/CaptureBox.test.tsx`:
```tsx
  it('fills the input from a speech recognition result when the mic button is clicked', () => {
    let recognitionInstance: { onresult?: (e: unknown) => void; start: () => void } | undefined;
    class FakeRecognition {
      onresult?: (e: unknown) => void;
      start() { /* no-op; test triggers onresult directly */ }
      constructor() { recognitionInstance = this; }
    }
    (globalThis as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;

    render(<CaptureBox onCaptured={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /speak/i }));
    recognitionInstance!.onresult!({ results: [[{ transcript: 'buy oat milk' }]] });

    expect((screen.getByPlaceholderText(/type or say something/i) as HTMLInputElement).value).toBe('buy oat milk');

    delete (globalThis as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it('does not render the mic button when speech recognition is unsupported', () => {
    render(<CaptureBox onCaptured={() => {}} />);
    expect(screen.queryByRole('button', { name: /speak/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm run test --workspace=client`
Expected: FAIL — no "speak" button exists yet.

- [ ] **Step 3: Extend `client/src/CaptureBox.tsx` with mic support**

```tsx
import { useState } from 'react';
import { createEntry, type Entry } from './api.js';

type SpeechRecognitionLike = {
  onresult: ((event: { results: { 0: { transcript: string } }[] }) => void) | null;
  start: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export default function CaptureBox({ onCaptured }: { onCaptured: (entry: Entry) => void }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const RecognitionCtor = getSpeechRecognition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const entry = await createEntry(text);
      onCaptured(entry);
      setText('');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSpeak() {
    if (!RecognitionCtor) return;
    const recognition = new RecognitionCtor();
    recognition.onresult = (event) => {
      setText(event.results[0][0].transcript);
    };
    recognition.start();
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="Type or say something..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {RecognitionCtor && (
        <button type="button" aria-label="Speak" onClick={handleSpeak}>🎤 Speak</button>
      )}
      <button type="submit" disabled={submitting}>Add</button>
    </form>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: all `CaptureBox.test.tsx` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/CaptureBox.tsx client/test/CaptureBox.test.tsx
git commit -m "feat: add voice capture via Web Speech API"
```

---

### Task 9: Due/Upcoming panel

**Files:**
- Create: `client/src/DuePanel.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/api.ts` (already has `listDueEntries` from Task 7 — no change needed, listed for traceability)
- Test: `client/test/DuePanel.test.tsx`

**Interfaces:**
- Consumes: `listDueEntries()` from `client/src/api.ts` (Task 7).
- Produces: `<DuePanel>` — self-fetching, no props required, mounted in `App`.

- [ ] **Step 1: Write a failing test for `DuePanel`**

`client/test/DuePanel.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DuePanel from '../src/DuePanel.js';

describe('DuePanel', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{
        id: 1, raw_text: 'pay rent', domain: 'finance', type: 'expense', structured: '{}',
        tags: null, remind_at: '2024-01-01T00:00:00.000Z', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
      }]),
    }) as never;
  });

  it('fetches and renders due entries', async () => {
    render(<DuePanel />);
    await waitFor(() => expect(screen.getByText('pay rent')).toBeInTheDocument());
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/due'));
  });

  it('shows a message when nothing is due', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as never;
    render(<DuePanel />);
    await waitFor(() => expect(screen.getByText(/nothing due/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=client`
Expected: FAIL — `../src/DuePanel.js` does not exist.

- [ ] **Step 3: Implement `client/src/DuePanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { listDueEntries, type Entry } from './api.js';

export default function DuePanel() {
  const [due, setDue] = useState<Entry[] | null>(null);

  useEffect(() => {
    listDueEntries().then(setDue).catch(() => setDue([]));
  }, []);

  if (due === null) return null;

  return (
    <section>
      <h2>Due / Upcoming</h2>
      {due.length === 0 ? (
        <p>Nothing due.</p>
      ) : (
        <ul>
          {due.map((entry) => (
            <li key={entry.id}>{entry.raw_text} — {entry.remind_at}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Mount it in `client/src/App.tsx`** (adds the `<DuePanel />` line to the Task 7 version of this file — everything else, including the `onEdit` wiring, is unchanged)

```tsx
import { useEffect, useState } from 'react';
import CaptureBox from './CaptureBox.js';
import EntryList from './EntryList.js';
import DuePanel from './DuePanel.js';
import { listEntries, deleteEntry, updateEntry, type Entry } from './api.js';

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    listEntries().then(setEntries).catch(() => {});
  }, []);

  return (
    <div>
      <h1>Genie</h1>
      <CaptureBox onCaptured={(entry) => setEntries((prev) => [entry, ...prev])} />
      <DuePanel />
      <EntryList
        entries={entries}
        onDelete={async (id) => {
          await deleteEntry(id);
          setEntries((prev) => prev.filter((e) => e.id !== id));
        }}
        onEdit={async (id, fields) => {
          const updated = await updateEntry(id, fields);
          setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: all tests PASS, including the existing `App.test.tsx` heading test.

- [ ] **Step 6: Commit**

```bash
git add client/src/DuePanel.tsx client/src/App.tsx client/test/DuePanel.test.tsx
git commit -m "feat: add due/upcoming panel"
```

---

### Task 10: Search UI, production wiring, and quick-start docs

**Files:**
- Create: `client/src/SearchBox.tsx`
- Modify: `client/src/App.tsx`
- Create: `README.md`
- Test: `client/test/SearchBox.test.tsx`

**Interfaces:**
- Consumes: `askQuestion()` from `client/src/api.ts` (Task 7).
- Produces: none consumed by later tasks — this is the final task.

- [ ] **Step 1: Write a failing test for `SearchBox`**

`client/test/SearchBox.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchBox from '../src/SearchBox.js';

describe('SearchBox', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'You spent $50 on groceries.', matched: 1 }),
    }) as never;
  });

  it('submits a question and shows the answer', async () => {
    render(<SearchBox />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), { target: { value: 'how much on groceries?' } });
    fireEvent.click(screen.getByRole('button', { name: /ask/i }));

    await waitFor(() => expect(screen.getByText('You spent $50 on groceries.')).toBeInTheDocument());
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/search', expect.objectContaining({ method: 'POST' }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=client`
Expected: FAIL — `../src/SearchBox.js` does not exist.

- [ ] **Step 3: Implement `client/src/SearchBox.tsx`**

```tsx
import { useState } from 'react';
import { askQuestion } from './api.js';

export default function SearchBox() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    try {
      const result = await askQuestion(question);
      setAnswer(result.answer);
    } finally {
      setAsking(false);
    }
  }

  return (
    <section>
      <h2>Ask Genie</h2>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Ask a question about your entries..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={asking}>Ask</button>
      </form>
      {answer && <p>{answer}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Mount it in `client/src/App.tsx`** (add below `EntryList`)

```tsx
import SearchBox from './SearchBox.js';
// ...
      <EntryList /* ...unchanged... */ />
      <SearchBox />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: all tests PASS.

- [ ] **Step 6: Write `README.md`**

```markdown
# Genie

A local-first personal capture app. Type or speak anything — a task, an
expense, a note, a reminder — and it's classified, stored, and later
searchable. See `docs/intent.md` and `docs/spec.md` for the full design.

## Setup

1. `npm install`
2. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
   (free tier available) and set `GEMINI_API_KEY` in your environment
   (or a `.env` file loaded by your shell) — used for classification
   and search.
3. `npm run dev` — starts the API on :3001 and the Vite dev server
   (proxying `/api` to it) on :5173.

## Production

`npm run build && npm start` — builds the client and serves it plus the
API from a single Express process on :3001 (override with `PORT`).

## Tests

`npm test` runs both workspaces' test suites.
```

- [ ] **Step 7: Run the full test suite from repo root**

Run: `npm test`
Expected: all server and client tests PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/SearchBox.tsx client/src/App.tsx client/test/SearchBox.test.tsx README.md
git commit -m "feat: add search UI, add README"
```

## End-to-end manual verification (after Task 10)

1. `npm run dev`, open `http://localhost:5173`.
2. Type "pay rent $1500 by the 5th" into the capture box, submit — confirm it appears in the list tagged `finance/expense` (or similar) and shows up in the Due panel if a date was extracted.
3. Click the mic button, speak a personal reminder, confirm the transcribed text appears in the input before submitting.
4. Type a work task with no due date, submit — confirm it's categorized `work/task` and does *not* appear in the Due panel.
5. In the Ask Genie box, ask "how much did I say I'd spend on rent?" — confirm the answer references the $1500 entry.
6. Delete one entry from the list — confirm it disappears and does not reappear on refresh.

---

# v1.1 — Recurring Tasks, Due/Upcoming Split, Recent Filters/Sort

**Spec:** `docs/spec.md`'s Recurrence, Reminders, and "Recent list: filter
+ sort" sections (`requirements: docs/intent.md`'s v1.1 goals).

### Task 11: Recurrence in the data layer and classification

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/test/db.test.ts`
- Modify: `server/src/gemini.ts`
- Modify: `server/test/gemini.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Recurrence`/`RecurrenceFreq` types, `Entry.recurrence`/
  `series_id`/`spawned_next` fields, `NewEntry.recurrence`/`series_id`,
  `advanceRecurringEntries(db, nowISO): Entry[]` (all from `db.ts`,
  used by Task 12's routes); `ClassifyResult.recurrence` (from
  `gemini.ts`, used by Task 12's POST handler).

- [ ] **Step 1: Write failing tests for recurrence storage and `advanceRecurringEntries`**

Append to `server/test/db.test.ts` (add `advanceRecurringEntries` to
the existing import from `../src/db.js`):
```ts
import {
  openDb, createEntry, getEntry, listEntries, listDueEntries, updateEntry, deleteEntry,
  advanceRecurringEntries,
} from '../src/db.js';
```

Add these `it` blocks inside the existing `describe('db', ...)` block,
after the `'deletes an entry'` test:
```ts
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
});
```

(Note: the closing `});` of the original `describe('db', ...)` block
moves up to right after the two new tests inside it, then a new
top-level `describe('advanceRecurringEntries', ...)` follows, as shown
above.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `advanceRecurringEntries` is not exported, and the
`recurrence`/`series_id`/`spawned_next` fields don't exist yet.

- [ ] **Step 3: Implement the schema, type, and function changes in `server/src/db.ts`**

Replace the whole file with:
```ts
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
  db.prepare(`
    UPDATE entries SET raw_text=@raw_text, domain=@domain, type=@type, structured=@structured,
      tags=@tags, remind_at=@remind_at, recurrence=@recurrence, updated_at=@updated_at WHERE id=@id
  `).run(merged);
  return getEntry(db, id);
}

export function deleteEntry(db: Database.Database, id: number): boolean {
  const info = db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  return info.changes > 0;
}

function advanceDate(iso: string, recurrence: Recurrence): string {
  const date = new Date(iso);
  switch (recurrence.freq) {
    case 'daily':
      date.setDate(date.getDate() + recurrence.interval);
      break;
    case 'weekly':
      date.setDate(date.getDate() + recurrence.interval * 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + recurrence.interval);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + recurrence.interval);
      break;
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
    const recurrence = JSON.parse(source.recurrence!) as Recurrence;
    const nextRemindAt = advanceDate(source.remind_at!, recurrence);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: all `db.test.ts` tests PASS.

- [ ] **Step 5: Write failing tests for recurrence in classification**

Append to `server/test/gemini.test.ts`, inside the existing
`describe('classifyEntry', ...)` block:
```ts
  it('includes recurrence when Gemini detects one', async () => {
    const client = mockClient(JSON.stringify({
      domain: 'finance', type: 'expense', structured: { amount: 1500 },
      remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    }));
    const result = await classifyEntry(client, 'pay rent $1500 every month');
    expect(result.recurrence).toEqual({ freq: 'monthly', interval: 1 });
  });

  it('defaults recurrence to null when omitted', async () => {
    const client = mockClient(JSON.stringify({ domain: 'personal', type: 'note', remind_at: null }));
    const result = await classifyEntry(client, 'saw a nice sunset');
    expect(result.recurrence).toBeNull();
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — `result.recurrence` is `undefined`, not present on
`ClassifyResult`.

- [ ] **Step 7: Implement the recurrence changes in `server/src/gemini.ts`**

```ts
import type { GoogleGenAI } from '@google/genai';
import type { Domain, EntryType, Recurrence } from './db.js';

export interface ClassifyResult {
  domain: Domain;
  type: EntryType;
  structured: Record<string, unknown>;
  remind_at: string | null;
  recurrence: Recurrence | null;
}

const CLASSIFY_SYSTEM_PROMPT = `You are a personal organizer. Given a short note the user typed or spoke, classify it and extract structured details.

Respond with ONLY a JSON object, no other text, matching this shape:
{
  "domain": "work" | "finance" | "personal",
  "type": "task" | "expense" | "note" | "reminder" | "event",
  "structured": { <type-specific fields, e.g. amount/currency/category for expense, due_date/project for task, date/location for event> },
  "remind_at": "<ISO 8601 timestamp, or null if there's no clear due date/time>",
  "recurrence": null | { "freq": "daily" | "weekly" | "monthly" | "yearly", "interval": <positive integer, e.g. 1 for "every month", 2 for "every 2 weeks"> }
}

Only set "recurrence" when the text clearly implies something repeats
("every month", "weekly", "each Monday", "annually"). Otherwise it
must be null. When recurrence is set, "remind_at" should be the first
upcoming occurrence.

Today's date is {{today}}.`;

export async function classifyEntry(
  client: Pick<GoogleGenAI, 'models'>,
  rawText: string
): Promise<ClassifyResult> {
  const systemInstruction = CLASSIFY_SYSTEM_PROMPT.replace('{{today}}', new Date().toISOString().slice(0, 10));
  const response = await client.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: rawText,
    config: { systemInstruction },
  });

  if (!response.text) throw new Error('Gemini response had no text content');

  const parsed = JSON.parse(response.text);
  return {
    domain: parsed.domain,
    type: parsed.type,
    structured: parsed.structured ?? {},
    remind_at: parsed.remind_at ?? null,
    recurrence: parsed.recurrence ?? null,
  };
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: all `db.test.ts` and `gemini.test.ts` tests PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/db.ts server/test/db.test.ts server/src/gemini.ts server/test/gemini.test.ts
git commit -m "feat: add recurrence storage, series linking, and advanceRecurringEntries"
```

---

### Task 12: Wire recurrence into the entries API

**Files:**
- Modify: `server/src/routes/entries.ts`
- Modify: `server/test/entries.route.test.ts`

**Interfaces:**
- Consumes: `advanceRecurringEntries`, `Recurrence`, `RecurrenceFreq`
  from `server/src/db.ts` (Task 11); `ClassifyResult.recurrence` from
  `server/src/gemini.ts` (Task 11).
- Produces: no new exports — `GET /api/entries` and `GET
  /api/entries/due` now self-advance recurring entries first; `PATCH
  /api/entries/:id` accepts and validates `recurrence`.

- [ ] **Step 1: Write failing tests**

Add to `server/test/entries.route.test.ts`, inside the existing
`describe('entries API', ...)` block:
```ts
  it('POST /api/entries stores recurrence when Gemini detects one', async () => {
    const gemini = mockGemini(JSON.stringify({
      domain: 'finance', type: 'expense', structured: {}, remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    }));
    const app = buildApp(db, gemini as never);

    const res = await request(app).post('/api/entries').send({ raw_text: 'pay rent every month' });

    expect(res.status).toBe(201);
    expect(JSON.parse(res.body.recurrence)).toEqual({ freq: 'monthly', interval: 1 });
  });

  it('GET /api/entries advances due recurring entries before listing', async () => {
    const gemini = mockGemini(JSON.stringify({
      domain: 'finance', type: 'expense', structured: {}, remind_at: '2020-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    }));
    const app = buildApp(db, gemini as never);
    await request(app).post('/api/entries').send({ raw_text: 'pay rent every month' });

    const res = await request(app).get('/api/entries');

    expect(res.body).toHaveLength(2);
  });

  it('PATCH /api/entries/:id returns 400 for an invalid recurrence freq', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'personal', type: 'note', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const created = await request(app).post('/api/entries').send({ raw_text: 'note' });

    const res = await request(app)
      .patch(`/api/entries/${created.body.id}`)
      .send({ recurrence: { freq: 'hourly', interval: 1 } });

    expect(res.status).toBe(400);
  });

  it('PATCH /api/entries/:id accepts a valid recurrence and clearing it', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'personal', type: 'note', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const created = await request(app).post('/api/entries').send({ raw_text: 'note' });

    const withRecurrence = await request(app)
      .patch(`/api/entries/${created.body.id}`)
      .send({ recurrence: { freq: 'weekly', interval: 2 } });
    expect(withRecurrence.status).toBe(200);
    expect(JSON.parse(withRecurrence.body.recurrence)).toEqual({ freq: 'weekly', interval: 2 });

    const cleared = await request(app)
      .patch(`/api/entries/${created.body.id}`)
      .send({ recurrence: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.recurrence).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: FAIL — recurrence isn't passed through on POST, `GET
/api/entries` returns only 1 entry (no advancement), and PATCH accepts
an invalid `recurrence` (no validation yet).

- [ ] **Step 3: Implement `server/src/routes/entries.ts`**

```ts
import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { GoogleGenAI } from '@google/genai';
import { classifyEntry } from '../gemini.js';
import {
  createEntry, listEntries, listDueEntries, updateEntry, deleteEntry, advanceRecurringEntries,
  type Domain, type EntryType, type RecurrenceFreq,
} from '../db.js';

const DOMAINS: Domain[] = ['work', 'finance', 'personal'];
const TYPES: EntryType[] = ['task', 'expense', 'note', 'reminder', 'event'];
const RECURRENCE_FREQS: RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) ? id : undefined;
}

function isValidRecurrence(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.freq === 'string' && RECURRENCE_FREQS.includes(v.freq as RecurrenceFreq) &&
    typeof v.interval === 'number' && v.interval > 0
  );
}

export function entriesRouter(db: Database.Database, gemini: Pick<GoogleGenAI, 'models'>): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const rawText = req.body?.raw_text;
    if (typeof rawText !== 'string' || rawText.trim() === '') {
      return res.status(400).json({ error: 'raw_text is required' });
    }
    try {
      const classified = await classifyEntry(gemini, rawText);
      const entry = createEntry(db, {
        raw_text: rawText,
        domain: classified.domain,
        type: classified.type,
        structured: classified.structured,
        remind_at: classified.remind_at,
        recurrence: classified.recurrence,
      });
      res.status(201).json(entry);
    } catch (err) {
      res.status(502).json({ error: 'classification failed', detail: (err as Error).message });
    }
  });

  router.get('/', (_req, res) => {
    advanceRecurringEntries(db, new Date().toISOString());
    res.json(listEntries(db));
  });

  router.get('/due', (req, res) => {
    const before = typeof req.query.before === 'string' ? req.query.before : new Date().toISOString();
    advanceRecurringEntries(db, new Date().toISOString());
    res.json(listDueEntries(db, before));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === undefined) return res.status(400).json({ error: 'invalid id' });

    const body = req.body ?? {};
    if (body.domain !== undefined && !DOMAINS.includes(body.domain)) {
      return res.status(400).json({ error: `domain must be one of ${DOMAINS.join(', ')}` });
    }
    if (body.type !== undefined && !TYPES.includes(body.type)) {
      return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
    }
    if (body.recurrence !== undefined && !isValidRecurrence(body.recurrence)) {
      return res.status(400).json({
        error: `recurrence must be null or { freq: ${RECURRENCE_FREQS.join('|')}, interval: positive number }`,
      });
    }

    const updated = updateEntry(db, id, body);
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === undefined) return res.status(400).json({ error: 'invalid id' });

    const ok = deleteEntry(db, id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.status(204).send();
  });

  return router;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: all `entries.route.test.ts` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/entries.ts server/test/entries.route.test.ts
git commit -m "feat: wire recurrence advancement and validation into entries API"
```

---

### Task 13: Recurrence indicator and edit UI (client)

**Files:**
- Modify: `client/src/api.ts`
- Modify: `client/src/EntryList.tsx`
- Modify: `client/test/EntryList.test.tsx`
- Modify: `client/src/styles.css`

**Interfaces:**
- Consumes: nothing new from other client files.
- Produces: `Entry.recurrence`/`series_id`, `RECURRENCE_FREQS` (from
  `api.ts`); `EntryList`'s `onEdit` fields gain an optional
  `recurrence` — consumed by Task 15 unchanged (Task 15 only adds
  filter/sort, not new fields).

- [ ] **Step 1: Write failing tests**

Add to `client/test/EntryList.test.tsx`, after the existing `entry`
const, add a recurring variant, and new tests inside `describe('EntryList', ...)`:
```tsx
const recurringEntry: Entry = {
  ...entry, id: 2, raw_text: 'pay rent',
  recurrence: JSON.stringify({ freq: 'monthly', interval: 1 }),
};
```

```tsx
  it('shows a recurrence indicator for entries with a recurrence', () => {
    render(<EntryList entries={[recurringEntry]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.getByTitle(/recurs monthly/i)).toBeInTheDocument();
  });

  it('does not show a recurrence indicator for non-recurring entries', () => {
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.queryByTitle(/recurs/i)).not.toBeInTheDocument();
  });

  it('edit form lets you set a recurrence on a non-recurring entry', () => {
    const onEdit = vi.fn();
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /repeats/i }), { target: { value: 'weekly' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEdit).toHaveBeenCalledWith(1, expect.objectContaining({ recurrence: { freq: 'weekly', interval: 1 } }));
  });

  it('edit form lets you clear an existing recurrence', () => {
    const onEdit = vi.fn();
    render(<EntryList entries={[recurringEntry]} onDelete={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /repeats/i }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEdit).toHaveBeenCalledWith(2, expect.objectContaining({ recurrence: null }));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=client`
Expected: FAIL — no recurrence indicator, no "repeats" combobox.

- [ ] **Step 3: Add `recurrence`/`series_id` to `Entry` and export `RECURRENCE_FREQS` in `client/src/api.ts`**

```ts
export interface Entry {
  id: number;
  raw_text: string;
  domain: 'work' | 'finance' | 'personal';
  type: 'task' | 'expense' | 'note' | 'reminder' | 'event';
  structured: string;
  tags: string | null;
  remind_at: string | null;
  recurrence: string | null;
  series_id: number | null;
  created_at: string;
  updated_at: string;
}

export const DOMAINS: Entry['domain'][] = ['work', 'finance', 'personal'];
export const TYPES: Entry['type'][] = ['task', 'expense', 'note', 'reminder', 'event'];
export const RECURRENCE_FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];
export interface Recurrence { freq: RecurrenceFreq; interval: number }
```
(This block replaces the existing `Entry` interface and `DOMAINS`/
`TYPES` constants at the top of the file — everything below them,
including `updateEntry`, is unchanged except `updateEntry`'s
signature, updated next.)

Update `updateEntry`'s signature (the rest of the function body is
unchanged):
```ts
export async function updateEntry(
  id: number,
  fields: Pick<Entry, 'raw_text' | 'domain' | 'type'> & { recurrence: Recurrence | null }
): Promise<Entry> {
```

- [ ] **Step 4: Implement `client/src/EntryList.tsx`**

```tsx
import { useState } from 'react';
import { DOMAINS, TYPES, RECURRENCE_FREQS, type Entry, type Recurrence } from './api.js';

type Draft = { raw_text: string; domain: Entry['domain']; type: Entry['type']; recurrence: Recurrence | null };

function recurrenceLabel(entry: Entry): string | null {
  if (!entry.recurrence) return null;
  try {
    const r = JSON.parse(entry.recurrence) as Recurrence;
    return r.interval > 1 ? `recurs every ${r.interval} ${r.freq}` : `recurs ${r.freq}`;
  } catch {
    return null;
  }
}

export default function EntryList({
  entries, onDelete, onEdit,
}: {
  entries: Entry[];
  onDelete: (id: number) => void;
  onEdit: (id: number, fields: Draft) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setDraft({
      raw_text: entry.raw_text,
      domain: entry.domain,
      type: entry.type,
      recurrence: entry.recurrence ? (JSON.parse(entry.recurrence) as Recurrence) : null,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit() {
    if (editingId !== null && draft) onEdit(editingId, draft);
    cancelEdit();
  }

  if (entries.length === 0) {
    return <p className="empty-note">Nothing captured yet — try the box above.</p>;
  }

  return (
    <ul className="entry-list">
      {entries.map((entry) => {
        const label = recurrenceLabel(entry);
        return (
          <li key={entry.id} className="entry-row">
            {editingId === entry.id && draft ? (
              <div className="entry-edit-row">
                <input
                  className="entry-edit-input"
                  value={draft.raw_text}
                  onChange={(e) => setDraft({ ...draft, raw_text: e.target.value })}
                />
                <select
                  className="entry-edit-select"
                  aria-label="domain"
                  value={draft.domain}
                  onChange={(e) => setDraft({ ...draft, domain: e.target.value as Entry['domain'] })}
                >
                  {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select
                  className="entry-edit-select"
                  aria-label="type"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as Entry['type'] })}
                >
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  className="entry-edit-select"
                  aria-label="repeats"
                  value={draft.recurrence?.freq ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft({
                      ...draft,
                      recurrence: value ? { freq: value as Recurrence['freq'], interval: draft.recurrence?.interval ?? 1 } : null,
                    });
                  }}
                >
                  <option value="">Doesn't repeat</option>
                  {RECURRENCE_FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <button className="btn-save" onClick={saveEdit}>Save</button>
                <button className="btn-cancel" onClick={cancelEdit}>Cancel</button>
              </div>
            ) : (
              <>
                <span className={`entry-dot domain-${entry.domain}`} aria-hidden="true" />
                <span className="entry-text">{entry.raw_text}</span>
                {label && <span className="recur-indicator" title={label} aria-hidden="true">↻</span>}
                <small className="entry-meta"> ({entry.domain}/{entry.type})</small>
                <span className="entry-actions">
                  <button className="btn-text" onClick={() => startEdit(entry)}>Edit</button>
                  <button className="btn-text" onClick={() => onDelete(entry.id)}>Delete</button>
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: Add the recurrence indicator style to `client/src/styles.css`**

Append:
```css
.recur-indicator {
  flex: none;
  color: var(--accent);
  font-size: 13px;
  cursor: default;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: all `EntryList.test.tsx` tests PASS.

- [ ] **Step 7: Run TypeScript and the full client suite**

Run: `cd client && npx tsc -b --noEmit && cd .. && npm run test --workspace=client`
Expected: no type errors, all tests PASS. (`App.tsx`'s call to
`updateEntry` will now need `recurrence` included in the object it
passes — since `App.tsx` already forwards whatever `EntryList` gives
`onEdit` straight to `updateEntry(id, fields)` unchanged, no edit to
`App.tsx` is needed here.)

- [ ] **Step 8: Commit**

```bash
git add client/src/api.ts client/src/EntryList.tsx client/test/EntryList.test.tsx client/src/styles.css
git commit -m "feat: add recurrence indicator and edit UI to entries list"
```

---

### Task 14: Split Due / Upcoming panel

**Files:**
- Modify: `client/src/DuePanel.tsx`
- Modify: `client/test/DuePanel.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/styles.css`

**Interfaces:**
- Consumes: `Entry.recurrence` (Task 13), `listDueEntries()` (Task 7).
- Produces: `<DuePanel refreshKey={number}>` now renders two `<section>`
  elements (Due, Upcoming) instead of one — `App.tsx`'s wrapping
  `<div className="section">` around it is removed since `DuePanel`
  now supplies its own section spacing.

- [ ] **Step 1: Replace `client/test/DuePanel.test.tsx` with failing tests for the split**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import DuePanel from '../src/DuePanel.js';
import type { Entry } from '../src/api.js';

function entry(overrides: Partial<Entry>): Entry {
  return {
    id: 1, raw_text: '', domain: 'personal', type: 'note', structured: '{}',
    tags: null, remind_at: null, recurrence: null, series_id: null,
    created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('DuePanel', () => {
  it('splits entries into Due (past/at now) and Upcoming (future within window)', async () => {
    const past = entry({ id: 1, raw_text: 'pay rent', remind_at: new Date(Date.now() - 3600_000).toISOString() });
    const future = entry({ id: 2, raw_text: 'call dentist', remind_at: new Date(Date.now() + 3600_000).toISOString() });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [past, future] }) as never;

    render(<DuePanel />);
    await waitFor(() => expect(screen.getByText(/pay rent/)).toBeInTheDocument());

    const dueSection = screen.getByRole('heading', { name: /^due$/i }).closest('section')!;
    const upcomingSection = screen.getByRole('heading', { name: /^upcoming$/i }).closest('section')!;
    expect(within(dueSection).getByText(/pay rent/)).toBeInTheDocument();
    expect(within(upcomingSection).getByText(/call dentist/)).toBeInTheDocument();
  });

  it('shows empty-state messages for each section when nothing qualifies', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as never;
    render(<DuePanel />);
    await waitFor(() => expect(screen.getByText(/nothing due right now/i)).toBeInTheDocument());
    expect(screen.getByText(/nothing coming up/i)).toBeInTheDocument();
  });

  it('shows a recurrence indicator on recurring entries', async () => {
    const recurring = entry({
      id: 3, raw_text: 'pay rent', remind_at: new Date(Date.now() - 1000).toISOString(),
      recurrence: JSON.stringify({ freq: 'monthly', interval: 1 }),
    });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [recurring] }) as never;
    render(<DuePanel />);
    await waitFor(() => expect(screen.getByTitle(/recurs monthly/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=client`
Expected: FAIL — current `DuePanel` renders one "Due / Upcoming"
heading, not separate "Due"/"Upcoming" headings, and has no recurrence
indicator.

- [ ] **Step 3: Implement `client/src/DuePanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { listDueEntries, type Entry, type Recurrence } from './api.js';

function formatDue(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function recurrenceLabel(entry: Entry): string | null {
  if (!entry.recurrence) return null;
  try {
    const r = JSON.parse(entry.recurrence) as Recurrence;
    return r.interval > 1 ? `recurs every ${r.interval} ${r.freq}` : `recurs ${r.freq}`;
  } catch {
    return null;
  }
}

function DueRow({ entry }: { entry: Entry }) {
  const label = recurrenceLabel(entry);
  return (
    <li className="due-row">
      <span className="due-dot" aria-hidden="true" />
      <span className="due-text">{entry.raw_text}</span>
      {label && <span className="recur-indicator" title={label} aria-hidden="true">↻</span>}
      <span className="due-time">{entry.remind_at ? formatDue(entry.remind_at) : ''}</span>
    </li>
  );
}

export default function DuePanel({ refreshKey }: { refreshKey?: number } = {}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    listDueEntries().then(setEntries).catch(() => setEntries([]));
  }, [refreshKey]);

  if (entries === null) return null;

  const nowISO = new Date().toISOString();
  const due = entries.filter((e) => e.remind_at && e.remind_at <= nowISO);
  const upcoming = entries.filter((e) => e.remind_at && e.remind_at > nowISO);

  return (
    <>
      <section className="section">
        <h2 className="section-title">
          Due
          {due.length > 0 && <span className="section-count">{due.length}</span>}
        </h2>
        {due.length === 0 ? (
          <p className="empty-note">Nothing due right now.</p>
        ) : (
          <ul className="due-list">
            {due.map((entry) => <DueRow key={entry.id} entry={entry} />)}
          </ul>
        )}
      </section>
      <section className="section">
        <h2 className="section-title">
          Upcoming
          {upcoming.length > 0 && <span className="section-count">{upcoming.length}</span>}
        </h2>
        {upcoming.length === 0 ? (
          <p className="empty-note">Nothing coming up in the next 24 hours.</p>
        ) : (
          <ul className="due-list">
            {upcoming.map((entry) => <DueRow key={entry.id} entry={entry} />)}
          </ul>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Update `client/src/App.tsx`** — remove the wrapping
`<div className="section">` around `<DuePanel />`, since it now
supplies its own two `<section className="section">` elements:

```tsx
      <DuePanel refreshKey={dueRefreshKey} />
```
(replaces the previous `<div className="section"><DuePanel
refreshKey={dueRefreshKey} /></div>` — everything else in `App.tsx` is
unchanged.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: all tests PASS, including `App.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add client/src/DuePanel.tsx client/test/DuePanel.test.tsx client/src/App.tsx
git commit -m "feat: split Due/Upcoming panel, show recurrence indicator"
```

---

### Task 15: Filter and ascending sort on the Recent list

**Files:**
- Modify: `client/src/EntryList.tsx`
- Modify: `client/test/EntryList.test.tsx`
- Modify: `client/src/styles.css`

**Interfaces:**
- Consumes: `Entry.domain`/`remind_at`/`created_at` (existing).
- Produces: no new exports — `EntryList` now filters/sorts the
  `entries` prop internally before rendering; `onDelete`/`onEdit`
  still receive the real entry `id`, so `App.tsx` needs no changes.

- [ ] **Step 1: Write failing tests**

Add to `client/test/EntryList.test.tsx`, inside `describe('EntryList', ...)`:
```tsx
  it('filters entries by domain when a filter pill is clicked', () => {
    const workEntry: Entry = { ...entry, id: 3, domain: 'work', raw_text: 'write report' };
    render(<EntryList entries={[entry, workEntry]} onDelete={() => {}} onEdit={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /^work$/i }));

    expect(screen.getByText('write report')).toBeInTheDocument();
    expect(screen.queryByText('buy milk')).not.toBeInTheDocument();
  });

  it('shows all entries again when All is selected', () => {
    const workEntry: Entry = { ...entry, id: 3, domain: 'work', raw_text: 'write report' };
    render(<EntryList entries={[entry, workEntry]} onDelete={() => {}} onEdit={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /^work$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));

    expect(screen.getByText('buy milk')).toBeInTheDocument();
    expect(screen.getByText('write report')).toBeInTheDocument();
  });

  it('sorts entries with a due date ascending before entries without one', () => {
    const soon: Entry = { ...entry, id: 4, raw_text: 'soon-task', remind_at: '2020-01-01T00:00:00.000Z' };
    const later: Entry = { ...entry, id: 5, raw_text: 'later-task', remind_at: '2020-06-01T00:00:00.000Z' };
    const noDue: Entry = { ...entry, id: 6, raw_text: 'someday-task', remind_at: null };
    render(<EntryList entries={[noDue, later, soon]} onDelete={() => {}} onEdit={() => {}} />);

    const texts = screen.getAllByText(/-task/).map((el) => el.textContent);
    expect(texts).toEqual(['soon-task', 'later-task', 'someday-task']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=client`
Expected: FAIL — no filter pills exist, and the list is unsorted
(renders in prop order).

- [ ] **Step 3: Implement filter and sort in `client/src/EntryList.tsx`**

Add near the top of the file, after the existing `recurrenceLabel`
function:
```tsx
const DOMAIN_FILTERS = ['all', ...DOMAINS] as const;
type DomainFilter = (typeof DOMAIN_FILTERS)[number];

function sortByDueThenRecent(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.remind_at && b.remind_at) return a.remind_at < b.remind_at ? -1 : a.remind_at > b.remind_at ? 1 : 0;
    if (a.remind_at && !b.remind_at) return -1;
    if (!a.remind_at && b.remind_at) return 1;
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
  });
}
```

Inside the `EntryList` component, add filter state and derive the
list to render (replacing the direct `entries.map(...)` with
`visible.map(...)`):
```tsx
  const [filter, setFilter] = useState<DomainFilter>('all');

  if (entries.length === 0) {
    return <p className="empty-note">Nothing captured yet — try the box above.</p>;
  }

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.domain === filter);
  const visible = sortByDueThenRecent(filtered);

  return (
    <>
      <div className="filter-pills">
        {DOMAIN_FILTERS.map((f) => (
          <button
            key={f}
            className={`filter-pill${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="empty-note">No entries match this filter.</p>
      ) : (
        <ul className="entry-list">
          {visible.map((entry) => {
```
(the existing per-entry `<li>` block — editing form, dot, text,
recurrence indicator, meta, actions — is unchanged; only its
surrounding closes need to switch from `</ul>` to also closing the new
wrapping `</>` fragment: `})}\n        </ul>\n      )}\n    </>\n  );\n}`
replaces the previous `})}\n    </ul>\n  );\n}` at the end of the file.)

- [ ] **Step 4: Add filter pill styles to `client/src/styles.css`**

Append:
```css
.filter-pills {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.filter-pill {
  background: none;
  border: 1px solid var(--hairline);
  color: var(--text-muted);
  font-size: 12.5px;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
}

.filter-pill:hover {
  color: var(--text);
}

.filter-pill.active {
  background: var(--surface-raised);
  border-color: var(--accent-ring);
  color: var(--text);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: all `EntryList.test.tsx` tests PASS.

- [ ] **Step 6: Run the full test suite and TypeScript from repo root**

Run: `npm test && cd client && npx tsc -b --noEmit && cd ../server && npx tsc -p tsconfig.json --noEmit`
Expected: everything PASSes, no type errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/EntryList.tsx client/test/EntryList.test.tsx client/src/styles.css
git commit -m "feat: add domain filter and due-date-ascending sort to Recent list"
```

## End-to-end manual verification (v1.1, after Task 15)

1. `npm run dev`, open `http://localhost:5173`.
2. Capture "pay rent $1500 on the 5th of every month" — confirm it
   appears once, tagged `finance`, with a ↻ recurrence indicator.
3. In the running server's SQLite file, manually set that entry's
   `remind_at` to a past timestamp (or just wait), then refresh /
   re-open the app — confirm a second "pay rent" entry appears with
   next month's date, and the original still exists (both visible in
   Recent, both searchable via Ask Genie).
4. Confirm the home screen now shows separate **Due** and **Upcoming**
   headings instead of one combined "Due / Upcoming".
5. In Recent, click the domain filter pills — confirm the list narrows
   to just that domain, and **All** restores everything.
6. Confirm Recent entries with a due date appear before ones without,
   soonest-due first.
7. Edit a non-recurring entry, set "repeats" to Weekly, save — confirm
   the ↻ indicator appears; edit it again, set back to "Doesn't
   repeat", save — confirm the indicator disappears.
