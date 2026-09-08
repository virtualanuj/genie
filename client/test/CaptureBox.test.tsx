import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CaptureBox from '../src/CaptureBox.js';

describe('CaptureBox', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, raw_text: 'buy milk', domain: 'personal', type: 'task' }),
    }) as never;
  });

  it('submits raw text and calls onCaptured with the created entry', async () => {
    const onCaptured = vi.fn();
    render(<CaptureBox onCaptured={onCaptured} />);

    fireEvent.change(screen.getByPlaceholderText(/type or say something/i), { target: { value: 'buy milk' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => expect(onCaptured).toHaveBeenCalledWith(expect.objectContaining({ raw_text: 'buy milk' })));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/entries', expect.objectContaining({ method: 'POST' }));
  });

  it('clears the input after a successful submit', async () => {
    render(<CaptureBox onCaptured={() => {}} />);
    const input = screen.getByPlaceholderText(/type or say something/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'buy milk' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    await waitFor(() => expect(input.value).toBe(''));
  });
});
