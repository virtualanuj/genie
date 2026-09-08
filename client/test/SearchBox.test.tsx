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
