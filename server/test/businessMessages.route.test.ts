import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { openDb, createBusinessMessage, type NewBusinessMessage } from '../src/db.js';
import { buildApp } from '../src/app.js';

function mockGemini(responseText: string) {
  return { models: { generateContent: vi.fn().mockResolvedValue({ text: responseText }) } };
}

const triaged = {
  category: 'request', priority: 'high', priority_reason: 'Client waiting on a quote',
  summary: 'Client asks for a quote by Friday', sender: 'Jane at Globex',
} as const;

const seed: NewBusinessMessage = { raw_text: 'hello', ...triaged };
const URL = '/api/business-messages';

describe('business messages API', () => {
  let db: ReturnType<typeof openDb>;

  beforeEach(() => {
    db = openDb(':memory:');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('POST triages and saves a message, storing the unredacted original', async () => {
    const gemini = mockGemini(JSON.stringify(triaged));
    const app = buildApp(db, gemini as never);
    const raw = 'Can you send a quote by Friday? jane@globex.com - Jane';

    const res = await request(app).post(URL).send({ raw_text: raw });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...triaged, status: 'open', priority_overridden: 0, raw_text: raw });
    expect(gemini.models.generateContent.mock.calls[0][0].contents).not.toContain('jane@globex.com');
  });

  it('POST saves spam as done', async () => {
    const app = buildApp(db, mockGemini(JSON.stringify({ ...triaged, category: 'spam', priority: 'low' })) as never);
    const res = await request(app).post(URL).send({ raw_text: 'WIN A FREE CRUISE' });
    expect(res.body.status).toBe('done');
  });

  it('POST accepts text longer than the triage limit and stores all of it', async () => {
    const app = buildApp(db, mockGemini(JSON.stringify(triaged)) as never);
    const raw = 'x'.repeat(3000);
    const res = await request(app).post(URL).send({ raw_text: raw });
    expect(res.status).toBe(201);
    expect(res.body.raw_text).toHaveLength(3000);
  });

  it('POST logs a triage perf line', async () => {
    const app = buildApp(db, mockGemini(JSON.stringify(triaged)) as never);
    await request(app).post(URL).send({ raw_text: 'x' });

    const lines = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    const perf = lines
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .find((l) => l?.event === 'triage');
    expect(perf).toMatchObject({ classify_ms: expect.any(Number), db_ms: expect.any(Number), total_ms: expect.any(Number) });
  });

  it('POST rejects empty raw_text with 400', async () => {
    const app = buildApp(db, mockGemini('{}') as never);
    expect((await request(app).post(URL).send({ raw_text: '  ' })).status).toBe(400);
  });

  it('POST returns 502 when triage fails', async () => {
    const app = buildApp(db, mockGemini(JSON.stringify({ category: 'nope', priority: 'low' })) as never);
    const res = await request(app).post(URL).send({ raw_text: 'x' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('triage failed');
  });

  it('GET returns messages in triage order', async () => {
    const low = createBusinessMessage(db, { ...seed, priority: 'low' });
    const urgent = createBusinessMessage(db, { ...seed, priority: 'urgent' });
    const app = buildApp(db, mockGemini('{}') as never);

    const res = await request(app).get(URL);
    expect(res.body.map((m: { id: number }) => m.id)).toEqual([urgent.id, low.id]);
  });

  it('PATCH sets status without flagging an override', async () => {
    const m = createBusinessMessage(db, seed);
    const app = buildApp(db, mockGemini('{}') as never);

    const res = await request(app).patch(`${URL}/${m.id}`).send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'done', priority_overridden: 0 });
  });

  it('PATCH overrides priority and flags it', async () => {
    const m = createBusinessMessage(db, seed);
    const app = buildApp(db, mockGemini('{}') as never);

    const res = await request(app).patch(`${URL}/${m.id}`).send({ priority: 'urgent' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ priority: 'urgent', priority_overridden: 1 });
  });

  it('PATCH rejects empty bodies, category, unknown keys, invalid values, bad ids, and missing rows', async () => {
    const m = createBusinessMessage(db, seed);
    const app = buildApp(db, mockGemini('{}') as never);
    const patch = (id: string | number, body: object) => request(app).patch(`${URL}/${id}`).send(body);

    expect((await patch(m.id, {})).status).toBe(400);
    expect((await patch(m.id, { category: 'fyi' })).status).toBe(400);
    expect((await patch(m.id, { status: 'done', summary: 'x' })).status).toBe(400);
    expect((await patch(m.id, { status: 'archived' })).status).toBe(400);
    expect((await patch(m.id, { priority: 'p1' })).status).toBe(400);
    expect((await patch('abc', { status: 'done' })).status).toBe(400);
    expect((await patch(9999, { status: 'done' })).status).toBe(404);
  });

  it('DELETE deletes, 404s when missing, 400s on a bad id', async () => {
    const m = createBusinessMessage(db, seed);
    const app = buildApp(db, mockGemini('{}') as never);

    expect((await request(app).delete(`${URL}/${m.id}`)).status).toBe(204);
    expect((await request(app).delete(`${URL}/${m.id}`)).status).toBe(404);
    expect((await request(app).delete(`${URL}/abc`)).status).toBe(400);
  });
});
