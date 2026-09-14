import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import BusinessTab from '../src/BusinessTab.js';
import type { BusinessMessage } from '../src/api.js';

const msg = (over: Partial<BusinessMessage>): BusinessMessage => ({
  id: 1, raw_text: 'raw', category: 'request', priority: 'medium', priority_overridden: 0,
  priority_reason: 'routine', summary: 'a summary', sender: null, status: 'open',
  created_at: '2026-09-14T10:00:00.000Z', updated_at: '2026-09-14T10:00:00.000Z',
  ...over,
});

type Handler = (init?: RequestInit) => { ok?: boolean; body: unknown };

function mockFetch(routes: Record<string, Handler>) {
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const handler = routes[key];
    if (!handler) return { ok: false, status: 500, json: async () => ({ error: `unmocked ${key}` }) };
    const { ok = true, body } = handler(init);
    return { ok, status: ok ? 200 : 500, json: async () => body };
  }) as never;
}

const URL = '/api/business-messages';

describe('BusinessTab', () => {
  beforeEach(() => {
    mockFetch({ [`GET ${URL}`]: () => ({ body: [] }) });
  });

  it('lists open messages with priority, category, and summary', async () => {
    mockFetch({
      [`GET ${URL}`]: () => ({ body: [msg({ id: 1, priority: 'urgent', category: 'complaint', summary: 'Site is down' })] }),
    });
    render(<BusinessTab />);

    const item = (await screen.findByText('Site is down')).closest('li')!;
    expect(within(item).getByRole('combobox', { name: 'Priority' })).toHaveValue('urgent');
    expect(within(item).getByText('Complaint')).toBeInTheDocument();
    expect(within(item).queryByText(/edited/i)).not.toBeInTheDocument();
  });

  it('triages a pasted message and inserts it in priority order', async () => {
    mockFetch({
      [`GET ${URL}`]: () => ({ body: [msg({ id: 1, priority: 'low', summary: 'Newsletter' })] }),
      [`POST ${URL}`]: () => ({ body: msg({ id: 2, priority: 'urgent', summary: 'Outage report' }) }),
    });
    render(<BusinessTab />);
    await screen.findByText('Newsletter');

    fireEvent.change(screen.getByPlaceholderText(/paste a business message/i), { target: { value: 'we are down' } });
    fireEvent.click(screen.getByRole('button', { name: /triage/i }));

    await screen.findByText('Outage report');
    expect(screen.getAllByTestId('message-summary').map((el) => el.textContent)).toEqual(['Outage report', 'Newsletter']);
  });

  it('shows an inline error when triage fails', async () => {
    render(<BusinessTab />);
    fireEvent.change(screen.getByPlaceholderText(/paste a business message/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /triage/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('overriding priority PATCHes, re-sorts, and shows the edited marker', async () => {
    mockFetch({
      [`GET ${URL}`]: () => ({ body: [msg({ id: 1, priority: 'high', summary: 'First' }), msg({ id: 2, priority: 'low', summary: 'Second' })] }),
      [`PATCH ${URL}/2`]: () => ({ body: msg({ id: 2, priority: 'urgent', priority_overridden: 1, summary: 'Second' }) }),
    });
    render(<BusinessTab />);
    const row = (await screen.findByText('Second')).closest('li')!;

    fireEvent.change(within(row).getByRole('combobox', { name: 'Priority' }), { target: { value: 'urgent' } });

    await waitFor(() =>
      expect(screen.getAllByTestId('message-summary').map((el) => el.textContent)).toEqual(['Second', 'First'])
    );
    expect(within(screen.getByText('Second').closest('li')!).getByText(/edited/i)).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${URL}/2`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ priority: 'urgent' }) })
    );
  });

  it('marking a message done moves it to the Done section and reports the open count', async () => {
    const onOpenCountChange = vi.fn();
    mockFetch({
      [`GET ${URL}`]: () => ({ body: [msg({ id: 1, summary: 'Quote request' })] }),
      [`PATCH ${URL}/1`]: () => ({ body: msg({ id: 1, summary: 'Quote request', status: 'done' }) }),
    });
    render(<BusinessTab onOpenCountChange={onOpenCountChange} />);
    await screen.findByText('Quote request');
    await waitFor(() => expect(onOpenCountChange).toHaveBeenLastCalledWith(1));
    expect(onOpenCountChange).not.toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByRole('button', { name: /mark done/i }));

    await waitFor(() => expect(screen.getByText(/done \(1\)/i)).toBeInTheDocument());
    const reopen = screen.getByRole('button', { name: /reopen/i });
    expect(reopen).toHaveAttribute('aria-pressed', 'true');
    expect(reopen).toHaveTextContent('Reopen');
    expect(onOpenCountChange).toHaveBeenLastCalledWith(0);
  });

  it('a failed row action leaves the row unchanged and shows an inline error', async () => {
    mockFetch({
      [`GET ${URL}`]: () => ({ body: [msg({ id: 1, summary: 'Quote request' })] }),
      [`PATCH ${URL}/1`]: () => ({ ok: false, body: { error: 'server down' } }),
    });
    render(<BusinessTab />);
    const row = (await screen.findByText('Quote request')).closest('li')!;

    fireEvent.click(within(row).getByRole('button', { name: /mark done/i }));

    expect(await within(row).findByRole('alert')).toHaveTextContent(/server down/i);
    expect(within(row).getByRole('button', { name: /mark done/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/done \(1\)/i)).not.toBeInTheDocument();
  });

  it('deletes a message', async () => {
    mockFetch({
      [`GET ${URL}`]: () => ({ body: [msg({ id: 1, summary: 'Old thread' })] }),
      [`DELETE ${URL}/1`]: () => ({ body: null }),
    });
    render(<BusinessTab />);
    await screen.findByText('Old thread');

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(screen.queryByText('Old thread')).not.toBeInTheDocument());
  });

  describe('voice input', () => {
    afterEach(() => {
      delete (globalThis as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    });

    it('appends the spoken transcript to the textarea', () => {
      let recognition: { onresult?: (e: unknown) => void } | undefined;
      class FakeRecognition {
        onresult?: (e: unknown) => void;
        start() { /* test triggers onresult directly */ }
        constructor() { recognition = this; }
      }
      (globalThis as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
      render(<BusinessTab />);
      const textarea = screen.getByPlaceholderText(/paste a business message/i) as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: 'Hi team,' } });
      fireEvent.click(screen.getByRole('button', { name: /speak/i }));
      act(() => recognition!.onresult!({ results: [[{ transcript: 'the site is down' }]] }));

      expect(textarea.value).toBe('Hi team, the site is down');
    });

    it('does not render the mic button when speech recognition is unsupported', () => {
      render(<BusinessTab />);
      expect(screen.queryByRole('button', { name: /speak/i })).not.toBeInTheDocument();
    });
  });

  describe('filters', () => {
    const seeded = [
      msg({ id: 1, priority: 'urgent', category: 'complaint', summary: 'Outage complaint' }),
      msg({ id: 2, priority: 'urgent', category: 'request', summary: 'Urgent contract request' }),
      msg({ id: 3, priority: 'low', category: 'fyi', summary: 'Newsletter' }),
      msg({ id: 4, priority: 'urgent', category: 'complaint', summary: 'Resolved complaint', status: 'done' }),
    ];

    function pill(group: RegExp, name: string) {
      return within(screen.getByRole('group', { name: group })).getByRole('button', { name });
    }

    function summaries() {
      return screen.getAllByTestId('message-summary').map((el) => el.textContent);
    }

    beforeEach(() => {
      mockFetch({ [`GET ${URL}`]: () => ({ body: seeded }) });
    });

    it('filters by priority, combines with category, and All restores everything', async () => {
      render(<BusinessTab />);
      await screen.findByText('Newsletter');

      fireEvent.click(pill(/priority/i, 'Urgent'));
      expect(summaries()).toEqual(['Outage complaint', 'Urgent contract request', 'Resolved complaint']);

      fireEvent.click(pill(/category/i, 'Complaint'));
      expect(summaries()).toEqual(['Outage complaint', 'Resolved complaint']);
      expect(pill(/category/i, 'Complaint')).toHaveClass('active');

      fireEvent.click(pill(/priority/i, 'All'));
      fireEvent.click(pill(/category/i, 'All'));
      expect(summaries()).toHaveLength(4);
    });

    it('applies to the Done section and shows an empty note when nothing matches', async () => {
      render(<BusinessTab />);
      await screen.findByText('Newsletter');

      fireEvent.click(pill(/category/i, 'FYI'));
      expect(screen.queryByText(/done \(/i)).not.toBeInTheDocument();

      fireEvent.click(pill(/priority/i, 'High'));
      expect(screen.getByText('No messages match these filters.')).toBeInTheDocument();
      expect(screen.queryAllByTestId('message-summary')).toHaveLength(0);
    });

    it('keeps reporting the unfiltered open count while filtered', async () => {
      const onOpenCountChange = vi.fn();
      render(<BusinessTab onOpenCountChange={onOpenCountChange} />);
      await screen.findByText('Newsletter');

      fireEvent.click(pill(/priority/i, 'Low'));

      expect(screen.getAllByTestId('message-summary')).toHaveLength(1);
      expect(onOpenCountChange).toHaveBeenLastCalledWith(3);
      expect(onOpenCountChange).not.toHaveBeenCalledWith(1);
    });
  });

  describe('list / card layout', () => {
    it('defaults to list view and toggles both sections to cards and back', async () => {
      mockFetch({
        [`GET ${URL}`]: () => ({
          body: [msg({ id: 1, summary: 'Open one' }), msg({ id: 2, summary: 'Closed one', status: 'done' })],
        }),
        [`PATCH ${URL}/1`]: () => ({ body: msg({ id: 1, summary: 'Open one', status: 'done' }) }),
      });
      const { container } = render(<BusinessTab />);
      await screen.findByText('Open one');

      expect(screen.getByRole('button', { name: 'List view' })).toHaveClass('active');
      expect(container.querySelectorAll('li.message-row')).toHaveLength(2);

      fireEvent.click(screen.getByRole('button', { name: 'Card view' }));

      expect(screen.getByRole('button', { name: 'Card view' })).toHaveClass('active');
      expect(container.querySelectorAll('ul.entry-cards')).toHaveLength(2);
      expect(container.querySelectorAll('li.message-card')).toHaveLength(2);
      expect(container.querySelectorAll('li.message-row')).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: /mark done: open one/i }));
      await waitFor(() => expect(screen.getByText(/done \(2\)/i)).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'List view' }));
      expect(container.querySelectorAll('li.message-row')).toHaveLength(2);
    });
  });
});
