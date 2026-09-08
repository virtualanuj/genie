import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App.js';

describe('App', () => {
  it('renders the Genie heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Genie' })).toBeInTheDocument();
  });
});
