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
