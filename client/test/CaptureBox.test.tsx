import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

  it('fills the input from a speech recognition result when the mic button is clicked', () => {
    let recognitionInstance: { onresult?: (e: unknown) => void; start: () => void } | undefined;
    class FakeRecognition {
      onresult?: (e: unknown) => void;
      start() { /* no-op; test triggers onresult directly */ }
      constructor() { recognitionInstance = this; }
    }
    (globalThis as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;

    try {
      render(<CaptureBox onCaptured={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /speak/i }));
      act(() => {
        recognitionInstance!.onresult!({ results: [[{ transcript: 'buy oat milk' }]] });
      });

      expect((screen.getByPlaceholderText(/type or say something/i) as HTMLInputElement).value).toBe('buy oat milk');
    } finally {
      delete (globalThis as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    }
  });

  it('does not render the mic button when speech recognition is unsupported', () => {
    render(<CaptureBox onCaptured={() => {}} />);
    expect(screen.queryByRole('button', { name: /speak/i })).not.toBeInTheDocument();
  });
});
