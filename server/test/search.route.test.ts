import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { openDb, createEntry, getEntry } from '../src/db.js';
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

  it('POST /api/search advances due recurring entries before searching', async () => {
    const db = openDb(':memory:');
    const source = createEntry(db, {
      raw_text: 'pay rent', domain: 'finance', type: 'expense', structured: { amount: 1500 },
      remind_at: '2020-01-05T00:00:00.000Z',
      recurrence: { freq: 'monthly', interval: 1 },
    });
    const gemini = { models: { generateContent: vi.fn().mockResolvedValue({ text: 'Yes.' }) } };
    const app = buildApp(db, gemini as never);

    await request(app).post('/api/search').send({ question: 'did I pay rent?' });

    expect(getEntry(db, source.id)!.spawned_next).toBe(1);
  });
});
