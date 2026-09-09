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
      recurrence: null,
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

  it('throws when Gemini returns an unrecognized domain', async () => {
    const client = mockClient(JSON.stringify({ domain: 'shopping', type: 'note', remind_at: null }));
    await expect(classifyEntry(client, 'x')).rejects.toThrow('unrecognized domain');
  });

  it('throws when Gemini returns an unrecognized type', async () => {
    const client = mockClient(JSON.stringify({ domain: 'personal', type: 'idea', remind_at: null }));
    await expect(classifyEntry(client, 'x')).rejects.toThrow('unrecognized type');
  });

  it('drops an unrecognized recurrence shape instead of throwing', async () => {
    const client = mockClient(JSON.stringify({
      domain: 'personal', type: 'task', remind_at: '2026-01-05T00:00:00.000Z',
      recurrence: { freq: 'hourly', interval: 1 },
    }));
    const result = await classifyEntry(client, 'x');
    expect(result.recurrence).toBeNull();
  });

  it('requests JSON-only output from Gemini', async () => {
    const client = mockClient(JSON.stringify({ domain: 'personal', type: 'note', remind_at: null }));
    await classifyEntry(client, 'x');
    expect(client.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ responseMimeType: 'application/json' }) })
    );
  });
});
