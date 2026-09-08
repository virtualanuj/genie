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
