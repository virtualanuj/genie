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
    await waitFor(() => expect(screen.getByText(/pay rent/)).toBeInTheDocument());
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/entries/due'));
  });

  it('shows a message when nothing is due', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as never;
    render(<DuePanel />);
    await waitFor(() => expect(screen.getByText(/nothing due/i)).toBeInTheDocument());
  });
});
