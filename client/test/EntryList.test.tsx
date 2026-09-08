import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EntryList from '../src/EntryList.js';
import type { Entry } from '../src/api.js';

const entry: Entry = {
  id: 1, raw_text: 'buy milk', domain: 'personal', type: 'task', structured: '{}',
  tags: null, remind_at: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
};

describe('EntryList', () => {
  it('renders each entry\'s text and domain/type', () => {
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('buy milk')).toBeInTheDocument();
    expect(screen.getByText(/personal\/task/)).toBeInTheDocument();
  });

  it('calls onDelete with the entry id when delete is clicked', () => {
    const onDelete = vi.fn();
    render(<EntryList entries={[entry]} onDelete={onDelete} onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('clicking Edit reveals editable fields pre-filled with the entry\'s current values', () => {
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByDisplayValue('buy milk')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /domain/i })).toHaveValue('personal');
    expect(screen.getByRole('combobox', { name: /type/i })).toHaveValue('task');
  });

  it('calls onEdit with the edited fields when Save is clicked', () => {
    const onEdit = vi.fn();
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    fireEvent.change(screen.getByDisplayValue('buy milk'), { target: { value: 'buy oat milk' } });
    fireEvent.change(screen.getByRole('combobox', { name: /domain/i }), { target: { value: 'work' } });
    fireEvent.change(screen.getByRole('combobox', { name: /type/i }), { target: { value: 'note' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEdit).toHaveBeenCalledWith(1, { raw_text: 'buy oat milk', domain: 'work', type: 'note' });
  });

  it('Cancel exits edit mode without calling onEdit', () => {
    const onEdit = vi.fn();
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText('buy milk')).toBeInTheDocument();
  });
});
