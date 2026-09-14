import { describe, it, expect, vi } from 'vitest';
import { triageBusinessMessage } from '../src/gemini.js';

function mockClient(responseText: string | undefined) {
  return { models: { generateContent: vi.fn().mockResolvedValue({ text: responseText }) } };
}

const ok = JSON.stringify({
  category: 'complaint',
  priority: 'urgent',
  priority_reason: 'Customer threatening to cancel',
  summary: 'Acme says the product has been down all day',
  sender: 'Acme Corp',
});

function sentContents(client: ReturnType<typeof mockClient>): string {
  return client.models.generateContent.mock.calls[0][0].contents;
}

describe('triageBusinessMessage', () => {
  it('parses a well-formed triage response', async () => {
    const client = mockClient(ok);
    const result = await triageBusinessMessage(client, 'We have been down all day, fix it or we cancel. - Acme');

    expect(result).toEqual({
      category: 'complaint',
      priority: 'urgent',
      priority_reason: 'Customer threatening to cancel',
      summary: 'Acme says the product has been down all day',
      sender: 'Acme Corp',
    });
    expect(client.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-flash-lite-latest',
        config: expect.objectContaining({ responseMimeType: 'application/json' }),
      })
    );
  });

  it('never sends emails or phone numbers to Gemini', async () => {
    const client = mockClient(ok);
    await triageBusinessMessage(client, 'Email dana@acme.com or call +1 (555) 123-4567 / 555-987-6543');

    const sent = sentContents(client);
    expect(sent).not.toContain('dana@acme.com');
    expect(sent).not.toMatch(/555/);
    expect(sent).toBe('Email [EMAIL] or call [PHONE] / [PHONE]');
  });

  it('sends at most 1000 characters, redacting before truncating', async () => {
    const client = mockClient(ok);
    // The email straddles the 1000-char boundary: truncating first would leak "dana@ac".
    const text = 'a'.repeat(995) + ' dana@acme.com ' + 'b'.repeat(2000);
    await triageBusinessMessage(client, text);

    const sent = sentContents(client);
    expect(sent).toHaveLength(1000);
    expect(sent).not.toContain('dana@');
  });

  it('defaults missing summary/priority_reason to empty strings and a non-string sender to null', async () => {
    const client = mockClient(JSON.stringify({ category: 'fyi', priority: 'low', sender: 42 }));
    const result = await triageBusinessMessage(client, 'newsletter');
    expect(result).toMatchObject({ summary: '', priority_reason: '', sender: null });
  });

  it('throws on an unrecognized category', async () => {
    const client = mockClient(JSON.stringify({ category: 'invoice', priority: 'low' }));
    await expect(triageBusinessMessage(client, 'x')).rejects.toThrow('unrecognized category');
  });

  it('throws on an unrecognized priority', async () => {
    const client = mockClient(JSON.stringify({ category: 'fyi', priority: 'p1' }));
    await expect(triageBusinessMessage(client, 'x')).rejects.toThrow('unrecognized priority');
  });

  it('throws when the response has no text content', async () => {
    await expect(triageBusinessMessage(mockClient(undefined), 'x')).rejects.toThrow('no text content');
  });
});
