import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../src/App.js';

function mockFetch(businessMessages: unknown[] = []) {
  globalThis.fetch = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url === '/api/business-messages' ? businessMessages : []),
  })) as never;
}

describe('App', () => {
  beforeEach(() => mockFetch());

  it('renders the Genie heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Genie' })).toBeInTheDocument();
  });

  it('switches between the Personal and Business tabs', async () => {
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Personal' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText(/type or say something/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Business/ }));

    expect(screen.getByRole('tab', { name: /^Business/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByPlaceholderText(/paste a business message/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/type or say something/i)).not.toBeInTheDocument();
  });

  it('shows the open business message count on the Business tab while on Personal', async () => {
    mockFetch([{ status: 'open' }, { status: 'open' }, { status: 'done' }]);
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Business (2)' })).toBeInTheDocument();
  });
});
