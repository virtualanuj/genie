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

  it('POST /api/entries logs a structured perf line on success', async () => {
    const gemini = mockGemini(JSON.stringify({
      domain: 'work', type: 'task', structured: {}, remind_at: null,
    }));
    const app = buildApp(db, gemini as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await request(app).post('/api/entries').send({ raw_text: 'finish the genie plan' });

    const perfLine = logSpy.mock.calls.map((c) => c[0]).find((line) => {
      try { return JSON.parse(line).event === 'capture'; } catch { return false; }
    });
    expect(perfLine).toBeDefined();
    const parsed = JSON.parse(perfLine as string);
    expect(parsed).toMatchObject({ event: 'capture', raw_text_len: 'finish the genie plan'.length });
    expect(parsed.classify_ms).toBeTypeOf('number');
    expect(parsed.db_ms).toBeTypeOf('number');
    expect(parsed.total_ms).toBeTypeOf('number');

    logSpy.mockRestore();
  });

  it('POST /api/entries logs a capture_failed perf line when classification fails', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'shopping', type: 'task', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await request(app).post('/api/entries').send({ raw_text: 'buy stuff' });

    const perfLine = logSpy.mock.calls.map((c) => c[0]).find((line) => {
      try { return JSON.parse(line).event === 'capture_failed'; } catch { return false; }
    });
    expect(perfLine).toBeDefined();
    const parsed = JSON.parse(perfLine as string);
    expect(parsed.classify_ms).toBeTypeOf('number');
    expect(parsed.total_ms).toBeTypeOf('number');

    logSpy.mockRestore();
  });

  it('POST /api/entries rejects empty raw_text', async () => {
    const app = buildApp(db, mockGemini('{}') as never);
    const res = await request(app).post('/api/entries').send({ raw_text: '  ' });
    expect(res.status).toBe(400);
  });

  it('POST /api/entries returns 502 when Gemini returns an unrecognized domain', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'shopping', type: 'task', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);

    const res = await request(app).post('/api/entries').send({ raw_text: 'buy stuff' });
    expect(res.status).toBe(502);

    const list = await request(app).get('/api/entries');
    expect(list.body).toHaveLength(0);
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
    const gemini = mockGemini(JSON.stringify({
      domain: 'personal', type: 'note', structured: {}, remind_at: '2026-01-05T00:00:00.000Z',
    }));
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

  it('PATCH /api/entries/:id rejects setting recurrence with no remind_at', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'personal', type: 'note', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const created = await request(app).post('/api/entries').send({ raw_text: 'note' });

    const res = await request(app)
      .patch(`/api/entries/${created.body.id}`)
      .send({ recurrence: { freq: 'weekly', interval: 2 } });

    expect(res.status).toBe(400);
  });

  it('PATCH /api/entries/:id rejects an empty raw_text', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'personal', type: 'note', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const created = await request(app).post('/api/entries').send({ raw_text: 'note' });

    const res = await request(app).patch(`/api/entries/${created.body.id}`).send({ raw_text: '   ' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/entries/:id rejects an unparseable remind_at', async () => {
    const gemini = mockGemini(JSON.stringify({ domain: 'personal', type: 'note', structured: {}, remind_at: null }));
    const app = buildApp(db, gemini as never);
    const created = await request(app).post('/api/entries').send({ raw_text: 'note' });

    const res = await request(app).patch(`/api/entries/${created.body.id}`).send({ remind_at: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});
