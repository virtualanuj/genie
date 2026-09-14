import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

    fireEvent.click(screen.getByRole('checkbox', { name: /done/i }));

    await waitFor(() => expect(screen.getByText(/done \(1\)/i)).toBeInTheDocument());
    expect(onOpenCountChange).toHaveBeenLastCalledWith(0);
  });

  it('a failed row action leaves the row unchanged and shows an inline error', async () => {
    mockFetch({
      [`GET ${URL}`]: () => ({ body: [msg({ id: 1, summary: 'Quote request' })] }),
      [`PATCH ${URL}/1`]: () => ({ ok: false, body: { error: 'server down' } }),
    });
    render(<BusinessTab />);
    const row = (await screen.findByText('Quote request')).closest('li')!;

    fireEvent.click(within(row).getByRole('checkbox', { name: /done/i }));

    expect(await within(row).findByRole('alert')).toHaveTextContent(/server down/i);
    expect(within(row).getByRole('checkbox', { name: /done/i })).not.toBeChecked();
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
});
