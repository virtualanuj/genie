import { describe, it, expect, vi } from 'vitest';
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

    const dueSection = screen.getByRole('heading', { name: /^due\b/i }).closest('section')!;
    const upcomingSection = screen.getByRole('heading', { name: /^upcoming\b/i }).closest('section')!;
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
